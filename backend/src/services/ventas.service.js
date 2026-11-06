/**
 * ============================================================================
 *  CAPA DE NEGOCIO · Servicio de VENTAS (POS)
 * ----------------------------------------------------------------------------
 *  Registrar una venta es UNA sola transacción SQL:
 *    1. Valida cliente, productos y cantidades.
 *    2. Calcula precios DESDE LA BASE DE DATOS (nunca se confía en el precio
 *       que manda el navegador).
 *    3. Se vende por PAQUETE (x10) o por UNIDAD.
 *    4. Calcula los insumos con la receta (gasto por arepa x arepas vendidas).
 *    5. Inserta venta + detalle, descuenta stock (si no alcanza, cancela todo),
 *       guarda el kardex y suma la compra al cliente (actualiza su rango).
 * ============================================================================
 */
const ventasRepo = require('../repositories/ventas.repository');
const productosRepo = require('../repositories/productos.repository');
const insumosRepo = require('../repositories/insumos.repository');
const clientesRepo = require('../repositories/clientes.repository');
const { withTransaction } = require('../config/database');
const { validar } = require('../utils/validator');
const { badRequest, notFound, conflict } = require('../utils/AppError');

const METODOS_PAGO = ['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia'];
const MODALIDADES = ['paquete', 'unidad'];

const redondear3 = (n) => Math.round(n * 1000) / 1000;

function validarVenta(body) {
    const datos = validar(body, {
        id_cliente: { tipo: 'entero', requerido: true, min: 1, etiqueta: 'El cliente' },
        metodo_pago: { tipo: 'enum', valores: METODOS_PAGO, defecto: 'efectivo', etiqueta: 'El método de pago' },
        items: {
            tipo: 'lista', requerido: true, min: 1, max: 30, etiqueta: 'Producto',
            mensajeMin: 'Agrega al menos un producto a la venta.',
            item: {
                id_producto: { tipo: 'entero', requerido: true, min: 1, etiqueta: 'El producto' },
                modalidad: { tipo: 'enum', valores: MODALIDADES, defecto: 'paquete', etiqueta: 'La modalidad' },
                cantidad: { tipo: 'entero', requerido: true, min: 1, max: 1000, etiqueta: 'La cantidad' }
            }
        }
    });

    // Une líneas repetidas (mismo producto y modalidad)
    const unidas = new Map();
    for (const item of datos.items) {
        const clave = `${item.id_producto}|${item.modalidad}`;
        const previo = unidas.get(clave);
        unidas.set(clave, previo ? { ...previo, cantidad: previo.cantidad + item.cantidad } : { ...item });
    }
    datos.items = [...unidas.values()];
    return datos;
}

/** Arma las líneas con precios oficiales y el consumo total de insumos. */
function prepararLineas(items, productos, recetas) {
    const porId = new Map(productos.map(p => [p.id_producto, p]));
    const lineas = items.map(item => {
        const producto = porId.get(item.id_producto);
        if (!producto || !producto.activo) throw notFound(`El producto #${item.id_producto} no está disponible.`);

        const esUnidad = item.modalidad === 'unidad';
        const precio = esUnidad ? producto.precio_unidad : producto.precio;
        if (!precio) throw badRequest(`"${producto.nombre}" no tiene precio por unidad configurado.`);

        const unidades = esUnidad ? item.cantidad : item.cantidad * producto.unidades_por_paquete;
        return {
            ...item,
            nombre: esUnidad ? `${producto.nombre_corto} (unidad)` : producto.nombre,
            precio_unitario: precio,
            unidades,
            subtotal: Math.round(precio * item.cantidad * 100) / 100
        };
    });

    const consumo = new Map();
    for (const linea of lineas) {
        for (const r of recetas.filter(x => x.id_producto === linea.id_producto)) {
            const previo = consumo.get(r.id_insumo) || { id_insumo: r.id_insumo, insumo: r.insumo, unidad: r.unidad_medida, cantidad: 0 };
            previo.cantidad = redondear3(previo.cantidad + r.cantidad_requerida * linea.unidades);
            consumo.set(r.id_insumo, previo);
        }
    }

    const total = Math.round(lineas.reduce((acc, l) => acc + l.subtotal, 0) * 100) / 100;
    return { lineas, consumo: [...consumo.values()], total };
}

async function registrar(body, usuario) {
    const datos = validarVenta(body);

    return withTransaction(async (tx) => {
        const cliente = await clientesRepo.buscarPorId(datos.id_cliente, tx);
        if (!cliente || !cliente.activo) throw notFound('El cliente seleccionado no existe.');

        // Dentro de una transacción las consultas van una tras otra (misma conexión).
        const ids = [...new Set(datos.items.map(i => i.id_producto))];
        const productos = await productosRepo.buscarPorIds(ids, tx);
        const recetas = await productosRepo.recetas(tx);

        const { lineas, consumo, total } = prepararLineas(datos.items, productos, recetas);

        const venta = await ventasRepo.crear({
            total, metodo_pago: datos.metodo_pago, id_usuario: usuario.id, id_cliente: cliente.id_cliente
        }, tx);

        for (const linea of lineas) {
            await ventasRepo.crearDetalle({ id_venta: venta.id_venta, ...linea }, tx);
        }

        for (const c of consumo) {
            const stock = await insumosRepo.descontar(c.id_insumo, c.cantidad, tx);
            if (stock === null) {
                const actual = await insumosRepo.buscarPorId(c.id_insumo, tx);
                throw conflict(
                    `Stock insuficiente de ${c.insumo}: la venta necesita ${c.cantidad} ${c.unidad} y solo hay ${actual ? actual.stock_actual : 0} ${c.unidad}. No se registró la venta.`,
                    { id_insumo: c.id_insumo }
                );
            }
            await insumosRepo.registrarMovimiento({
                id_insumo: c.id_insumo, tipo: 'venta', cantidad: -c.cantidad, stock_resultante: stock,
                referencia: `Venta #${venta.id_venta}`, id_usuario: usuario.id
            }, tx);
        }

        await clientesRepo.registrarCompra(cliente.id_cliente, total, tx);

        return {
            id_venta: venta.id_venta,
            fecha_hora: venta.fecha_hora,
            total,
            metodo_pago: datos.metodo_pago,
            cliente: { id_cliente: cliente.id_cliente, nombre: cliente.nombre },
            items: lineas.map(({ nombre, modalidad, cantidad, unidades, precio_unitario, subtotal }) =>
                ({ nombre, modalidad, cantidad, unidades, precio_unitario, subtotal })),
            insumos_descontados: consumo
        };
    });
}

async function listar(query) {
    const filtros = validar(query, {
        desde: { tipo: 'fecha', etiqueta: 'La fecha inicial' },
        hasta: { tipo: 'fecha', etiqueta: 'La fecha final' },
        id_cliente: { tipo: 'entero', min: 1 },
        limite: { tipo: 'entero', min: 1, max: 1000, defecto: 100 }
    });
    const [ventas, totales] = await Promise.all([
        ventasRepo.listar(filtros),
        ventasRepo.totalesRango(filtros)
    ]);
    return { ventas, totales };
}

async function obtener(id) {
    const venta = await ventasRepo.buscarPorId(id);
    if (!venta) throw notFound('La venta no existe.');
    return venta;
}

module.exports = { registrar, listar, obtener, prepararLineas, validarVenta, METODOS_PAGO };

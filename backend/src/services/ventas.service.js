/**
 * ============================================================================
 *  CAPA DE NEGOCIO · Servicio de VENTAS (POS), ESTADOS y DEVOLUCIONES
 * ----------------------------------------------------------------------------
 *  Registrar una venta es UNA sola transacción SQL:
 *    1. Valida cliente, productos y cantidades.
 *    2. Calcula precios DESDE LA BASE DE DATOS (nunca se confía en el precio
 *       que manda el navegador).
 *    3. Se vende por PAQUETE (x10) o por UNIDAD.
 *    4. Calcula los insumos con la receta (gasto por arepa x arepas vendidas).
 *    5. Inserta venta + detalle, descuenta stock (si no alcanza, cancela todo)
 *       y guarda el kardex.
 *
 *  Estados de una venta:
 *    pendiente        -> pedido apartado (las arepas ya se prepararon, por eso
 *                        el stock se descuenta), pero aún no se cobra.
 *                        No cuenta en lo vendido ni en el acumulado del cliente.
 *    completada       -> cobrada y entregada.
 *    devuelta_parcial -> se reembolsó una parte.
 *    devuelta         -> se reembolsó todo.
 *
 *  Devoluciones (solo sobre ventas completadas):
 *    tipo   : producto_danado | producto_equivocado | cliente_insatisfecho | otro
 *    accion : reembolso  -> se devuelve el dinero; baja el neto de la venta y
 *                           el acumulado del cliente.
 *             reposicion -> se entrega una arepa nueva; NO se devuelve dinero
 *                           y se descuentan otra vez los insumos de la receta.
 * ============================================================================
 */
const ventasRepo = require('../repositories/ventas.repository');
const productosRepo = require('../repositories/productos.repository');
const insumosRepo = require('../repositories/insumos.repository');
const clientesRepo = require('../repositories/clientes.repository');
const { withTransaction } = require('../config/database');
const { validar } = require('../utils/validator');
const { badRequest, notFound, conflict } = require('../utils/AppError');

const METODOS_PAGO = ['efectivo', 'transferencia']; // el negocio no recibe tarjetas
const MODALIDADES = ['paquete', 'unidad'];
const ESTADOS = ['pendiente', 'completada', 'devuelta_parcial', 'devuelta'];
const TIPOS_DEVOLUCION = ['producto_danado', 'producto_equivocado', 'cliente_insatisfecho', 'otro'];
const ACCIONES_DEVOLUCION = ['reembolso', 'reposicion'];

const redondear2 = (n) => Math.round(n * 100) / 100;
const redondear3 = (n) => Math.round(n * 1000) / 1000;

function validarVenta(body) {
    const datos = validar(body, {
        id_cliente: { tipo: 'entero', requerido: true, min: 1, etiqueta: 'El cliente' },
        metodo_pago: { tipo: 'enum', valores: METODOS_PAGO, defecto: 'efectivo', etiqueta: 'El método de pago' },
        estado: { tipo: 'enum', valores: ['pendiente', 'completada'], defecto: 'completada', etiqueta: 'El estado' },
        observacion: { tipo: 'texto', max: 255, etiqueta: 'La observación' },
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

/** Insumos que gastan N arepas de cada producto, según la receta. */
function calcularConsumo(lineas, recetas) {
    const consumo = new Map();
    for (const linea of lineas) {
        for (const r of recetas.filter(x => x.id_producto === linea.id_producto)) {
            const previo = consumo.get(r.id_insumo) || { id_insumo: r.id_insumo, insumo: r.insumo, unidad: r.unidad_medida, cantidad: 0 };
            previo.cantidad = redondear3(previo.cantidad + r.cantidad_requerida * linea.unidades);
            consumo.set(r.id_insumo, previo);
        }
    }
    return [...consumo.values()];
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
            subtotal: redondear2(precio * item.cantidad)
        };
    });

    const total = redondear2(lineas.reduce((acc, l) => acc + l.subtotal, 0));
    return { lineas, consumo: calcularConsumo(lineas, recetas), total };
}

/** Descuenta insumos de forma atómica y deja el kardex. Si no alcanza: error y ROLLBACK. */
async function descontarInsumos(consumo, { tipo, referencia, usuario, mensaje }, tx) {
    for (const c of consumo) {
        const stock = await insumosRepo.descontar(c.id_insumo, c.cantidad, tx);
        if (stock === null) {
            const actual = await insumosRepo.buscarPorId(c.id_insumo, tx);
            throw conflict(
                `Stock insuficiente de ${c.insumo}: se necesitan ${c.cantidad} ${c.unidad} y solo hay ${actual ? actual.stock_actual : 0} ${c.unidad}. ${mensaje}`,
                { id_insumo: c.id_insumo }
            );
        }
        await insumosRepo.registrarMovimiento({
            id_insumo: c.id_insumo, tipo, cantidad: -c.cantidad, stock_resultante: stock,
            referencia, id_usuario: usuario.id
        }, tx);
    }
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
            total, metodo_pago: datos.metodo_pago, id_usuario: usuario.id, id_cliente: cliente.id_cliente,
            estado: datos.estado, observacion: datos.observacion
        }, tx);

        for (const linea of lineas) {
            await ventasRepo.crearDetalle({ id_venta: venta.id_venta, ...linea }, tx);
        }

        await descontarInsumos(consumo, {
            tipo: 'venta', referencia: `Venta #${venta.id_venta}`, usuario, mensaje: 'No se registró la venta.'
        }, tx);

        // Solo una venta cobrada suma al acumulado y al rango del cliente.
        if (datos.estado === 'completada') {
            await clientesRepo.registrarCompra(cliente.id_cliente, total, tx);
        }

        return {
            id_venta: venta.id_venta,
            fecha_hora: venta.fecha_hora,
            total,
            estado: datos.estado,
            metodo_pago: datos.metodo_pago,
            cliente: { id_cliente: cliente.id_cliente, nombre: cliente.nombre },
            items: lineas.map(({ nombre, modalidad, cantidad, unidades, precio_unitario, subtotal }) =>
                ({ nombre, modalidad, cantidad, unidades, precio_unitario, subtotal })),
            insumos_descontados: consumo
        };
    });
}

/** Pendiente -> completada (se cobra y se entrega). */
async function completar(id, body) {
    const datos = validar(body, {
        metodo_pago: { tipo: 'enum', valores: METODOS_PAGO, defecto: 'efectivo', etiqueta: 'El método de pago' }
    });
    return withTransaction(async (tx) => {
        const venta = await ventasRepo.bloquear(id, tx);
        if (!venta) throw notFound('La venta no existe.');
        if (venta.estado !== 'pendiente') throw conflict(`La venta #${id} no está pendiente (estado: ${venta.estado}).`);

        await ventasRepo.completar(id, datos.metodo_pago, tx);
        if (venta.id_cliente) await clientesRepo.registrarCompra(venta.id_cliente, venta.total, tx);
        return { id_venta: id, estado: 'completada', metodo_pago: datos.metodo_pago, total: venta.total };
    });
}

/** Calcula qué se devuelve, cuánto dinero y si la venta queda devuelta por completo. */
function prepararDevolucion(lineasVenta, itemsDevolucion, accion) {
    const porId = new Map(lineasVenta.map(l => [l.id_detalle, l]));
    const unidas = new Map();
    for (const item of itemsDevolucion) {
        unidas.set(item.id_detalle, (unidas.get(item.id_detalle) || 0) + item.cantidad);
    }

    const lineas = [...unidas.entries()].map(([idDetalle, cantidad]) => {
        const linea = porId.get(idDetalle);
        if (!linea) throw badRequest(`El producto #${idDetalle} no pertenece a esta venta.`);
        const disponible = linea.cantidad - linea.cantidad_devuelta;
        if (cantidad > disponible) {
            throw conflict(`De "${linea.producto}" solo se pueden devolver ${disponible} (se vendieron ${linea.cantidad} y ya se devolvieron ${linea.cantidad_devuelta}).`);
        }
        const unidadesPorCantidad = linea.unidades / linea.cantidad;
        return {
            id_detalle: idDetalle,
            id_producto: linea.id_producto,
            producto: linea.producto,
            cantidad,
            unidades: Math.round(unidadesPorCantidad * cantidad),
            subtotal: redondear2(linea.precio_unitario * cantidad)
        };
    });

    const reembolso = accion === 'reembolso' ? redondear2(lineas.reduce((a, l) => a + l.subtotal, 0)) : 0;
    const devueltoTodo = accion === 'reembolso' && lineasVenta.every(l => {
        const ahora = unidas.get(l.id_detalle) || 0;
        return l.cantidad_devuelta + ahora >= l.cantidad;
    });
    return { lineas, reembolso, devueltoTodo };
}

async function devolver(id, body, usuario) {
    const datos = validar(body, {
        tipo: { tipo: 'enum', requerido: true, valores: TIPOS_DEVOLUCION, etiqueta: 'El tipo de devolución' },
        accion: { tipo: 'enum', requerido: true, valores: ACCIONES_DEVOLUCION, etiqueta: 'La acción' },
        motivo: { tipo: 'texto', max: 255, etiqueta: 'El motivo' },
        items: {
            tipo: 'lista', requerido: true, min: 1, max: 30, etiqueta: 'Producto',
            mensajeMin: 'Indica qué productos se devuelven.',
            item: {
                id_detalle: { tipo: 'entero', requerido: true, min: 1, etiqueta: 'El producto' },
                cantidad: { tipo: 'entero', requerido: true, min: 1, max: 1000, etiqueta: 'La cantidad' }
            }
        }
    });

    return withTransaction(async (tx) => {
        const venta = await ventasRepo.bloquear(id, tx);
        if (!venta) throw notFound('La venta no existe.');
        if (venta.estado === 'pendiente') throw conflict('Una venta pendiente no se puede devolver: primero debe completarse.');
        if (venta.estado === 'devuelta') throw conflict('Esta venta ya fue devuelta por completo.');

        const lineasVenta = await ventasRepo.lineasConDevuelto(id, tx);
        const { lineas, reembolso, devueltoTodo } = prepararDevolucion(lineasVenta, datos.items, datos.accion);

        const devolucion = await ventasRepo.crearDevolucion({
            id_venta: id, tipo: datos.tipo, accion: datos.accion, motivo: datos.motivo,
            total_reembolsado: reembolso, id_usuario: usuario.id
        }, tx);
        for (const l of lineas) {
            await ventasRepo.crearDetalleDevolucion({ id_devolucion: devolucion.id_devolucion, ...l }, tx);
        }

        let insumos = [];
        if (datos.accion === 'reembolso') {
            await ventasRepo.aplicarReembolso(id, reembolso, devueltoTodo, tx);
            if (venta.id_cliente) await clientesRepo.descontarCompra(venta.id_cliente, reembolso, tx);
        } else {
            // Reposición: se prepara una arepa nueva -> vuelve a gastar insumos.
            const recetas = await productosRepo.recetas(tx);
            insumos = calcularConsumo(lineas, recetas);
            await descontarInsumos(insumos, {
                tipo: 'devolucion', referencia: `Reposición devolución #${devolucion.id_devolucion}`, usuario,
                mensaje: 'No se registró la devolución.'
            }, tx);
        }

        return {
            id_devolucion: devolucion.id_devolucion,
            id_venta: id,
            tipo: datos.tipo,
            accion: datos.accion,
            total_reembolsado: reembolso,
            estado_venta: datos.accion === 'reembolso' ? (devueltoTodo ? 'devuelta' : 'devuelta_parcial') : venta.estado,
            items: lineas,
            insumos_descontados: insumos
        };
    });
}

async function listar(query) {
    const filtros = validar(query, {
        desde: { tipo: 'fecha', etiqueta: 'La fecha inicial' },
        hasta: { tipo: 'fecha', etiqueta: 'La fecha final' },
        id_cliente: { tipo: 'entero', min: 1 },
        estado: { tipo: 'enum', valores: ESTADOS, etiqueta: 'El estado' },
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

module.exports = {
    registrar,
    completar,
    devolver,
    listar,
    obtener,
    prepararLineas,
    prepararDevolucion,
    validarVenta,
    calcularConsumo,
    METODOS_PAGO,
    TIPOS_DEVOLUCION,
    ACCIONES_DEVOLUCION
};

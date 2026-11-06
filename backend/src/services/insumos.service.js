/**
 * CAPA DE NEGOCIO · Servicio de INSUMOS Y STOCK
 * Reglas: nombres únicos, cantidades positivas, toda entrada de stock queda en
 * el kardex (movimientos_inventario) con el usuario que la hizo.
 */
const insumosRepo = require('../repositories/insumos.repository');
const { withTransaction } = require('../config/database');
const { validar } = require('../utils/validator');
const { notFound, conflict } = require('../utils/AppError');

const UNIDADES = ['kg', 'g', 'litros', 'ml', 'unidad', 'paquete', 'libra'];
const ETIQUETA_UNIDAD = { kg: 'Kg', g: 'g', litros: 'Litros', ml: 'ml', unidad: 'Unidad', paquete: 'Paquete', libra: 'Libra' };

const REGLAS_BASE = {
    nombre: { tipo: 'texto', requerido: true, min: 2, max: 100, etiqueta: 'El nombre del insumo' },
    unidad_medida: { tipo: 'enum', requerido: true, valores: UNIDADES, etiqueta: 'La unidad de medida' },
    stock_minimo: { tipo: 'numero', requerido: true, min: 0, max: 1000000, decimales: 3, etiqueta: 'El stock mínimo' }
};

const normalizarUnidad = (datos) => ({ ...datos, unidad_medida: ETIQUETA_UNIDAD[datos.unidad_medida] });

async function listar() {
    const [insumos, consumo] = await Promise.all([
        insumosRepo.listar(),
        insumosRepo.consumoPorVentas(7)
    ]);
    return insumos.map(i => {
        const consumo7 = consumo.get(i.id_insumo) || 0;
        const diario = consumo7 / 7;
        return {
            ...i,
            consumo_7_dias: Math.round(consumo7 * 1000) / 1000,
            dias_cobertura: diario > 0 ? Math.floor(i.stock_actual / diario) : null
        };
    });
}

async function crear(body, usuario) {
    const datos = normalizarUnidad(validar(body, {
        ...REGLAS_BASE,
        stock_actual: { tipo: 'numero', min: 0, max: 1000000, decimales: 3, defecto: 0, etiqueta: 'El stock inicial' }
    }));
    const existente = await insumosRepo.buscarPorNombre(datos.nombre);
    if (existente && existente.activo) throw conflict(`Ya existe el insumo "${existente.nombre}".`);

    return withTransaction(async (tx) => {
        let id;
        if (existente) {
            id = existente.id_insumo;
            await insumosRepo.reactivar(id, datos, tx);
        } else {
            id = await insumosRepo.crear({ ...datos, stock_actual: 0 }, tx);
        }
        if (datos.stock_actual > 0) {
            const stock = await insumosRepo.sumar(id, datos.stock_actual, tx);
            await insumosRepo.registrarMovimiento({
                id_insumo: id, tipo: 'entrada', cantidad: datos.stock_actual,
                stock_resultante: stock, referencia: 'Stock inicial', id_usuario: usuario.id
            }, tx);
        }
        return insumosRepo.buscarPorId(id, tx);
    });
}

async function actualizar(id, body) {
    const datos = normalizarUnidad(validar(body, REGLAS_BASE));
    const repetido = await insumosRepo.buscarPorNombre(datos.nombre, id);
    if (repetido) throw conflict(`Ya existe otro insumo llamado "${repetido.nombre}".`);
    const ok = await insumosRepo.actualizar(id, datos);
    if (!ok) throw notFound('El insumo no existe.');
    return insumosRepo.buscarPorId(id);
}

async function eliminar(id) {
    const ok = await insumosRepo.desactivar(id);
    if (!ok) throw notFound('El insumo no existe.');
}

/** Entrada de stock (compra / producción recibida). */
async function registrarEntrada(id, body, usuario) {
    const datos = validar(body, {
        cantidad: { tipo: 'numero', requerido: true, min: 0.001, max: 1000000, decimales: 3, etiqueta: 'La cantidad' },
        nota: { tipo: 'texto', max: 80, etiqueta: 'La nota' }
    });
    return withTransaction(async (tx) => {
        const stock = await insumosRepo.sumar(id, datos.cantidad, tx);
        if (stock === null) throw notFound('El insumo no existe.');
        await insumosRepo.registrarMovimiento({
            id_insumo: id, tipo: 'entrada', cantidad: datos.cantidad, stock_resultante: stock,
            referencia: datos.nota || 'Entrada de stock', id_usuario: usuario.id
        }, tx);
        return insumosRepo.buscarPorId(id, tx);
    });
}

async function movimientos(query) {
    const filtros = validar(query, {
        id_insumo: { tipo: 'entero', min: 1 },
        limite: { tipo: 'entero', min: 1, max: 500, defecto: 50 }
    });
    return insumosRepo.movimientos(filtros);
}

module.exports = { listar, crear, actualizar, eliminar, registrarEntrada, movimientos, UNIDADES };

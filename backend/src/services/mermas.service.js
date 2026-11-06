/**
 * CAPA DE NEGOCIO · Servicio de MERMAS
 * Una merma es una pérdida de insumo: se registra Y se descuenta del stock en la
 * misma transacción (antes solo se guardaba un texto y el inventario no cambiaba).
 */
const mermasRepo = require('../repositories/mermas.repository');
const insumosRepo = require('../repositories/insumos.repository');
const { withTransaction } = require('../config/database');
const { validar } = require('../utils/validator');
const { notFound, conflict } = require('../utils/AppError');

const MOTIVOS = [
    'Producto quemado o mal cocido',
    'Insumo vencido',
    'Daño en empaque o almacenamiento',
    'Contaminación o caída',
    'Error de preparación',
    'Otro'
];

async function listar(query) {
    const filtros = validar(query, {
        limite: { tipo: 'entero', min: 1, max: 500, defecto: 100 },
        dias: { tipo: 'entero', min: 1, max: 3650 }
    });
    const [mermas, resumen] = await Promise.all([
        mermasRepo.listar(filtros),
        mermasRepo.resumenPorInsumo(30)
    ]);
    return { mermas, resumen_30_dias: resumen, motivos: MOTIVOS };
}

async function registrar(body, usuario) {
    const datos = validar(body, {
        id_insumo: { tipo: 'entero', requerido: true, min: 1, etiqueta: 'El insumo' },
        cantidad: { tipo: 'numero', requerido: true, min: 0.001, max: 100000, decimales: 3, etiqueta: 'La cantidad' },
        motivo: { tipo: 'texto', requerido: true, min: 3, max: 120, etiqueta: 'El motivo' },
        observacion: { tipo: 'texto', max: 255, etiqueta: 'La observación' }
    });

    return withTransaction(async (tx) => {
        const insumo = await insumosRepo.buscarPorId(datos.id_insumo, tx);
        if (!insumo || !insumo.activo) throw notFound('El insumo seleccionado no existe.');

        const stock = await insumosRepo.descontar(datos.id_insumo, datos.cantidad, tx);
        if (stock === null) {
            throw conflict(`No puedes registrar ${datos.cantidad} ${insumo.unidad_medida} de merma: solo hay ${insumo.stock_actual} ${insumo.unidad_medida} de ${insumo.nombre}.`);
        }

        const idMerma = await mermasRepo.crear({ ...datos, id_usuario: usuario.id }, tx);
        await insumosRepo.registrarMovimiento({
            id_insumo: datos.id_insumo, tipo: 'merma', cantidad: -datos.cantidad,
            stock_resultante: stock, referencia: `Merma #${idMerma}`, id_usuario: usuario.id
        }, tx);

        return { id_merma: idMerma, insumo: insumo.nombre, unidad_medida: insumo.unidad_medida, stock_resultante: stock };
    });
}

module.exports = { listar, registrar, MOTIVOS };

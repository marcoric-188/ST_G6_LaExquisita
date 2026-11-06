/**
 * CAPA DE NEGOCIO · Servicio de CLIENTES
 * Reglas: nombre obligatorio, documento único (si se escribe), al menos un dato
 * de contacto recomendado, eliminación lógica (no se borra el historial).
 */
const clientesRepo = require('../repositories/clientes.repository');
const { validar } = require('../utils/validator');
const { notFound, conflict } = require('../utils/AppError');

const REGLAS = {
    nombre: { tipo: 'texto', requerido: true, min: 3, max: 100, etiqueta: 'El nombre' },
    documento: { tipo: 'documento', etiqueta: 'El documento (cédula/NIT)' },
    telefono: { tipo: 'telefono', etiqueta: 'El teléfono' },
    correo: { tipo: 'correo', max: 100, etiqueta: 'El correo' },
    direccion: { tipo: 'texto', max: 150, etiqueta: 'La dirección' },
    tipo_cliente: { tipo: 'enum', valores: ['persona', 'negocio'], defecto: 'persona', etiqueta: 'El tipo de cliente' }
};

async function listar(query) {
    const filtros = validar(query, {
        buscar: { tipo: 'texto', max: 100 },
        limite: { tipo: 'entero', min: 1, max: 500, defecto: 200 },
        orden: { tipo: 'enum', valores: ['compras', 'nombre'], defecto: 'compras' }
    });
    const [clientes, estadisticas] = await Promise.all([
        clientesRepo.listar(filtros),
        clientesRepo.estadisticas()
    ]);
    return { clientes, estadisticas };
}

async function obtener(id) {
    const cliente = await clientesRepo.buscarPorId(id);
    if (!cliente || !cliente.activo) throw notFound('El cliente no existe.');
    const compras = await clientesRepo.historialCompras(id, 10);
    return { ...cliente, compras };
}

async function verificarDocumento(documento, excluirId = null) {
    if (!documento) return;
    const existente = await clientesRepo.buscarPorDocumento(documento, excluirId);
    if (existente) {
        throw conflict(`Ya existe un cliente con ese documento: ${existente.nombre}.`, {
            id_cliente: existente.id_cliente
        });
    }
}

async function crear(body) {
    const datos = validar(body, REGLAS);
    await verificarDocumento(datos.documento);
    const id = await clientesRepo.crear(datos);
    return clientesRepo.buscarPorId(id);
}

async function actualizar(id, body) {
    const datos = validar(body, REGLAS);
    await verificarDocumento(datos.documento, id);
    const ok = await clientesRepo.actualizar(id, datos);
    if (!ok) throw notFound('El cliente no existe.');
    return clientesRepo.buscarPorId(id);
}

async function eliminar(id) {
    const ok = await clientesRepo.desactivar(id);
    if (!ok) throw notFound('El cliente no existe.');
}

module.exports = { listar, obtener, crear, actualizar, eliminar };

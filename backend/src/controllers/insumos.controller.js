/** CAPA DE PRESENTACIÓN (API) · Controlador de INSUMOS Y STOCK */
const insumosService = require('../services/insumos.service');
const { validarId } = require('../utils/validator');

module.exports = {
    listar: async (req, res) => res.json({ success: true, data: await insumosService.listar() }),
    crear: async (req, res) => res.status(201).json({ success: true, data: await insumosService.crear(req.body, req.usuario), message: 'Insumo creado.' }),
    actualizar: async (req, res) => res.json({ success: true, data: await insumosService.actualizar(validarId(req.params.id), req.body), message: 'Insumo actualizado.' }),
    eliminar: async (req, res) => {
        await insumosService.eliminar(validarId(req.params.id));
        res.json({ success: true, message: 'Insumo eliminado.' });
    },
    registrarEntrada: async (req, res) => res.json({ success: true, data: await insumosService.registrarEntrada(validarId(req.params.id), req.body, req.usuario), message: 'Entrada de stock registrada.' }),
    movimientos: async (req, res) => res.json({ success: true, data: await insumosService.movimientos(req.query) })
};

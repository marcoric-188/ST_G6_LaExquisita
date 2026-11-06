/** CAPA DE PRESENTACIÓN (API) · Controlador de VENTAS (POS) */
const ventasService = require('../services/ventas.service');
const { validarId } = require('../utils/validator');

module.exports = {
    listar: async (req, res) => res.json({ success: true, data: await ventasService.listar(req.query) }),
    obtener: async (req, res) => res.json({ success: true, data: await ventasService.obtener(validarId(req.params.id)) }),
    registrar: async (req, res) => res.status(201).json({ success: true, data: await ventasService.registrar(req.body, req.usuario), message: 'Venta registrada y stock descontado.' })
};

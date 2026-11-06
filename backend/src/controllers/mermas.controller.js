/** CAPA DE PRESENTACIÓN (API) · Controlador de MERMAS */
const mermasService = require('../services/mermas.service');

module.exports = {
    listar: async (req, res) => res.json({ success: true, data: await mermasService.listar(req.query) }),
    registrar: async (req, res) => res.status(201).json({ success: true, data: await mermasService.registrar(req.body, req.usuario), message: 'Merma registrada y descontada del stock.' })
};

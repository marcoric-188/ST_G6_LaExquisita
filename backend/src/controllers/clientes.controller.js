/** CAPA DE PRESENTACIÓN (API) · Controlador de CLIENTES */
const clientesService = require('../services/clientes.service');
const { validarId } = require('../utils/validator');

module.exports = {
    listar: async (req, res) => res.json({ success: true, data: await clientesService.listar(req.query) }),
    obtener: async (req, res) => res.json({ success: true, data: await clientesService.obtener(validarId(req.params.id)) }),
    crear: async (req, res) => res.status(201).json({ success: true, data: await clientesService.crear(req.body), message: 'Cliente registrado.' }),
    actualizar: async (req, res) => res.json({ success: true, data: await clientesService.actualizar(validarId(req.params.id), req.body), message: 'Cliente actualizado.' }),
    eliminar: async (req, res) => {
        await clientesService.eliminar(validarId(req.params.id));
        res.json({ success: true, message: 'Cliente eliminado.' });
    }
};

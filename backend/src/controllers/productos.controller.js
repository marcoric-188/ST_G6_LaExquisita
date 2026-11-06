/** CAPA DE PRESENTACIÓN (API) · Controlador de PRODUCTOS */
const productosService = require('../services/productos.service');

module.exports = {
    listar: async (req, res) => res.json({ success: true, data: await productosService.listarConDisponibilidad() })
};

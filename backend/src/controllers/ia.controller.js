/** CAPA DE PRESENTACIÓN (API) · Controlador del ASISTENTE IA */
const iaService = require('../services/ia/ia.service');

module.exports = {
    chat: async (req, res) => res.json({ success: true, data: await iaService.preguntar(req.body) })
};

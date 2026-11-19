/** CAPA DE PRESENTACIÓN (API) · Controlador del ASISTENTE IA y de la RED NEURONAL */
const iaService = require('../services/ia/ia.service');
const pronosticoService = require('../services/ia/pronostico.service');

module.exports = {
    chat: async (req, res) => res.json({ success: true, data: await iaService.preguntar(req.body) }),
    pronostico: async (req, res) => res.json({ success: true, data: await pronosticoService.pronosticar() }),
    entrenar: async (req, res) => res.json({ success: true, data: await pronosticoService.entrenar(req.usuario), message: 'Red neuronal entrenada.' })
};

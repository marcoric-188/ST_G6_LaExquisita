/** CAPA DE PRESENTACIÓN (API) · Controlador del PANEL DE INICIO */
const dashboardService = require('../services/dashboard.service');

module.exports = {
    resumen: async (req, res) => res.json({ success: true, data: await dashboardService.resumen() })
};

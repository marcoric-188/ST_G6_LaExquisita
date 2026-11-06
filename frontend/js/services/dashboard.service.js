/** CAPA DE SERVICIOS (frontend) · Panel de inicio */
import { api } from '../core/http.js';

export const dashboardService = {
    resumen: () => api('/dashboard').then(r => r.data)
};

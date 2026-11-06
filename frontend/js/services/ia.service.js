/** CAPA DE SERVICIOS (frontend) · Asistente IA */
import { api } from '../core/http.js';

export const iaService = {
    preguntar: (mensaje, historial) => api('/ia/chat', { metodo: 'POST', cuerpo: { mensaje, historial } }).then(r => r.data)
};

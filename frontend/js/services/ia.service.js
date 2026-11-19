/** CAPA DE SERVICIOS (frontend) · Asistente IA */
import { api } from '../core/http.js';

export const iaService = {
    preguntar: (mensaje, historial) => api('/ia/chat', { metodo: 'POST', cuerpo: { mensaje, historial } }).then(r => r.data),
    pronostico: () => api('/ia/pronostico').then(r => r.data),
    entrenar: () => api('/ia/entrenar', { metodo: 'POST' }).then(r => r.data)
};

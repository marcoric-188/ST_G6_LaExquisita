/** CAPA DE SERVICIOS (frontend) · Mermas */
import { api } from '../core/http.js';

export const mermasService = {
    listar: (filtros = {}) => api('/mermas', { query: filtros }).then(r => r.data),
    registrar: (datos) => api('/mermas', { metodo: 'POST', cuerpo: datos }).then(r => r.data)
};

/** CAPA DE SERVICIOS (frontend) · Clientes */
import { api } from '../core/http.js';

export const clientesService = {
    listar: (filtros = {}) => api('/clientes', { query: filtros }).then(r => r.data),
    buscar: (texto, limite = 8) => api('/clientes', { query: { buscar: texto, limite, orden: 'nombre' } }).then(r => r.data.clientes),
    obtener: (id) => api(`/clientes/${id}`).then(r => r.data),
    crear: (datos) => api('/clientes', { metodo: 'POST', cuerpo: datos }).then(r => r.data),
    actualizar: (id, datos) => api(`/clientes/${id}`, { metodo: 'PUT', cuerpo: datos }).then(r => r.data),
    eliminar: (id) => api(`/clientes/${id}`, { metodo: 'DELETE' })
};

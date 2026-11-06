/** CAPA DE SERVICIOS (frontend) · Insumos, entradas y kardex */
import { api } from '../core/http.js';

export const insumosService = {
    listar: () => api('/insumos').then(r => r.data),
    crear: (datos) => api('/insumos', { metodo: 'POST', cuerpo: datos }).then(r => r.data),
    actualizar: (id, datos) => api(`/insumos/${id}`, { metodo: 'PUT', cuerpo: datos }).then(r => r.data),
    eliminar: (id) => api(`/insumos/${id}`, { metodo: 'DELETE' }),
    registrarEntrada: (id, datos) => api(`/insumos/${id}/entradas`, { metodo: 'POST', cuerpo: datos }).then(r => r.data),
    movimientos: (filtros = {}) => api('/insumos/movimientos', { query: filtros }).then(r => r.data)
};

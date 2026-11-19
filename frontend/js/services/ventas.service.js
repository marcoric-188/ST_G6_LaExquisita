/** CAPA DE SERVICIOS (frontend) · Ventas (POS e historial) */
import { api } from '../core/http.js';

export const ventasService = {
    listar: (filtros = {}) => api('/ventas', { query: filtros }).then(r => r.data),
    obtener: (id) => api(`/ventas/${id}`).then(r => r.data),
    // Solo se envían ids, modalidad y cantidades: el precio lo calcula el servidor.
    registrar: ({ id_cliente, metodo_pago, items, estado = 'completada', observacion = '' }) => api('/ventas', {
        metodo: 'POST',
        cuerpo: {
            id_cliente,
            metodo_pago,
            estado,
            observacion,
            items: items.map(({ id_producto, modalidad, cantidad }) => ({ id_producto, modalidad, cantidad }))
        }
    }).then(r => r.data),
    completar: (id, metodo_pago) => api(`/ventas/${id}/completar`, { metodo: 'POST', cuerpo: { metodo_pago } }).then(r => r.data),
    devolver: (id, datos) => api(`/ventas/${id}/devoluciones`, { metodo: 'POST', cuerpo: datos }).then(r => r.data)
};

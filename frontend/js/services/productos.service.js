/** CAPA DE SERVICIOS (frontend) · Productos (con disponibilidad según stock) */
import { api } from '../core/http.js';

export const productosService = {
    listar: () => api('/productos').then(r => r.data)
};

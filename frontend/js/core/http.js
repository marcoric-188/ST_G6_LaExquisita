/**
 * CAPA CORE · Cliente HTTP
 * Única función que habla con el backend (fetch). Los servicios la usan.
 *  - Envía y recibe JSON.
 *  - La sesión viaja en una cookie httpOnly (el JS no puede leerla: protege de XSS).
 *  - Traduce los errores a mensajes claros y avisa eventos globales.
 */
import { API_BASE } from './config.js';
import { emitir } from './store.js';

export class ApiError extends Error {
    constructor(mensaje, status, detalles) {
        super(mensaje);
        this.status = status;
        this.detalles = detalles || null;
    }
}

export async function api(ruta, { metodo = 'GET', cuerpo, query } = {}) {
    const url = new URL(API_BASE + ruta, location.origin);
    if (query) {
        Object.entries(query).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
        });
    }

    let respuesta;
    try {
        respuesta = await fetch(url, {
            method: metodo,
            credentials: 'include',
            headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
            body: cuerpo ? JSON.stringify(cuerpo) : undefined
        });
    } catch (_) {
        throw new ApiError('No hay conexión con el servidor. Verifica que el backend esté corriendo (npm start en la carpeta backend).', 0);
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (_) { /* respuesta sin JSON */ }

    if (!respuesta.ok || (datos && datos.success === false)) {
        const mensaje = (datos && datos.error) || `Error ${respuesta.status}`;
        const detalles = datos && datos.detalles;
        if (respuesta.status === 401 && !ruta.startsWith('/auth/login')) emitir('sesion-expirada', mensaje);
        if (respuesta.status === 403 && detalles && detalles.codigo === 'CAMBIAR_PASSWORD') emitir('cambiar-password');
        if (respuesta.status === 503) emitir('bd-desconectada', detalles);
        throw new ApiError(mensaje, respuesta.status, detalles);
    }
    return datos;
}

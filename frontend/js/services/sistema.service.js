/** CAPA DE SERVICIOS (frontend) · Estado del servidor y de SQL Server */
import { API_BASE } from '../core/config.js';

export const sistemaService = {
    async estado() {
        try {
            const r = await fetch(`${API_BASE}/health`, { credentials: 'include' });
            return await r.json();
        } catch (_) {
            return { success: false, base_de_datos: { conectada: false, sugerencia: 'El backend no responde. Ejecuta "npm start" en la carpeta backend.' } };
        }
    }
};

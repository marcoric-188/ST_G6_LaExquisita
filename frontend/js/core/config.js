/**
 * CAPA CORE · Configuración del frontend
 * Normalmente el backend sirve esta página (http://localhost:3000) y la API está
 * en el mismo origen (/api). Si se usa Live Server de VS Code (puerto 5500),
 * se apunta al backend en el puerto 3000.
 */
const PUERTOS_LIVE_SERVER = ['5500', '5501', '5502', '8080'];

export const API_BASE = PUERTOS_LIVE_SERVER.includes(location.port)
    ? `${location.protocol}//${location.hostname}:3000/api`
    : '/api';

export const ROLES = {
    ADMIN: 'administrador',
    CAJERO: 'cajero',
    COCINA: 'cocina'
};

/** CAPA DE SERVICIOS (frontend) · Autenticación */
import { api } from '../core/http.js';

export const authService = {
    login: (correo, password) => api('/auth/login', { metodo: 'POST', cuerpo: { correo, password } }).then(r => r.data),
    logout: () => api('/auth/logout', { metodo: 'POST' }),
    perfil: () => api('/auth/me').then(r => r.data),
    cambiarPassword: (actual, nueva) => api('/auth/cambiar-password', { metodo: 'POST', cuerpo: { actual, nueva } })
};

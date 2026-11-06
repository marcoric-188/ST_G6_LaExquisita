/**
 * CAPA DE PRESENTACIÓN (API) · Controlador de AUTENTICACIÓN
 * Los controladores solo traducen HTTP <-> servicio: leen req, llaman al
 * servicio y responden JSON. No tienen reglas de negocio ni SQL.
 */
const env = require('../config/env');
const authService = require('../services/auth.service');
const { validar } = require('../utils/validator');

const opcionesCookie = () => ({
    httpOnly: true,                 // JavaScript del navegador no puede leerla (protege de XSS)
    sameSite: 'strict',             // no viaja en peticiones de otros sitios (protege de CSRF)
    secure: env.isProd,             // solo HTTPS en producción
    path: '/',
    maxAge: env.auth.horasSesion * 60 * 60 * 1000
});

async function login(req, res) {
    const { correo, password } = validar(req.body, {
        correo: { tipo: 'correo', requerido: true, max: 100, etiqueta: 'El correo' },
        password: { tipo: 'password', requerido: true, etiqueta: 'La contraseña' }
    });
    const { token, usuario } = await authService.login(correo, password);
    res.cookie(env.auth.cookieName, token, opcionesCookie());
    res.json({ success: true, data: usuario });
}

function logout(req, res) {
    res.clearCookie(env.auth.cookieName, { path: '/' });
    res.json({ success: true, message: 'Sesión cerrada.' });
}

function me(req, res) {
    res.json({ success: true, data: req.usuario });
}

async function cambiarPassword(req, res) {
    const { actual, nueva } = validar(req.body, {
        actual: { tipo: 'password', requerido: true, etiqueta: 'La contraseña actual' },
        nueva: { tipo: 'password', requerido: true, etiqueta: 'La nueva contraseña' }
    });
    await authService.cambiarPassword(req.usuario.id, actual, nueva);
    res.json({ success: true, message: 'Contraseña actualizada.' });
}

module.exports = { login, logout, me, cambiarPassword };

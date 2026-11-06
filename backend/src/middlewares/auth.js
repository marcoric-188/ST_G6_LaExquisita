/**
 * ============================================================================
 *  CAPA TRANSVERSAL · Autenticación y autorización
 * ----------------------------------------------------------------------------
 *  autenticar  -> exige una sesión válida (cookie httpOnly con JWT firmado).
 *                 Verifica en la BD que el usuario siga activo.
 *  autorizar   -> exige uno de los roles indicados.
 *
 *  Roles:
 *    administrador : todo
 *    cajero        : POS, clientes, ventas, consulta de stock, IA
 *    cocina        : insumos, entradas de stock, mermas, IA
 * ============================================================================
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const usuariosRepo = require('../repositories/usuarios.repository');
const { unauthorized, forbidden, AppError } = require('../utils/AppError');

const RUTAS_SIN_CAMBIO_PASSWORD = ['/api/auth/me', '/api/auth/logout', '/api/auth/cambiar-password'];

async function autenticar(req, res, next) {
    try {
        const token = req.cookies && req.cookies[env.auth.cookieName];
        if (!token) throw unauthorized();

        let payload;
        try {
            payload = jwt.verify(token, env.auth.jwtSecret, { algorithms: ['HS256'] });
        } catch (_) {
            res.clearCookie(env.auth.cookieName, { path: '/' });
            throw unauthorized('Tu sesión expiró. Inicia sesión de nuevo.');
        }

        const usuario = await usuariosRepo.buscarPorId(Number(payload.sub));
        if (!usuario || !usuario.activo) {
            res.clearCookie(env.auth.cookieName, { path: '/' });
            throw unauthorized('Tu usuario no está activo.');
        }

        req.usuario = {
            id: usuario.id_usuario,
            nombre: usuario.nombre,
            correo: usuario.correo,
            rol: usuario.rol,
            debe_cambiar_password: usuario.debe_cambiar_password
        };

        // Seguridad: con la contraseña temporal solo se puede cambiar la contraseña.
        if (usuario.debe_cambiar_password && !RUTAS_SIN_CAMBIO_PASSWORD.includes(req.originalUrl.split('?')[0])) {
            throw new AppError(403, 'Debes cambiar tu contraseña temporal antes de continuar.', { codigo: 'CAMBIAR_PASSWORD' });
        }
        next();
    } catch (error) {
        next(error);
    }
}

const autorizar = (...roles) => (req, res, next) => {
    if (!req.usuario) return next(unauthorized());
    if (!roles.includes(req.usuario.rol)) return next(forbidden());
    next();
};

module.exports = { autenticar, autorizar };

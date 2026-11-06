/**
 * ============================================================================
 *  CAPA DE NEGOCIO · Servicio de AUTENTICACIÓN
 * ----------------------------------------------------------------------------
 *  - Contraseñas con hash bcrypt (nunca en texto plano).
 *  - Mensaje genérico ante error (no revela si el correo existe).
 *  - Bloqueo temporal tras 5 intentos fallidos.
 *  - Política de contraseña: mínimo 8 caracteres, con letras y números.
 * ============================================================================
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const usuariosRepo = require('../repositories/usuarios.repository');
const { AppError, badRequest, unauthorized } = require('../utils/AppError');

const PASSWORD_TEMPORAL = 'LaExquisita2026*';
// Hash de relleno para que el tiempo de respuesta sea igual exista o no el correo.
const HASH_RELLENO = '$2b$10$J4ZSO3rvDyz3sYRJuVcvIOD1/QCNr7KHXMy9sn8XbfnKAZAOYywzi';

function validarPolitica(password) {
    if (typeof password !== 'string' || password.length < 8) {
        throw badRequest('La contraseña debe tener mínimo 8 caracteres.');
    }
    if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
        throw badRequest('La contraseña debe combinar letras y números.');
    }
    if (password === PASSWORD_TEMPORAL) {
        throw badRequest('No puedes usar la contraseña temporal. Elige una nueva.');
    }
}

function perfilPublico(usuario) {
    return {
        id: usuario.id_usuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        debe_cambiar_password: Boolean(usuario.debe_cambiar_password)
    };
}

async function login(correo, password) {
    const usuario = await usuariosRepo.buscarPorCorreo(correo);

    if (usuario && usuario.segundos_bloqueo > 0) {
        const minutos = Math.ceil(usuario.segundos_bloqueo / 60);
        throw new AppError(423, `Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} minuto(s).`);
    }

    const valida = await bcrypt.compare(password, (usuario && usuario.password_hash) || HASH_RELLENO);

    if (!usuario || !usuario.activo || !usuario.password_hash || !valida) {
        if (usuario && usuario.activo) {
            const r = await usuariosRepo.registrarIntentoFallido(usuario.id_usuario, env.auth.maxIntentos, env.auth.minutosBloqueo);
            if (r && r.bloqueado) {
                throw new AppError(423, `Demasiados intentos fallidos. La cuenta quedó bloqueada ${env.auth.minutosBloqueo} minutos.`);
            }
        }
        throw unauthorized('Correo o contraseña incorrectos.');
    }

    await usuariosRepo.registrarAccesoExitoso(usuario.id_usuario);

    const token = jwt.sign(
        { sub: String(usuario.id_usuario), rol: usuario.rol },
        env.auth.jwtSecret,
        { algorithm: 'HS256', expiresIn: `${env.auth.horasSesion}h` }
    );
    return { token, usuario: perfilPublico(usuario) };
}

async function cambiarPassword(idUsuario, actual, nueva) {
    validarPolitica(nueva);
    const hashActual = await usuariosRepo.obtenerHash(idUsuario);
    if (!hashActual || !(await bcrypt.compare(actual, hashActual))) {
        throw badRequest('La contraseña actual no es correcta.');
    }
    if (await bcrypt.compare(nueva, hashActual)) {
        throw badRequest('La nueva contraseña debe ser diferente a la actual.');
    }
    const hash = await bcrypt.hash(nueva, 10);
    await usuariosRepo.actualizarPassword(idUsuario, hash, false);
}

const hashPassword = (password) => bcrypt.hash(password, 10);

module.exports = { login, cambiarPassword, validarPolitica, perfilPublico, hashPassword };

/**
 * UTILIDAD TRANSVERSAL · Errores controlados
 * Un AppError lleva un código HTTP y un mensaje seguro para mostrar al usuario.
 * Cualquier otro error se considera interno y su detalle NO se envía al navegador.
 */
class AppError extends Error {
    constructor(status, message, detalles) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.publico = true;
        if (detalles) this.detalles = detalles;
    }
}

module.exports = {
    AppError,
    badRequest: (msg, detalles) => new AppError(400, msg, detalles),
    unauthorized: (msg = 'Debes iniciar sesión.') => new AppError(401, msg),
    forbidden: (msg = 'No tienes permiso para realizar esta acción.') => new AppError(403, msg),
    notFound: (msg = 'Registro no encontrado.') => new AppError(404, msg),
    conflict: (msg, detalles) => new AppError(409, msg, detalles)
};

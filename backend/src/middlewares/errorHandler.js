/**
 * CAPA TRANSVERSAL · Manejo central de errores
 * Convierte cualquier error en una respuesta JSON uniforme:
 *   { success: false, error: "mensaje para el usuario", detalles? }
 * Los errores internos se registran en consola pero NO se exponen al navegador.
 */
function noEncontrado(req, res) {
    res.status(404).json({ success: false, error: `La ruta ${req.method} ${req.originalUrl} no existe.` });
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(error, req, res, next) {
    // JSON mal formado enviado por el cliente
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'El cuerpo de la petición no es un JSON válido.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ success: false, error: 'La petición es demasiado grande.' });
    }

    if (error.publico) {
        const cuerpo = { success: false, error: error.message };
        if (error.detalles) cuerpo.detalles = error.detalles;
        return res.status(error.status || 400).json(cuerpo);
    }

    // Se cayó la conexión con SQL Server en pleno uso (servicio detenido, red, etc.)
    const codigo = error.code || (error.originalError && error.originalError.code);
    if (error.name === 'ConnectionError' || ['ESOCKET', 'ECONNCLOSED', 'ETIMEOUT', 'ENOTOPEN', 'ECONNRESET', 'ENOTFOUND'].includes(codigo)) {
        console.error(`⚠️  [${req.method} ${req.originalUrl}] Conexión con SQL Server: ${error.message}`);
        return res.status(503).json({
            success: false,
            error: 'Se perdió la conexión con SQL Server. Verifica que el servicio esté encendido e intenta de nuevo.',
            detalles: { sugerencia: 'Revisa en "Servicios" de Windows que SQL Server esté en ejecución.' }
        });
    }

    // Errores de SQL Server traducidos (números de error estándar)
    const numero = error.number || (error.originalError && error.originalError.info && error.originalError.info.number);
    if (numero === 2627 || numero === 2601) {
        return res.status(409).json({ success: false, error: 'Ya existe un registro con ese dato (documento o correo duplicado).' });
    }
    if (numero === 547) {
        console.error(`[${req.method} ${req.originalUrl}]`, error.message);
        return res.status(409).json({ success: false, error: 'La operación viola una regla de la base de datos (dato relacionado inexistente o valor no permitido).' });
    }

    console.error(`❌ [${req.method} ${req.originalUrl}]`, error);
    res.status(500).json({ success: false, error: 'Ocurrió un error interno. Revisa la consola del backend.' });
}

module.exports = { noEncontrado, manejadorErrores };

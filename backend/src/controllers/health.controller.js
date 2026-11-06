/** CAPA DE PRESENTACIÓN (API) · Estado del servidor y de la conexión a SQL Server */
const database = require('../config/database');
const env = require('../config/env');

module.exports = {
    estado: async (req, res) => {
        const responde = await database.ping();
        const db = database.estado();
        db.conectada = db.conectada && responde;
        res.status(db.conectada ? 200 : 503).json({
            success: db.conectada,
            servidor: 'La Exquisita API',
            base_de_datos: {
                conectada: db.conectada,
                servidor: db.servidor,
                base: db.base,
                autenticacion: db.auth,
                driver: db.driver,
                migracion: db.migracion ? { ok: db.migracion.ok, fecha: db.migracion.fecha, error: env.isProd ? undefined : db.migracion.error } : null,
                // El detalle técnico solo se muestra en desarrollo (no se filtra en producción)
                error: db.conectada || env.isProd ? null : db.ultimoError,
                sugerencia: db.conectada ? null : db.sugerencia
            }
        });
    }
};

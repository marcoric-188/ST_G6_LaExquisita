/**
 * ============================================================================
 *  CAPA DE CONFIGURACIÓN · Variables de entorno
 * ----------------------------------------------------------------------------
 *  Lee el archivo backend/.env y entrega una configuración validada al resto
 *  de capas. Ningún secreto (contraseñas, llaves) se escribe en el código.
 * ============================================================================
 */
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const bool = (valor, porDefecto) => {
    if (valor === undefined || valor === '') return porDefecto;
    return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(valor).trim().toLowerCase());
};

const isProd = process.env.NODE_ENV === 'production';

// Secreto para firmar las sesiones (JWT). En desarrollo, si no existe, se genera
// uno aleatorio en cada arranque (las sesiones se cierran al reiniciar).
let jwtSecret = process.env.JWT_SECRET || '';
let jwtSecretGenerado = false;
if (jwtSecret.length < 32) {
    if (isProd) {
        throw new Error('JWT_SECRET es obligatorio en producción y debe tener mínimo 32 caracteres.');
    }
    jwtSecret = crypto.randomBytes(48).toString('hex');
    jwtSecretGenerado = true;
}

const dbName = process.env.DB_NAME || 'la_exquisita_db';
if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(dbName)) {
    throw new Error('DB_NAME solo puede tener letras, números y guion bajo.');
}

module.exports = Object.freeze({
    isProd,
    port: Number(process.env.PORT) || 3000,

    db: {
        // windows -> Autenticación de Windows (msnodesqlv8 + ODBC). Es la que usa el equipo.
        // sql     -> Usuario y contraseña de SQL Server (driver tedious, no necesita ODBC).
        auth: (process.env.DB_AUTH || 'windows').trim().toLowerCase(),
        server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
        instance: process.env.DB_INSTANCE || '',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        database: dbName,
        user: process.env.DB_USER || '',
        password: process.env.DB_PASSWORD || '',
        odbcDriver: process.env.DB_ODBC_DRIVER || '',
        encrypt: bool(process.env.DB_ENCRYPT, false),
        trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
        autoMigrate: bool(process.env.DB_AUTO_MIGRATE, true),
        reintentoSegundos: Number(process.env.DB_RETRY_SECONDS) || 15
    },

    auth: {
        jwtSecret,
        jwtSecretGenerado,
        horasSesion: Number(process.env.SESSION_HOURS) || 8,
        cookieName: 'lx_session',
        maxIntentos: 5,
        minutosBloqueo: 15
    },

    ia: {
        // auto -> usa OpenAI si hay OPENAI_API_KEY; si no, el motor local (sin internet).
        proveedor: (process.env.IA_PROVEEDOR || 'auto').trim().toLowerCase(),
        openaiKey: process.env.OPENAI_API_KEY || '',
        openaiModel: process.env.OPENAI_MODEL || 'gpt-5.5'
    },

    // Orígenes extra permitidos (por ejemplo Live Server de VS Code en el puerto 5500)
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
        .split(',').map(o => o.trim()).filter(Boolean)
});

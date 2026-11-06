/**
 * ============================================================================
 *  CAPA TRANSVERSAL · Middlewares de seguridad
 * ----------------------------------------------------------------------------
 *  - Cabeceras seguras (helmet + Content-Security-Policy): bloquea scripts
 *    externos o inyectados (XSS), clickjacking y sniffing de tipos.
 *  - Límite de peticiones (rate limit): frena ataques de fuerza bruta.
 *  - Solo JSON en escrituras: un formulario de otro sitio no puede enviar
 *    peticiones a la API (defensa extra contra CSRF).
 *  - CORS solo para orígenes conocidos.
 * ============================================================================
 */
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

const cabecerasSeguras = helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            // Todo se sirve desde el propio servidor (fuentes e íconos en frontend/vendor)
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", 'data:'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: env.isProd ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: env.isProd
});

const respuestaLimite = (mensaje) => (req, res) =>
    res.status(429).json({ success: false, error: mensaje });

const limiteGeneral = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: respuestaLimite('Demasiadas peticiones. Espera un momento e intenta de nuevo.')
});

const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: respuestaLimite('Demasiados intentos de inicio de sesión. Espera 15 minutos.')
});

const limiteIA = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: respuestaLimite('Has hecho muchas preguntas seguidas al asistente. Espera un minuto.')
});

function soloJson(req, res, next) {
    const tieneCuerpo = Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding']);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && tieneCuerpo && !req.is('application/json')) {
        return res.status(415).json({ success: false, error: 'La API solo acepta JSON.' });
    }
    next();
}

function sinCache(req, res, next) {
    res.set('Cache-Control', 'no-store');
    next();
}

/** CORS mínimo: solo los orígenes de CORS_ORIGINS (mismo origen siempre funciona). */
function cors(req, res, next) {
    const origen = req.headers.origin;
    if (origen && env.corsOrigins.includes(origen)) {
        res.set({
            'Access-Control-Allow-Origin': origen,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            Vary: 'Origin'
        });
        if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
}

module.exports = { cabecerasSeguras, limiteGeneral, limiteLogin, limiteIA, soloJson, sinCache, cors };

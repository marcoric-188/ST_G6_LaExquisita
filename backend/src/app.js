/**
 * ============================================================================
 *  LA EXQUISITA · Aplicación Express
 * ----------------------------------------------------------------------------
 *  ARQUITECTURA POR CAPAS DEL BACKEND (ver docs/ARQUITECTURA.md)
 *
 *    Petición HTTP
 *       │
 *       ▼
 *    [Middlewares]   seguridad: helmet/CSP, rate limit, CORS, JSON, sesión, roles
 *       ▼
 *    [Rutas]         src/routes        -> qué URL existe y quién puede usarla
 *       ▼
 *    [Controladores] src/controllers   -> traduce HTTP <-> servicio
 *       ▼
 *    [Servicios]     src/services      -> reglas de negocio y transacciones
 *       ▼
 *    [Repositorios]  src/repositories  -> único lugar con SQL (parametrizado)
 *       ▼
 *    [SQL Server]    database/*.sql    -> tablas, vistas y restricciones
 *
 *  Además, este mismo servidor entrega el frontend (carpeta /frontend), así
 *  todo corre en http://localhost:3000 sin problemas de CORS.
 * ============================================================================
 */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { cabecerasSeguras, limiteGeneral, soloJson, sinCache, cors } = require('./middlewares/security');
const { noEncontrado, manejadorErrores } = require('./middlewares/errorHandler');
const rutas = require('./routes');

const CARPETA_FRONTEND = path.join(__dirname, '..', '..', 'frontend');

function registroPeticiones(req, res, next) {
    const inicio = Date.now();
    res.on('finish', () => {
        if (req.originalUrl.startsWith('/api')) {
            console.log(`${new Date().toLocaleTimeString('es-CO')}  ${req.method.padEnd(6)} ${req.originalUrl.split('?')[0]} → ${res.statusCode} (${Date.now() - inicio} ms)`);
        }
    });
    next();
}

function crearApp() {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 'loopback');

    app.use(cabecerasSeguras);
    app.use(registroPeticiones);

    // API
    app.use('/api', cors, limiteGeneral, sinCache, soloJson,
        express.json({ limit: '100kb' }), cookieParser(), rutas);
    app.use('/api', noEncontrado);

    // Frontend estático
    app.use(express.static(CARPETA_FRONTEND, {
        index: 'index.html',
        maxAge: env.isProd ? '1h' : 0,
        dotfiles: 'deny'
    }));

    app.use(manejadorErrores);
    return app;
}

module.exports = { crearApp, CARPETA_FRONTEND };

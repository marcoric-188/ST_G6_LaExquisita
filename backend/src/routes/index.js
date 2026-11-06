/**
 * ============================================================================
 *  CAPA DE PRESENTACIÓN (API) · Definición de rutas y permisos
 * ----------------------------------------------------------------------------
 *  Cada ruta declara: método + URL + quién puede usarla + controlador.
 *
 *  Pública:      GET  /api/health, POST /api/auth/login
 *  Con sesión:   todo lo demás (middleware autenticar)
 *  Por rol:      autorizar('administrador', 'cajero', ...)
 * ============================================================================
 */
const express = require('express');
const h = require('../utils/asyncHandler');
const { autenticar, autorizar } = require('../middlewares/auth');
const { limiteLogin, limiteIA } = require('../middlewares/security');

const health = require('../controllers/health.controller');
const auth = require('../controllers/auth.controller');
const dashboard = require('../controllers/dashboard.controller');
const productos = require('../controllers/productos.controller');
const clientes = require('../controllers/clientes.controller');
const insumos = require('../controllers/insumos.controller');
const mermas = require('../controllers/mermas.controller');
const ventas = require('../controllers/ventas.controller');
const ia = require('../controllers/ia.controller');

const ADMIN = 'administrador';
const CAJERO = 'cajero';
const COCINA = 'cocina';
const TODOS = [ADMIN, CAJERO, COCINA];

const router = express.Router();

/* ---------- Públicas ---------- */
router.get('/health', h(health.estado));
router.post('/auth/login', limiteLogin, h(auth.login));
router.post('/auth/logout', auth.logout);

/* ---------- Requieren sesión ---------- */
router.use(autenticar);

router.get('/auth/me', auth.me);
router.post('/auth/cambiar-password', limiteLogin, h(auth.cambiarPassword));

router.get('/dashboard', autorizar(...TODOS), h(dashboard.resumen));
router.get('/productos', autorizar(...TODOS), h(productos.listar));

router.get('/clientes', autorizar(ADMIN, CAJERO), h(clientes.listar));
router.get('/clientes/:id', autorizar(ADMIN, CAJERO), h(clientes.obtener));
router.post('/clientes', autorizar(ADMIN, CAJERO), h(clientes.crear));
router.put('/clientes/:id', autorizar(ADMIN, CAJERO), h(clientes.actualizar));
router.delete('/clientes/:id', autorizar(ADMIN), h(clientes.eliminar));

router.get('/insumos', autorizar(...TODOS), h(insumos.listar));
router.get('/insumos/movimientos', autorizar(...TODOS), h(insumos.movimientos));
router.post('/insumos', autorizar(ADMIN, COCINA), h(insumos.crear));
router.put('/insumos/:id', autorizar(ADMIN, COCINA), h(insumos.actualizar));
router.post('/insumos/:id/entradas', autorizar(ADMIN, COCINA), h(insumos.registrarEntrada));
router.delete('/insumos/:id', autorizar(ADMIN), h(insumos.eliminar));

router.get('/mermas', autorizar(...TODOS), h(mermas.listar));
router.post('/mermas', autorizar(ADMIN, COCINA), h(mermas.registrar));

router.get('/ventas', autorizar(ADMIN, CAJERO), h(ventas.listar));
router.get('/ventas/:id', autorizar(ADMIN, CAJERO), h(ventas.obtener));
router.post('/ventas', autorizar(ADMIN, CAJERO), h(ventas.registrar));

router.post('/ia/chat', autorizar(...TODOS), limiteIA, h(ia.chat));

module.exports = router;

/**
 * ============================================================================
 *  PRUEBAS DE INTEGRACIÓN · Procesos transaccionales contra la API real
 * ----------------------------------------------------------------------------
 *  Requisitos:
 *    1. El backend corriendo (npm start) y conectado a SQL Server.
 *    2. En backend/.env:  PRUEBA_CORREO=marcori@gmail.com  PRUEBA_PASSWORD=<su clave>
 *  Ejecutar (en otra terminal):  npm run test:api
 *
 *  Cada prueba verifica el resultado EN LA BASE DE DATOS (a través de la API):
 *  stock, totales netos, estados y reglas que deben rechazarse.
 *  Crea un cliente "Prueba automática ..." y algunas ventas de prueba.
 * ============================================================================
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.PRUEBA_API || `http://localhost:${process.env.PORT || 3000}/api`;
const CORREO = process.env.PRUEBA_CORREO || 'marcori@gmail.com';
const PASSWORD = process.env.PRUEBA_PASSWORD;
let cookie = '';

async function llamar(ruta, { metodo = 'GET', cuerpo, sinSesion = false } = {}) {
    const res = await fetch(API + ruta, {
        method: metodo,
        headers: {
            ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
            ...(cookie && !sinSesion ? { Cookie: cookie } : {})
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const datos = await res.json().catch(() => ({}));
    return { status: res.status, ...datos };
}

const stockDe = async (nombre) => (await llamar('/insumos')).data.find(i => i.nombre === nombre);
const ctx = {};

test('PI-01 · El servidor está conectado a SQL Server', async () => {
    const r = await llamar('/health', { sinSesion: true });
    assert.equal(r.status, 200, 'El backend debe estar corriendo y conectado');
    assert.equal(r.base_de_datos.conectada, true);
});

test('PI-02 · Seguridad: sin sesión la API responde 401', async () => {
    const r = await llamar('/ventas', { sinSesion: true });
    assert.equal(r.status, 401);
});

test('PI-03 · Seguridad: contraseña incorrecta es rechazada', async () => {
    const r = await llamar('/auth/login', { metodo: 'POST', cuerpo: { correo: CORREO, password: 'clave-incorrecta-123' }, sinSesion: true });
    assert.equal(r.status, 401);
    cookie = '';
});

test('PI-04 · Inicio de sesión correcto', { skip: !PASSWORD && 'Define PRUEBA_PASSWORD en backend/.env' }, async () => {
    const r = await llamar('/auth/login', { metodo: 'POST', cuerpo: { correo: CORREO, password: PASSWORD } });
    assert.equal(r.status, 200, r.error);
    assert.ok(cookie.startsWith('lx_session='));
});

test('PI-05 · Registrar cliente y rechazar documento duplicado', { skip: !PASSWORD }, async () => {
    const documento = String(Date.now()).slice(-9);
    const r = await llamar('/clientes', { metodo: 'POST', cuerpo: { nombre: `Prueba automática ${documento}`, documento, telefono: '3000000000' } });
    assert.equal(r.status, 201, r.error);
    ctx.cliente = r.data;
    const dup = await llamar('/clientes', { metodo: 'POST', cuerpo: { nombre: 'Duplicado', documento } });
    assert.equal(dup.status, 409);
});

test('PI-06 · Venta completada: precio desde la BD y descuento de insumos por receta', { skip: !PASSWORD }, async () => {
    const productos = (await llamar('/productos')).data;
    ctx.grande = productos.find(p => p.tamano === 'grande');
    const receta = ctx.grande.receta.find(r => r.insumo.startsWith('Ma'));
    const antes = await stockDe(receta.insumo);
    const r = await llamar('/ventas', { metodo: 'POST', cuerpo: {
        id_cliente: ctx.cliente.id_cliente, metodo_pago: 'efectivo',
        items: [{ id_producto: ctx.grande.id_producto, modalidad: 'paquete', cantidad: 1, precio: 1 }]
    } });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.data.total, ctx.grande.precio, 'el precio enviado por el navegador se ignora');
    const despues = await stockDe(receta.insumo);
    const esperado = Math.round((antes.stock_actual - receta.cantidad_por_unidad * 10) * 1000) / 1000;
    assert.equal(despues.stock_actual, esperado);
    ctx.ventaCompletada = r.data.id_venta;
});

test('PI-07 · Stock insuficiente: la venta se cancela completa (rollback)', { skip: !PASSWORD }, async () => {
    const antes = await llamar('/ventas?limite=1');
    const r = await llamar('/ventas', { metodo: 'POST', cuerpo: {
        id_cliente: ctx.cliente.id_cliente, items: [{ id_producto: ctx.grande.id_producto, cantidad: 1000 }]
    } });
    assert.equal(r.status, 409);
    assert.match(r.error, /Stock insuficiente/);
    const despues = await llamar('/ventas?limite=1');
    assert.equal(despues.data.ventas[0].id_venta, antes.data.ventas[0].id_venta, 'no se creó ninguna venta');
});

test('PI-08 · Venta pendiente: no suma al cliente hasta completarse', { skip: !PASSWORD }, async () => {
    const r = await llamar('/ventas', { metodo: 'POST', cuerpo: {
        id_cliente: ctx.cliente.id_cliente, estado: 'pendiente', observacion: 'Prueba automática',
        items: [{ id_producto: ctx.grande.id_producto, modalidad: 'unidad', cantidad: 3 }]
    } });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.data.estado, 'pendiente');
    ctx.ventaPendiente = r.data.id_venta;
    const cliente = (await llamar(`/clientes/${ctx.cliente.id_cliente}`)).data;
    assert.equal(cliente.numero_compras, 1, 'solo cuenta la venta completada');
});

test('PI-09 · Pendiente no se puede devolver; al completarla suma al cliente', { skip: !PASSWORD }, async () => {
    const dev = await llamar(`/ventas/${ctx.ventaPendiente}/devoluciones`, { metodo: 'POST', cuerpo: { tipo: 'otro', accion: 'reembolso', items: [{ id_detalle: 1, cantidad: 1 }] } });
    assert.equal(dev.status, 409);
    const r = await llamar(`/ventas/${ctx.ventaPendiente}/completar`, { metodo: 'POST', cuerpo: { metodo_pago: 'transferencia' } });
    assert.equal(r.status, 200, r.error);
    const otra = await llamar(`/ventas/${ctx.ventaPendiente}/completar`, { metodo: 'POST', cuerpo: {} });
    assert.equal(otra.status, 409, 'no se puede completar dos veces');
    const cliente = (await llamar(`/clientes/${ctx.cliente.id_cliente}`)).data;
    assert.equal(cliente.numero_compras, 2);
});

test('PI-10 · Devolución por producto dañado con reposición: descuenta insumos otra vez', { skip: !PASSWORD }, async () => {
    const venta = (await llamar(`/ventas/${ctx.ventaCompletada}`)).data;
    const r = await llamar(`/ventas/${ctx.ventaCompletada}/devoluciones`, { metodo: 'POST', cuerpo: {
        tipo: 'producto_danado', accion: 'reposicion', motivo: 'Prueba: paquete quemado',
        items: [{ id_detalle: venta.items[0].id_detalle, cantidad: 1 }]
    } });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.data.total_reembolsado, 0);
    assert.ok(r.data.insumos_descontados.length > 0);
});

test('PI-11 · Devolución con reembolso: baja el total neto y cambia el estado', { skip: !PASSWORD }, async () => {
    const venta = (await llamar(`/ventas/${ctx.ventaPendiente}`)).data;
    const linea = venta.items[0];
    const r = await llamar(`/ventas/${ctx.ventaPendiente}/devoluciones`, { metodo: 'POST', cuerpo: {
        tipo: 'cliente_insatisfecho', accion: 'reembolso', items: [{ id_detalle: linea.id_detalle, cantidad: 1 }]
    } });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.data.estado_venta, 'devuelta_parcial');
    const despues = (await llamar(`/ventas/${ctx.ventaPendiente}`)).data;
    assert.equal(despues.total_neto, venta.total - linea.precio_unitario);
    const exceso = await llamar(`/ventas/${ctx.ventaPendiente}/devoluciones`, { metodo: 'POST', cuerpo: {
        tipo: 'otro', accion: 'reembolso', items: [{ id_detalle: linea.id_detalle, cantidad: 99 }]
    } });
    assert.equal(exceso.status, 409, 'no deja devolver más de lo vendido');
});

test('PI-12 · Merma: se registra y descuenta el stock; no permite más de lo disponible', { skip: !PASSWORD }, async () => {
    const insumo = await stockDe('Sal');
    const r = await llamar('/mermas', { metodo: 'POST', cuerpo: { id_insumo: insumo.id_insumo, cantidad: 0.01, motivo: 'Prueba automática' } });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.data.stock_resultante, Math.round((insumo.stock_actual - 0.01) * 1000) / 1000);
    const excesiva = await llamar('/mermas', { metodo: 'POST', cuerpo: { id_insumo: insumo.id_insumo, cantidad: Math.ceil(insumo.stock_actual + 1), motivo: 'Prueba' } });
    assert.equal(excesiva.status, 409);
});

test('PI-13 · Validación: datos inválidos se rechazan con mensaje claro', { skip: !PASSWORD }, async () => {
    const r = await llamar('/clientes', { metodo: 'POST', cuerpo: { nombre: 'A', telefono: 'abc' } });
    assert.equal(r.status, 400);
    assert.ok(r.detalles.campos.nombre && r.detalles.campos.telefono);
});

test('PI-14 · IA: el asistente responde con datos de la BD', { skip: !PASSWORD }, async () => {
    const r = await llamar('/ia/chat', { metodo: 'POST', cuerpo: { mensaje: '¿Cuánto vendimos hoy?' } });
    assert.equal(r.status, 200, r.error);
    assert.match(r.data.respuesta, /Ventas de hoy/);
});

test('PI-15 · IA: la red neuronal pronostica la demanda de mañana', { skip: !PASSWORD }, async () => {
    const r = await llamar('/ia/pronostico');
    assert.equal(r.status, 200, r.error);
    if (r.data.estado === 'sin_datos') {
        assert.match(r.data.mensaje, /al menos/);
        return;
    }
    assert.equal(r.data.estado, 'ok');
    assert.ok(r.data.manana.productos.length > 0);
    r.data.manana.productos.forEach(p => assert.ok(Number.isInteger(p.unidades) && p.unidades >= 0));
    assert.ok(r.data.modelo.metricas.mae_unidades >= 0);
});

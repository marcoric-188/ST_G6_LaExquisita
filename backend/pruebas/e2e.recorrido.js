/**
 * PRUEBA DE EXTREMO A EXTREMO (opcional) · Recorre la aplicación en un navegador real
 * y guarda capturas en docs/evidencias/capturas.
 *
 * Requisitos (una sola vez):  npm install --no-save playwright  y  npx playwright install chromium
 * Ejecutar con el backend corriendo:  node pruebas/e2e.recorrido.js
 * Usa PRUEBA_CORREO y PRUEBA_PASSWORD de backend/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { chromium } = require('playwright');
const OUT = path.join(__dirname, '..', '..', 'docs', 'evidencias', 'capturas');
const BASE = `http://localhost:${process.env.PORT || 3000}`;
const CORREO = process.env.PRUEBA_CORREO || 'marcori@gmail.com';
const PASSWORD = process.env.PRUEBA_PASSWORD;
const problemas = [];
(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.on('console', m => { if (m.type() === 'error' && !/401/.test(m.text())) problemas.push(`[console] ${m.text()}`); });
    page.on('pageerror', e => problemas.push(`[pageerror] ${e.message}`));
    const shot = (n, full = false) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
    const paso = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, e.message.split('\n')[0]); problemas.push(n); } };

    await paso('login', async () => {
        await page.goto(BASE);
        await page.fill('[name=correo]', CORREO);
        await page.fill('[name=password]', PASSWORD);
        await page.click('#form-login [type=submit]');
        await page.waitForSelector('#vista-inicio:not([hidden])');
        await page.waitForSelector('.pron-producto');
        await page.waitForTimeout(1500);
        await page.locator('#panel-pronostico').scrollIntoViewIfNeeded();
        await shot('01-inicio-pronostico');
        await shot('01b-inicio-completo', true);
    });
    await paso('POS venta pendiente', async () => {
        await page.goto(BASE + '/#/pos');
        await page.waitForSelector('.producto');
        await page.fill('#cliente-buscar', 'pepe');
        await page.click('#picker-resultados li[data-i="0"]');
        await page.locator('.producto').nth(0).locator('[data-paso="1"]').click();
        await page.locator('.producto').nth(0).locator('[data-action="agregar"]').click();
        await page.locator('.producto').nth(1).locator('[data-modo-btn="unidad"]').click();
        await page.locator('.producto').nth(1).locator('[data-cantidad]').fill('4');
        await page.locator('.producto').nth(1).locator('[data-cantidad]').dispatchEvent('change');
        await page.locator('.producto').nth(1).locator('[data-action="agregar"]').click();
        await page.click('[data-estado="pendiente"]');
        await page.fill('#venta-observacion', 'Recoge a las 5 p. m.');
        await page.waitForTimeout(2200);
        await shot('02-pos-pendiente');
        await page.click('#btn-confirmar-venta');
        await page.waitForSelector('#modal-recibo:not([hidden])');
        await page.waitForTimeout(500);
        await shot('03-recibo-pendiente');
        await page.click('#modal-recibo [data-cerrar]');
    });
    await paso('Ventas: filtrar pendientes y completar', async () => {
        await page.goto(BASE + '/#/ventas');
        await page.selectOption('#ventas-estado', 'pendiente');
        await page.waitForSelector('#tabla-ventas tr[data-id]');
        await page.waitForTimeout(800);
        await shot('04-ventas-pendientes');
        await page.click('#tabla-ventas tr[data-id]');
        await page.waitForSelector('[data-action="completar"]');
        await shot('05-detalle-pendiente');
        await page.selectOption('#completar-metodo', 'transferencia');
        await page.click('[data-action="completar"]');
        await page.click('#modal-confirmar [data-respuesta="si"]');
        await page.waitForSelector('[data-action="abrir-devolucion"]');
    });
    await paso('Devolución por producto dañado (reposición)', async () => {
        await page.click('[data-action="abrir-devolucion"]');
        await page.waitForSelector('#modal-devolucion:not([hidden])');
        await page.locator('#devolucion-items [data-detalle]').first().fill('1');
        await page.locator('#devolucion-items [data-detalle]').first().dispatchEvent('input');
        await page.fill('#form-devolucion [name=motivo]', 'El paquete salió quemado');
        await shot('06-devolucion-reposicion');
        await page.click('#form-devolucion [type=submit]');
        await page.waitForSelector('#modal-devolucion', { state: 'hidden' });
    });
    await paso('Devolución con reembolso', async () => {
        await page.selectOption('#ventas-estado', '');
        await page.waitForTimeout(700);
        await page.click('#tabla-ventas tr[data-id]');
        await page.waitForSelector('[data-action="abrir-devolucion"]');
        await page.click('[data-action="abrir-devolucion"]');
        await page.locator('#devolucion-items [data-detalle]').last().fill('2');
        await page.click('[data-accion="reembolso"]');
        await page.selectOption('#form-devolucion [name=tipo]', 'cliente_insatisfecho');
        await page.click('#form-devolucion [type=submit]');
        await page.waitForSelector('#modal-devolucion', { state: 'hidden' });
        await page.waitForTimeout(800);
        await shot('07-ventas-estados');
        await page.click('#tabla-ventas tr[data-id]');
        await page.waitForSelector('#modal-venta:not([hidden])');
        await page.waitForTimeout(400);
        await shot('08-detalle-con-devoluciones');
        await page.keyboard.press('Escape');
    });
    await paso('IA: pronóstico', async () => {
        await page.goto(BASE + '/#/asistente');
        for (const q of ['¿Cuántas arepas preparo mañana?', 'Devoluciones del mes']) {
            await page.fill('#chat-input', q);
            await page.click('#form-chat [type=submit]');
            await page.waitForFunction(() => !document.querySelector('.escribiendo'));
            await page.waitForTimeout(300);
        }
        await page.waitForTimeout(500);
        await shot('09-ia-pronostico');
    });
    await paso('móvil', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(BASE + '/#/inicio');
        await page.waitForSelector('.pron-producto');
        await page.locator('#panel-pronostico').scrollIntoViewIfNeeded();
        await page.waitForTimeout(900);
        await shot('10-movil-pronostico');
        const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
        if (ancho > 390) problemas.push('scroll horizontal ' + ancho);
    });
    console.log('PROBLEMAS:', problemas.length ? problemas.join('\n') : 'ninguno');
    process.exitCode = problemas.length ? 1 : 0;
    await browser.close();
})();

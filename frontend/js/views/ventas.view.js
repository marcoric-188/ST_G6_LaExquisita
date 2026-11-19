/**
 * VISTA · Historial de Ventas
 * Filtros por fecha y estado, totales netos, detalle de cada venta y sus acciones:
 *  - Pendiente   -> "Marcar como completada" (se cobra).
 *  - Completada  -> "Registrar devolución" (producto dañado, equivocado, etc.)
 *                   con reposición del producto o reembolso del dinero.
 */
import { $, $$, html, on } from '../utils/dom.js';
import { dinero, numero, fechaHora, hoyISO, METODOS_PAGO, ESTADOS_VENTA, TIPOS_DEVOLUCION, numeroVenta as numeroVentaBase } from '../utils/format.js';
import { ventasService } from '../services/ventas.service.js';
import {
    toast, abrirModal, cerrarModal, animarNumero, filasEsqueleto, vacio,
    limpiarErrores, mostrarError, cargando, confirmar
} from '../components/ui.js';

const RANGOS = {
    hoy: () => [hoyISO(0), hoyISO(0)],
    7: () => [hoyISO(-6), hoyISO(0)],
    30: () => [hoyISO(-29), hoyISO(0)],
    todo: () => ['', '']
};

let ventaActual = null;
let accionDevolucion = 'reposicion';

const numeroVenta = (v) => `#${numeroVentaBase(v)}`;

function etiquetaPago(metodo) {
    const m = METODOS_PAGO[metodo] || { etiqueta: metodo || '—', icono: 'fa-money-bill' };
    return html`<span class="badge badge-neutro"><i class="fa-solid ${m.icono}"></i> ${m.etiqueta}</span>`;
}

function etiquetaEstado(estado) {
    const e = ESTADOS_VENTA[estado] || ESTADOS_VENTA.completada;
    return html`<span class="badge badge-${estado}"><i class="fa-solid ${e.icono}"></i> ${e.etiqueta}</span>`;
}

async function cargar() {
    const cuerpo = $('#tabla-ventas');
    cuerpo.innerHTML = filasEsqueleto(5, 8);
    try {
        const { ventas, totales } = await ventasService.listar({
            desde: $('#ventas-desde').value,
            hasta: $('#ventas-hasta').value,
            estado: $('#ventas-estado').value,
            limite: 300
        });
        animarNumero($('#ventas-cantidad'), totales.ventas, (v) => numero(Math.round(v)));
        animarNumero($('#ventas-total'), totales.total, dinero);
        animarNumero($('#ventas-ticket'), totales.ventas ? totales.total / totales.ventas : 0, dinero);
        animarNumero($('#ventas-por-cobrar'), totales.por_cobrar || 0, dinero);

        cuerpo.innerHTML = ventas.length ? html`${ventas.map((v, i) => html`
            <tr data-id="${v.id_venta}" style="animation-delay:${Math.min(i, 15) * 25}ms" title="Ver detalle">
                <td><strong>${numeroVenta(v)}</strong></td>
                <td><small>${fechaHora(v.fecha_hora)}</small></td>
                <td>${v.cliente || html`<small>Sin cliente</small>`}</td>
                <td class="resumen-productos">${v.resumen || '—'}<br><small>${numero(v.unidades)} arepas${v.devoluciones ? ` · ${v.devoluciones} devolución(es)` : ''}</small></td>
                <td>${etiquetaPago(v.metodo_pago)}</td>
                <td>${etiquetaEstado(v.estado)}</td>
                <td><small>${v.vendedor || '—'}</small></td>
                <td class="num"><span class="monto">${dinero(v.estado === 'pendiente' ? v.total : v.total_neto)}</span>
                    ${v.total_devuelto ? html`<br><small class="negativo">−${dinero(v.total_devuelto)}</small>` : ''}</td>
            </tr>`)}` : vacio('fa-receipt', 'No hay ventas con esos filtros.', 8);
    } catch (error) {
        cuerpo.innerHTML = vacio('fa-plug-circle-xmark', error.message, 8);
    }
}

function aplicarRango(rango) {
    const [desde, hasta] = RANGOS[rango]();
    $('#ventas-desde').value = desde;
    $('#ventas-hasta').value = hasta;
    $$('#ventas-rangos .chip').forEach(c => c.classList.toggle('activo', c.dataset.rango === String(rango)));
    cargar();
}

/* ------------------------------ Detalle ------------------------------ */
function pintarDetalle(v) {
    const devolvible = ['completada', 'devuelta_parcial'].includes(v.estado) && v.items.some(i => i.cantidad > i.cantidad_devuelta);
    $('#venta-detalle-cuerpo').innerHTML = html`
        <h3>Venta ${numeroVenta(v)}</h3>
        <p class="texto-suave">${fechaHora(v.fecha_hora)}</p>
        <p style="margin-top:8px">${etiquetaEstado(v.estado)}</p>
        ${v.observacion ? html`<p class="texto-suave" style="margin-top:6px"><i class="fa-solid fa-note-sticky"></i> ${v.observacion}</p>` : ''}
        <table class="recibo-tabla">
            ${v.items.map(i => html`<tr><td>${i.cantidad} × ${i.producto}<br><small class="texto-suave">${numero(i.unidades)} arepas · ${dinero(i.precio_unitario)} c/u${i.cantidad_devuelta ? ` · ${i.cantidad_devuelta} devuelto(s)` : ''}</small></td><td>${dinero(i.subtotal)}</td></tr>`)}
        </table>
        ${v.total_devuelto ? html`<div class="recibo-total"><span>Reembolsado</span><span class="negativo">−${dinero(v.total_devuelto)}</span></div>` : ''}
        <div class="recibo-total"><span>${v.total_devuelto ? 'Total neto' : 'Total'}</span><strong>${dinero(v.total_neto)}</strong></div>
        <div class="recibo-meta">
            <div><small>Cliente</small>${v.cliente || 'Sin cliente'}</div>
            <div><small>Pago</small>${v.estado === 'pendiente' ? 'Por cobrar' : etiquetaPago(v.metodo_pago)}</div>
            <div><small>Vendedor</small>${v.vendedor || '—'}</div>
            <div><small>Documento / tel.</small>${[v.documento, v.telefono].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        ${v.devoluciones.length ? html`<div class="lista-devoluciones"><strong>Devoluciones</strong>${v.devoluciones.map(d => html`
            <div class="item-compacto"><span class="icono-redondo icono-brasa"><i class="fa-solid fa-rotate-left"></i></span>
            <span class="info"><strong>${TIPOS_DEVOLUCION[d.tipo] || d.tipo} · ${d.accion === 'reembolso' ? 'reembolso' : 'reposición'}</strong>
            <small>${d.resumen || ''} · ${fechaHora(d.fecha_hora)}${d.motivo ? ` · ${d.motivo}` : ''}</small></span>
            <span class="valor">${d.total_reembolsado ? dinero(d.total_reembolsado) : '—'}</span></div>`)}</div>` : ''}
        <div class="acciones-venta">
            ${v.estado === 'pendiente' ? html`
                <select id="completar-metodo" aria-label="Método de pago">
                    ${Object.entries(METODOS_PAGO).map(([k, m]) => html`<option value="${k}">${m.etiqueta}</option>`)}
                </select>
                <button type="button" class="btn btn-hoja" data-action="completar"><i class="fa-solid fa-circle-check"></i> Marcar como completada</button>` : ''}
            ${devolvible ? html`<button type="button" class="btn btn-brasa" data-action="abrir-devolucion"><i class="fa-solid fa-rotate-left"></i> Registrar devolución</button>` : ''}
        </div>`;
}

async function verDetalle(id) {
    try {
        ventaActual = await ventasService.obtener(id);
        pintarDetalle(ventaActual);
        abrirModal('modal-venta');
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function completarVenta(boton) {
    const metodo = $('#completar-metodo').value;
    if (!(await confirmar(`¿Marcar la venta ${numeroVenta(ventaActual)} como pagada por ${METODOS_PAGO[metodo].etiqueta}?`, { textoSi: 'Sí, completar' }))) return;
    cargando(boton, true);
    try {
        await ventasService.completar(ventaActual.id_venta, metodo);
        toast(`Venta ${numeroVenta(ventaActual)} completada.`, 'exito');
        await verDetalle(ventaActual.id_venta);
        cargar();
    } catch (error) {
        toast(error.message, 'error');
    } finally { cargando(boton, false); }
}

/* ------------------------------ Devolución ------------------------------ */
function actualizarResumenDevolucion() {
    let arepas = 0;
    let dinero_ = 0;
    $$('#devolucion-items [data-detalle]').forEach((input) => {
        const linea = ventaActual.items.find(i => i.id_detalle === Number(input.dataset.detalle));
        const cantidad = Math.max(0, Math.min(Number(input.max), Math.round(Number(input.value) || 0)));
        arepas += (linea.unidades / linea.cantidad) * cantidad;
        dinero_ += linea.precio_unitario * cantidad;
    });
    $('#devolucion-resumen').textContent = accionDevolucion === 'reembolso'
        ? `Se devolverán ${dinero(dinero_)} al cliente (${numero(arepas)} arepas).`
        : `Se entregarán ${numero(arepas)} arepas nuevas; sus insumos se descuentan del inventario. No se devuelve dinero.`;
}

function abrirDevolucion() {
    const form = $('#form-devolucion');
    form.reset();
    limpiarErrores(form);
    accionDevolucion = 'reposicion';
    $$('#devolucion-accion .chip').forEach(c => c.classList.toggle('activo', c.dataset.accion === accionDevolucion));
    $('#devolucion-venta').textContent = `Venta ${numeroVenta(ventaActual)} · ${ventaActual.cliente || 'Sin cliente'}`;
    $('#devolucion-items').innerHTML = html`${ventaActual.items.filter(i => i.cantidad > i.cantidad_devuelta).map(i => html`
        <div class="devolucion-item">
            <div class="info"><strong>${i.producto}</strong><small>Vendidos ${i.cantidad} · disponibles para devolver ${i.cantidad - i.cantidad_devuelta}</small></div>
            <div class="stepper stepper-sm"><input type="number" min="0" max="${i.cantidad - i.cantidad_devuelta}" value="0" data-detalle="${i.id_detalle}" aria-label="Cantidad a devolver de ${i.producto}"></div>
        </div>`)}`;
    actualizarResumenDevolucion();
    cerrarModal('modal-venta');
    abrirModal('modal-devolucion');
}

async function guardarDevolucion(e) {
    e.preventDefault();
    const form = e.currentTarget;
    limpiarErrores(form);
    const items = $$('#devolucion-items [data-detalle]')
        .map(input => ({ id_detalle: Number(input.dataset.detalle), cantidad: Math.round(Number(input.value) || 0) }))
        .filter(i => i.cantidad > 0);
    if (!items.length) return mostrarError(form, { message: 'Indica la cantidad de al menos un producto a devolver.' });

    const boton = form.querySelector('[type=submit]');
    cargando(boton, true);
    try {
        const r = await ventasService.devolver(ventaActual.id_venta, {
            tipo: form.elements.tipo.value,
            accion: accionDevolucion,
            motivo: form.elements.motivo.value.trim(),
            items
        });
        cerrarModal('modal-devolucion');
        toast(r.accion === 'reembolso'
            ? `Devolución registrada: se reembolsaron ${dinero(r.total_reembolsado)}.`
            : 'Devolución registrada: producto repuesto e inventario actualizado.', 'exito', 5500);
        cargar();
    } catch (error) {
        mostrarError(form, error);
    } finally { cargando(boton, false); }
}

export const ventasVista = {
    iniciar() {
        on($('#ventas-rangos'), 'click', '[data-rango]', (e, chip) => aplicarRango(chip.dataset.rango));
        ['#ventas-desde', '#ventas-hasta'].forEach(sel => $(sel).addEventListener('change', () => {
            $$('#ventas-rangos .chip').forEach(c => c.classList.remove('activo'));
            cargar();
        }));
        $('#ventas-estado').addEventListener('change', cargar);
        on($('#tabla-ventas'), 'click', 'tr[data-id]', (e, fila) => verDetalle(Number(fila.dataset.id)));

        const detalle = $('#venta-detalle-cuerpo');
        on(detalle, 'click', '[data-action="completar"]', (e, b) => completarVenta(b));
        on(detalle, 'click', '[data-action="abrir-devolucion"]', abrirDevolucion);

        on($('#devolucion-accion'), 'click', '[data-accion]', (e, chip) => {
            accionDevolucion = chip.dataset.accion;
            $$('#devolucion-accion .chip').forEach(c => c.classList.toggle('activo', c === chip));
            actualizarResumenDevolucion();
        });
        $('#devolucion-items').addEventListener('input', actualizarResumenDevolucion);
        $('#form-devolucion').addEventListener('submit', guardarDevolucion);

        const [desde, hasta] = RANGOS.hoy();
        $('#ventas-desde').value = desde;
        $('#ventas-hasta').value = hasta;
    },

    mostrar: cargar
};

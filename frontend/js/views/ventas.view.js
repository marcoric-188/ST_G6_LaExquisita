/**
 * VISTA · Historial de Ventas (filtros por fecha, totales y detalle)
 */
import { $, $$, html, on } from '../utils/dom.js';
import { dinero, numero, fechaHora, hoyISO, METODOS_PAGO } from '../utils/format.js';
import { ventasService } from '../services/ventas.service.js';
import { toast, abrirModal, animarNumero, filasEsqueleto, vacio } from '../components/ui.js';

const RANGOS = {
    hoy: () => [hoyISO(0), hoyISO(0)],
    7: () => [hoyISO(-6), hoyISO(0)],
    30: () => [hoyISO(-29), hoyISO(0)],
    todo: () => ['', '']
};

function etiquetaPago(metodo) {
    const m = METODOS_PAGO[metodo] || { etiqueta: metodo || '—', icono: 'fa-money-bill' };
    return html`<span class="badge badge-neutro"><i class="fa-solid ${m.icono}"></i> ${m.etiqueta}</span>`;
}

async function cargar() {
    const cuerpo = $('#tabla-ventas');
    cuerpo.innerHTML = filasEsqueleto(5, 7);
    try {
        const { ventas, totales } = await ventasService.listar({
            desde: $('#ventas-desde').value,
            hasta: $('#ventas-hasta').value,
            limite: 300
        });
        animarNumero($('#ventas-cantidad'), totales.ventas, (v) => numero(Math.round(v)));
        animarNumero($('#ventas-total'), totales.total, dinero);
        animarNumero($('#ventas-ticket'), totales.ventas ? totales.total / totales.ventas : 0, dinero);

        cuerpo.innerHTML = ventas.length ? html`${ventas.map((v, i) => html`
            <tr data-id="${v.id_venta}" style="animation-delay:${Math.min(i, 15) * 25}ms" title="Ver detalle">
                <td><strong>#V-${String(v.id_venta).padStart(4, '0')}</strong></td>
                <td><small>${fechaHora(v.fecha_hora)}</small></td>
                <td>${v.cliente || html`<small>Sin cliente</small>`}</td>
                <td class="resumen-productos">${v.resumen || '—'}<br><small>${numero(v.unidades)} arepas</small></td>
                <td>${etiquetaPago(v.metodo_pago)}</td>
                <td><small>${v.vendedor || '—'}</small></td>
                <td class="num"><span class="monto">${dinero(v.total)}</span></td>
            </tr>`)}` : vacio('fa-receipt', 'No hay ventas en el rango seleccionado.', 7);
    } catch (error) {
        cuerpo.innerHTML = vacio('fa-plug-circle-xmark', error.message, 7);
    }
}

function aplicarRango(rango) {
    const [desde, hasta] = RANGOS[rango]();
    $('#ventas-desde').value = desde;
    $('#ventas-hasta').value = hasta;
    $$('#ventas-rangos .chip').forEach(c => c.classList.toggle('activo', c.dataset.rango === String(rango)));
    cargar();
}

async function verDetalle(id) {
    try {
        const v = await ventasService.obtener(id);
        $('#venta-detalle-cuerpo').innerHTML = html`
            <h3>Venta #V-${String(v.id_venta).padStart(4, '0')}</h3>
            <p class="texto-suave">${fechaHora(v.fecha_hora)}</p>
            <table class="recibo-tabla">
                ${v.items.map(i => html`<tr><td>${i.cantidad} × ${i.producto}<br><small class="texto-suave">${numero(i.unidades)} arepas · ${dinero(i.precio_unitario)} c/u</small></td><td>${dinero(i.subtotal)}</td></tr>`)}
            </table>
            <div class="recibo-total"><span>Total</span><strong>${dinero(v.total)}</strong></div>
            <div class="recibo-meta">
                <div><small>Cliente</small>${v.cliente || 'Sin cliente'}</div>
                <div><small>Pago</small>${etiquetaPago(v.metodo_pago)}</div>
                <div><small>Vendedor</small>${v.vendedor || '—'}</div>
                <div><small>Documento / tel.</small>${[v.documento, v.telefono].filter(Boolean).join(' · ') || '—'}</div>
            </div>`;
        abrirModal('modal-venta');
    } catch (error) {
        toast(error.message, 'error');
    }
}

export const ventasVista = {
    iniciar() {
        on($('#ventas-rangos'), 'click', '[data-rango]', (e, chip) => aplicarRango(chip.dataset.rango));
        ['#ventas-desde', '#ventas-hasta'].forEach(sel => $(sel).addEventListener('change', () => {
            $$('#ventas-rangos .chip').forEach(c => c.classList.remove('activo'));
            cargar();
        }));
        on($('#tabla-ventas'), 'click', 'tr[data-id]', (e, fila) => verDetalle(Number(fila.dataset.id)));
        const [desde, hasta] = RANGOS.hoy();
        $('#ventas-desde').value = desde;
        $('#ventas-hasta').value = hasta;
    },

    mostrar: cargar
};

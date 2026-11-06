/**
 * VISTA · Inicio (panel con indicadores en vivo desde SQL Server)
 */
import { $, $$, html } from '../utils/dom.js';
import { dinero, numero, haceCuanto, METODOS_PAGO } from '../utils/format.js';
import { estado } from '../core/store.js';
import { dashboardService } from '../services/dashboard.service.js';
import { animarNumero, vacio, toast } from '../components/ui.js';

const compacto = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : dinero(v));

function saludo() {
    const h = new Date().getHours();
    const nombre = estado.usuario ? estado.usuario.nombre.split(' ')[0] : '';
    const texto = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    $('#hero-saludo').textContent = `${texto}, ${nombre} 👋`;
    const fecha = new Date().toLocaleString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    $('#hero-fecha').textContent = fecha[0].toUpperCase() + fecha.slice(1);
}

function pintarGrafico(serie) {
    const max = Math.max(...serie.map(d => d.total), 1);
    const hoy = serie.length - 1;
    $('#grafico-ventas').innerHTML = html`${serie.map((d, i) => {
        const alto = d.total ? Math.max(6, (d.total / max) * 100) : 3;
        const dia = new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
        return html`<div class="barra-col" title="${dia}: ${d.ventas} ventas · ${dinero(d.total)}">
            <div class="barra ${d.total ? '' : 'vacia'} ${i === hoy ? 'hoy' : ''}" style="height:${alto}%; animation-delay:${i * 70}ms">
                ${d.total ? html`<span class="barra-valor">${compacto(d.total)}</span>` : ''}
            </div>
            <span class="barra-dia">${i === hoy ? 'hoy' : dia}</span>
        </div>`;
    })}`;
}

function pintarDisponibilidad(lista) {
    $('#panel-disponibilidad').innerHTML = lista.length ? html`${lista.map(p => html`
        <div class="item-compacto">
            <span class="icono-redondo"><i class="fa-solid fa-fire-burner"></i></span>
            <span class="info"><strong>${p.nombre}</strong><small>${p.insumo_limitante ? `Limita: ${p.insumo_limitante}` : 'Sin receta registrada'}</small></span>
            <span class="valor">${p.paquetes_disponibles === null ? '—' : `${numero(p.paquetes_disponibles)} paq.`}</span>
        </div>`)}` : vacio('fa-box-open', 'No hay productos activos.');
}

function pintarAlertas(alertas) {
    $('#panel-alertas').innerHTML = alertas.length ? html`${alertas.map(i => html`
        <a href="#/insumos" class="item-compacto">
            <span class="icono-redondo icono-brasa"><i class="fa-solid fa-triangle-exclamation"></i></span>
            <span class="info"><strong>${i.nombre}</strong><small>Mínimo ${numero(i.stock_minimo)} ${i.unidad_medida}</small></span>
            <span class="badge badge-${i.estado}">${numero(i.stock_actual)} ${i.unidad_medida}</span>
        </a>`)}` : html`<div class="item-compacto">
            <span class="icono-redondo icono-hoja"><i class="fa-solid fa-circle-check"></i></span>
            <span class="info"><strong>Todo el stock está en orden</strong><small>Ningún insumo bajo el mínimo</small></span>
        </div>`;
}

function pintarUltimas(ventas) {
    $('#panel-ultimas').innerHTML = ventas.length ? html`${ventas.slice(0, 5).map(v => html`
        <div class="item-compacto">
            <span class="icono-redondo"><i class="fa-solid ${(METODOS_PAGO[v.metodo_pago] || METODOS_PAGO.efectivo).icono}"></i></span>
            <span class="info"><strong>${v.cliente || 'Sin cliente'}</strong><small>#${v.id_venta} · ${haceCuanto(v.fecha_hora)}</small></span>
            <span class="valor">${dinero(v.total)}</span>
        </div>`)}` : vacio('fa-receipt', 'Aún no hay ventas registradas.');
}

export const inicioVista = {
    iniciar() {
        setInterval(saludo, 30000);
    },

    async mostrar() {
        saludo();
        try {
            const d = await dashboardService.resumen();
            $$('[data-kpi]').forEach((el) => {
                const valor = d.kpis[el.dataset.kpi] || 0;
                animarNumero(el, valor, el.dataset.formato === 'dinero' ? dinero : (v) => numero(Math.round(v)));
            });
            pintarGrafico(d.serie_7_dias);
            pintarDisponibilidad(d.disponibilidad);
            pintarAlertas(d.insumos_alerta);
            pintarUltimas(d.ultimas_ventas);
        } catch (error) {
            if (error.status !== 401 && error.status !== 403) toast(error.message, 'error');
        }
    }
};

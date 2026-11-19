/**
 * VISTA · Inicio (panel con indicadores en vivo desde SQL Server)
 */
import { $, $$, html } from '../utils/dom.js';
import { dinero, numero, haceCuanto, METODOS_PAGO, numeroVenta } from '../utils/format.js';
import { estado } from '../core/store.js';
import { dashboardService } from '../services/dashboard.service.js';
import { iaService } from '../services/ia.service.js';
import { animarNumero, vacio, toast, cargando } from '../components/ui.js';

const compacto = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : dinero(v));

function saludo() {
    const h = new Date().getHours();
    const nombre = estado.usuario ? estado.usuario.nombre.split(' ')[0] : '';
    const texto = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const fecha = new Date().toLocaleString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    // Si se quitan estos elementos del HTML, el panel sigue funcionando
    const elSaludo = $('#hero-saludo');
    const elFecha = $('#hero-fecha');
    if (elSaludo) elSaludo.textContent = `${texto}, ${nombre}`;
    if (elFecha) elFecha.textContent = fecha[0].toUpperCase() + fecha.slice(1);
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
            <span class="info"><strong>${v.cliente || 'Sin cliente'}</strong><small>#${numeroVenta(v)} · ${haceCuanto(v.fecha_hora)}</small></span>
            <span class="valor">${dinero(v.estado === 'pendiente' ? v.total : v.total_neto)}</span>
        </div>`)}` : vacio('fa-receipt', 'Aún no hay ventas registradas.');
}

const imagenProducto = (tamano) => (tamano === 'pequena' ? 'assets/img/arepa-pequena.jpg' : 'assets/img/arepa-grande.jpg');

/** Tarjeta de la red neuronal: qué preparar mañana, los próximos 7 días y la calidad del modelo. */
function pintarPronostico(p) {
    const cuerpo = $('#pronostico-cuerpo');
    if (!p || p.estado !== 'ok') {
        cuerpo.innerHTML = html`<div class="pron-vacio">
            <div><strong>Todavía no hay suficientes ventas para pronosticar.</strong><br>
            ${p && p.mensaje ? p.mensaje : 'No se pudo calcular el pronóstico.'}</div></div>`;
        return;
    }
    const m = p.modelo.metricas || {};
    const max = Math.max(1, ...p.proximos_dias.map(d => d.total_arepas));
    cuerpo.innerHTML = html`
        <div class="pron-productos">
            ${p.manana.productos.map(x => html`
                <div class="pron-producto">
                    <img src="${imagenProducto(x.tamano)}" alt="">
                    <div class="info"><strong>${x.nombre}</strong><small>Mañana, ${p.manana.dia_semana}</small></div>
                    <div class="cifra"><strong>${numero(x.unidades)}</strong><small>arepas · ${x.paquetes} paq.</small></div>
                </div>`)}
            ${p.alertas.length
                ? html`<p class="aviso">${p.alertas.join(' ')}</p>`
                : html`<p class="texto-suave" style="font-size:13px">El inventario alcanza para producir lo pronosticado.</p>`}
        </div>
        ${p.dias_historial >= 7 ? html`<div class="pron-semana" role="img" aria-label="Arepas pronosticadas para los próximos 7 días">
            ${p.proximos_dias.map((d, i) => html`<div class="barra-col" title="${d.dia_semana}: ${d.total_arepas} arepas">
                <div class="barra ${i === 0 ? 'manana' : ''}" style="height:${Math.max(6, (d.total_arepas / max) * 100)}%; animation-delay:${i * 70}ms">
                    <span class="barra-valor">${d.total_arepas}</span>
                </div>
                <span class="barra-dia">${i === 0 ? 'mañana' : d.dia_semana.slice(0, 3)}</span>
            </div>`)}
        </div>` : html`<div class="pron-aprendiendo"><div><strong>La red neuronal está aprendiendo.</strong><br>
            Lleva ${numero(p.dias_historial)} día(s) de ventas. Mientras tanto combina su resultado con el promedio reciente
            (peso de la red: ${p.peso_red}%). Con 7 días de ventas se muestra el pronóstico de la semana.</div></div>`}
        <div class="pron-meta">
            <div class="dato"><small>Modelo</small><strong>${p.modelo.arquitectura}</strong></div>
            <div class="dato"><small>Error medio (validación)</small><strong>${m.mae_unidades === null || m.mae_unidades === undefined ? 'Faltan días para medirlo' : `±${numero(m.mae_unidades)} arepas`}</strong></div>
            <div class="dato"><small>Frente a un promedio simple</small><strong>${m.mejora_vs_promedio === null || m.mejora_vs_promedio === undefined ? '—' : m.mejora_vs_promedio >= 0 ? `${numero(m.mejora_vs_promedio)}% mejor` : `${numero(-m.mejora_vs_promedio)}% peor`}</strong></div>
            <div class="dato"><small>Días de historial</small><strong>${numero(m.dias_con_ventas || 0)} días con ventas</strong></div>
            <div class="dato"><small>Entrenado con</small><strong>${numero(p.modelo.muestras)} ejemplos · ${haceCuanto(p.modelo.fecha_entrenamiento)}</strong></div>
        </div>`;
}

export const inicioVista = {
    iniciar() {
        setInterval(saludo, 30000);
        const reentrenar = $('[data-action="reentrenar"]');
        if (reentrenar) reentrenar.addEventListener('click', async () => {
            cargando(reentrenar, true);
            try {
                const r = await iaService.entrenar();
                if (r.estado === 'ok') toast('Red neuronal reentrenada.', 'exito');
                else toast(r.mensaje, 'info');
                pintarPronostico(await iaService.pronostico());
            } catch (error) {
                toast(error.message, 'error');
            } finally { cargando(reentrenar, false); }
        });
    },

    async mostrar() {
        saludo();
        try {
            const d = await dashboardService.resumen();
            $$('[data-kpi]').forEach((el) => {
                const valor = d.kpis[el.dataset.kpi] || 0;
                animarNumero(el, valor, el.dataset.formato === 'dinero' ? dinero : (v) => numero(Math.round(v)));
            });
            // Cada panel se pinta por separado: si uno falla, los demás igual se muestran
            const paneles = [
                () => pintarGrafico(d.serie_7_dias),
                () => pintarDisponibilidad(d.disponibilidad),
                () => pintarAlertas(d.insumos_alerta),
                () => pintarUltimas(d.ultimas_ventas),
                () => pintarPronostico(d.pronostico)
            ];
            paneles.forEach((pintar) => {
                try { pintar(); } catch (e) { console.error('Panel de inicio:', e); }
            });
        } catch (error) {
            if (error.status !== 401 && error.status !== 403) toast(error.message, 'error');
        }
    }
};

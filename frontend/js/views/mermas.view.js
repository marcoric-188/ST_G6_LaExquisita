/**
 * VISTA · Control de Mermas (registro que descuenta el stock del insumo)
 */
import { $, html } from '../utils/dom.js';
import { numero, fechaHora } from '../utils/format.js';
import { mermasService } from '../services/mermas.service.js';
import { insumosService } from '../services/insumos.service.js';
import { toast, abrirModal, cerrarModal, leerFormulario, limpiarErrores, mostrarError, cargando, filasEsqueleto, vacio } from '../components/ui.js';

let insumos = [];
let motivos = [];

function pintarResumen(resumen) {
    const contenedor = $('#mermas-resumen');
    if (!resumen.length) {
        contenedor.innerHTML = html`<div class="chip-resumen"><small><i class="fa-solid fa-circle-check"></i> Últimos 30 días</small><strong>Sin mermas 👏</strong></div>`;
        return;
    }
    contenedor.innerHTML = html`${resumen.map((m, k) => html`
        <div class="chip-resumen" style="animation-delay:${k * 50}ms">
            <small><i class="fa-solid fa-trash-can"></i> ${m.insumo} · 30 días</small>
            <strong>${numero(m.cantidad)} <span class="texto-suave" style="font-size:14px">${m.unidad_medida}</span></strong>
            <small class="texto-suave">${m.registros} registro(s)</small>
        </div>`)}`;
}

async function cargar() {
    const cuerpo = $('#tabla-mermas');
    cuerpo.innerHTML = filasEsqueleto(4, 6);
    try {
        const datos = await mermasService.listar();
        motivos = datos.motivos;
        pintarResumen(datos.resumen_30_dias);
        cuerpo.innerHTML = datos.mermas.length ? html`${datos.mermas.map((m, i) => html`
            <tr style="animation-delay:${Math.min(i, 15) * 25}ms">
                <td><small>#M-${m.id_merma}</small></td>
                <td><small>${fechaHora(m.fecha_hora)}</small></td>
                <td><strong>${m.insumo}</strong></td>
                <td class="num negativo">−${numero(m.cantidad)} ${m.unidad_medida || ''}</td>
                <td>${m.motivo}${m.observacion ? html`<br><small>${m.observacion}</small>` : ''}</td>
                <td><small>${m.usuario || '—'}</small></td>
            </tr>`)}` : vacio('fa-face-smile', 'No hay mermas registradas.', 6);
    } catch (error) {
        cuerpo.innerHTML = vacio('fa-plug-circle-xmark', error.message, 6);
    }
}

function actualizarDisponible() {
    const insumo = insumos.find(i => i.id_insumo === Number($('#merma-insumo').value));
    $('#merma-disponible').textContent = insumo ? `Disponible: ${numero(insumo.stock_actual)} ${insumo.unidad_medida}` : '';
    const cantidad = $('#form-merma').elements.cantidad;
    if (insumo) cantidad.max = insumo.stock_actual;
}

async function abrirFormulario() {
    const form = $('#form-merma');
    form.reset();
    limpiarErrores(form);
    try {
        insumos = await insumosService.listar();
    } catch (error) {
        toast(error.message, 'error');
        return;
    }
    $('#merma-insumo').innerHTML = html`${insumos.map(i => html`<option value="${i.id_insumo}">${i.nombre} (${numero(i.stock_actual)} ${i.unidad_medida})</option>`)}`;
    $('#merma-motivo').innerHTML = html`${motivos.map(m => html`<option value="${m}">${m}</option>`)}`;
    actualizarDisponible();
    abrirModal('modal-merma');
}

export const mermasVista = {
    iniciar() {
        $('[data-action="nueva-merma"]').addEventListener('click', abrirFormulario);
        $('#merma-insumo').addEventListener('change', actualizarDisponible);
        $('#form-merma').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            limpiarErrores(form);
            const boton = form.querySelector('[type=submit]');
            cargando(boton, true);
            try {
                const r = await mermasService.registrar(leerFormulario(form));
                cerrarModal('modal-merma');
                toast(`Merma #${r.id_merma} registrada. Nuevo stock de ${r.insumo}: ${numero(r.stock_resultante)} ${r.unidad_medida}.`, 'exito', 5500);
                cargar();
            } catch (error) {
                mostrarError(form, error);
            } finally { cargando(boton, false); }
        });
    },

    mostrar: cargar
};

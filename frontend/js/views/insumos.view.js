/**
 * VISTA · Insumos y Stock (existencias, entradas, edición y kardex)
 */
import { $, html, on } from '../utils/dom.js';
import { numero, numeroCorto, fechaHora, ESTADOS_STOCK } from '../utils/format.js';
import { tieneRol } from '../core/store.js';
import { insumosService } from '../services/insumos.service.js';
import {
    toast, abrirModal, cerrarModal, leerFormulario, limpiarErrores, mostrarError,
    cargando, confirmar, filasEsqueleto, bloquesEsqueleto, vacio
} from '../components/ui.js';

let insumos = [];
let editando = null;
let entradaPara = null;

const TIPOS = { entrada: 'Entrada', venta: 'Venta', merma: 'Merma', ajuste: 'Ajuste' };

function tarjeta(i, k) {
    // La barra llega al 100% con 3 veces el mínimo; la marca indica el mínimo.
    const tope = i.stock_minimo > 0 ? i.stock_minimo * 3 : Math.max(i.stock_actual, 1);
    const porcentaje = Math.min(100, (i.stock_actual / tope) * 100);
    const marca = i.stock_minimo > 0 ? (i.stock_minimo / tope) * 100 : null;
    const est = ESTADOS_STOCK[i.estado] || ESTADOS_STOCK.ok;
    const gestiona = tieneRol('administrador', 'cocina');
    return html`
    <article class="insumo estado-${i.estado}" data-id="${i.id_insumo}" style="animation-delay:${k * 45}ms">
        <div class="insumo-cabecera">
            <h4>${i.nombre}</h4>
            <span class="badge badge-${i.estado}"><i class="fa-solid ${est.icono}"></i> ${est.etiqueta}</span>
        </div>
        <div class="insumo-stock" title="${numero(i.stock_actual)} ${i.unidad_medida}">${numeroCorto(i.stock_actual)}<small>${i.unidad_medida}</small></div>
        <div class="progreso ${i.estado}" title="Mínimo: ${numero(i.stock_minimo)} ${i.unidad_medida}">
            <span data-ancho="${porcentaje}"></span>
            ${marca !== null ? html`<i class="marca-minimo" style="left:${marca}%"></i>` : ''}
        </div>
        <div class="insumo-datos">
            <span>Mín. ${numero(i.stock_minimo)} ${i.unidad_medida}</span>
            <span>Consumo 7 días: ${numeroCorto(i.consumo_7_dias)}</span>
            <span>${i.dias_cobertura === null ? 'Sin consumo reciente' : `Cobertura ≈ ${numero(i.dias_cobertura)} días`}</span>
        </div>
        ${gestiona ? html`<div class="insumo-acciones">
            <button type="button" class="btn btn-sm btn-hoja" data-action="entrada"><i class="fa-solid fa-plus"></i> Entrada</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="editar"><i class="fa-solid fa-pen"></i> Editar</button>
            ${tieneRol('administrador') ? html`<button type="button" class="btn btn-sm btn-ghost btn-icono" data-action="eliminar" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>` : ''}
    </article>`;
}

async function cargarKardex() {
    const cuerpo = $('#tabla-kardex');
    cuerpo.innerHTML = filasEsqueleto(4, 7);
    try {
        const movimientos = await insumosService.movimientos({ id_insumo: $('#kardex-filtro').value, limite: 60 });
        cuerpo.innerHTML = movimientos.length ? html`${movimientos.map(m => html`
            <tr>
                <td><small>${fechaHora(m.fecha_hora)}</small></td>
                <td><strong>${m.insumo}</strong></td>
                <td><span class="badge badge-${m.tipo}">${TIPOS[m.tipo] || m.tipo}</span></td>
                <td class="num ${m.cantidad >= 0 ? 'positivo' : 'negativo'}">${m.cantidad >= 0 ? '+' : ''}${numero(m.cantidad)} ${m.unidad_medida}</td>
                <td class="num">${numero(m.stock_resultante)}</td>
                <td>${m.referencia || '—'}</td>
                <td><small>${m.usuario || '—'}</small></td>
            </tr>`)}` : vacio('fa-list-check', 'Aún no hay movimientos de inventario.', 7);
    } catch (error) {
        cuerpo.innerHTML = vacio('fa-plug-circle-xmark', error.message, 7);
    }
}

async function cargar() {
    const grid = $('#insumos-grid');
    if (!insumos.length) grid.innerHTML = bloquesEsqueleto(4);
    try {
        insumos = await insumosService.listar();
        grid.innerHTML = insumos.length ? html`${insumos.map(tarjeta)}` : vacio('fa-box-open', 'No hay insumos registrados.');
        // Anima las barras de progreso desde 0
        requestAnimationFrame(() => grid.querySelectorAll('[data-ancho]').forEach((b) => { b.style.width = `${b.dataset.ancho}%`; }));

        const filtro = $('#kardex-filtro');
        const valor = filtro.value;
        filtro.innerHTML = html`<option value="">Todos los insumos</option>${insumos.map(i => html`<option value="${i.id_insumo}">${i.nombre}</option>`)}`;
        filtro.value = valor;
    } catch (error) {
        grid.innerHTML = vacio('fa-plug-circle-xmark', error.message);
    }
    cargarKardex();
}

function abrirFormulario(insumo = null) {
    const form = $('#form-insumo');
    form.reset();
    limpiarErrores(form);
    editando = insumo;
    $('#modal-insumo-titulo').innerHTML = insumo ? '<i class="fa-solid fa-pen"></i> Editar insumo' : '<i class="fa-solid fa-box"></i> Nuevo insumo';
    form.querySelector('[data-solo-crear]').hidden = Boolean(insumo);
    if (insumo) {
        form.elements.nombre.value = insumo.nombre;
        form.elements.unidad_medida.value = insumo.unidad_medida.toLowerCase();
        form.elements.stock_minimo.value = insumo.stock_minimo;
    }
    abrirModal('modal-insumo');
}

export const insumosVista = {
    iniciar() {
        $('[data-action="nuevo-insumo"]').addEventListener('click', () => abrirFormulario());
        $('#kardex-filtro').addEventListener('change', cargarKardex);

        const grid = $('#insumos-grid');
        const insumoDe = (b) => insumos.find(i => i.id_insumo === Number(b.closest('.insumo').dataset.id));
        on(grid, 'click', '[data-action="editar"]', (e, b) => abrirFormulario(insumoDe(b)));
        on(grid, 'click', '[data-action="entrada"]', (e, b) => {
            entradaPara = insumoDe(b);
            const form = $('#form-entrada');
            form.reset();
            limpiarErrores(form);
            $('#entrada-insumo').textContent = `${entradaPara.nombre} · stock actual ${numero(entradaPara.stock_actual)} ${entradaPara.unidad_medida}`;
            abrirModal('modal-entrada');
        });
        on(grid, 'click', '[data-action="eliminar"]', async (e, b) => {
            const i = insumoDe(b);
            if (!(await confirmar(`¿Eliminar el insumo "${i.nombre}"? Dejará de aparecer, pero su historial se conserva.`, { textoSi: 'Sí, eliminar' }))) return;
            try {
                await insumosService.eliminar(i.id_insumo);
                toast('Insumo eliminado.', 'exito');
                cargar();
            } catch (error) { toast(error.message, 'error'); }
        });

        $('#form-insumo').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            limpiarErrores(form);
            const datos = leerFormulario(form);
            const boton = form.querySelector('[type=submit]');
            cargando(boton, true);
            try {
                if (editando) {
                    await insumosService.actualizar(editando.id_insumo, { nombre: datos.nombre, unidad_medida: datos.unidad_medida, stock_minimo: datos.stock_minimo });
                    toast('Insumo actualizado.', 'exito');
                } else {
                    await insumosService.crear(datos);
                    toast(`Insumo "${datos.nombre}" creado.`, 'exito');
                }
                cerrarModal('modal-insumo');
                cargar();
            } catch (error) {
                mostrarError(form, error);
            } finally { cargando(boton, false); }
        });

        $('#form-entrada').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            limpiarErrores(form);
            const boton = form.querySelector('[type=submit]');
            cargando(boton, true);
            try {
                const actualizado = await insumosService.registrarEntrada(entradaPara.id_insumo, leerFormulario(form));
                cerrarModal('modal-entrada');
                toast(`Nuevo stock de ${actualizado.nombre}: ${numero(actualizado.stock_actual)} ${actualizado.unidad_medida}.`, 'exito');
                cargar();
            } catch (error) {
                mostrarError(form, error);
            } finally { cargando(boton, false); }
        });
    },

    mostrar: cargar
};

/**
 * COMPONENTES · Interfaz reutilizable
 * Toasts, modales, confirmaciones, contadores animados, esqueletos de carga
 * y manejo de formularios (lectura y errores).
 */
import { $, $$, html } from '../utils/dom.js';

/* ---------------- Toasts ---------------- */
const ICONOS_TOAST = { exito: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

export function toast(mensaje, tipo = 'info', ms = 4200) {
    const contenedor = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.innerHTML = html`<i class="fa-solid ${ICONOS_TOAST[tipo] || ICONOS_TOAST.info}"></i><div>${mensaje}</div>`;
    contenedor.appendChild(el);
    setTimeout(() => {
        el.classList.add('saliendo');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }, ms);
}

/* ---------------- Modales ---------------- */
const pilaModales = [];

export function abrirModal(id, { forzado = false } = {}) {
    const modal = document.getElementById(id);
    modal.hidden = false;
    modal.dataset.forzado = forzado ? '1' : '';
    modal.querySelectorAll('[data-cerrar]').forEach(b => { b.hidden = forzado; });
    if (!pilaModales.includes(id)) pilaModales.push(id);
    const foco = modal.querySelector('input:not([type=hidden]), select, button:not(.modal-cerrar)');
    setTimeout(() => foco && foco.focus(), 60);
}

export function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    const i = pilaModales.indexOf(id);
    if (i >= 0) pilaModales.splice(i, 1);
    modal.dispatchEvent(new CustomEvent('cerrado'));
}

export function iniciarModales() {
    document.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (!modal || modal.dataset.forzado) return;
        if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarModal(modal.id);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !pilaModales.length) return;
        const id = pilaModales[pilaModales.length - 1];
        if (!document.getElementById(id).dataset.forzado) cerrarModal(id);
    });
}

export function confirmar(texto, { textoSi = 'Sí, continuar' } = {}) {
    return new Promise((resolver) => {
        $('#confirmar-texto').textContent = texto;
        const modal = $('#modal-confirmar');
        $('[data-respuesta="si"]', modal).textContent = textoSi;
        const responder = (valor) => {
            modal.removeEventListener('click', alClic);
            modal.removeEventListener('cerrado', alCerrar);
            cerrarModal('modal-confirmar');
            resolver(valor);
        };
        const alClic = (e) => {
            const b = e.target.closest('[data-respuesta]');
            if (b) responder(b.dataset.respuesta === 'si');
        };
        const alCerrar = () => resolver(false);
        modal.addEventListener('click', alClic);
        modal.addEventListener('cerrado', alCerrar, { once: true });
        abrirModal('modal-confirmar');
    });
}

/* ---------------- Efectos ---------------- */
export function animarNumero(el, destino, formato = (v) => Math.round(v).toLocaleString('es-CO'), ms = 900) {
    const inicio = Number(el.dataset.valor || 0);
    el.dataset.valor = destino;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || inicio === destino) {
        el.textContent = formato(destino);
        return;
    }
    const t0 = performance.now();
    const paso = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        const suave = 1 - Math.pow(1 - p, 3);
        el.textContent = formato(inicio + (destino - inicio) * suave);
        if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
}

export function iniciarOndas() {
    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn || btn.disabled) return;
        const r = btn.getBoundingClientRect();
        const onda = document.createElement('span');
        const lado = Math.max(r.width, r.height);
        onda.className = 'onda';
        onda.style.width = onda.style.height = `${lado}px`;
        onda.style.left = `${e.clientX - r.left - lado / 2}px`;
        onda.style.top = `${e.clientY - r.top - lado / 2}px`;
        btn.appendChild(onda);
        onda.addEventListener('animationend', () => onda.remove(), { once: true });
    });
}

export function rebotar(el) {
    el.classList.remove('rebote');
    void el.offsetWidth;
    el.classList.add('rebote');
}

/* ---------------- Estados de carga y vacío ---------------- */
export const filasEsqueleto = (filas, columnas) => html`${Array.from({ length: filas }, () => html`
    <tr>${Array.from({ length: columnas }, () => html`<td><div class="esqueleto"></div></td>`)}</tr>`)}`;

export const bloquesEsqueleto = (n) => html`${Array.from({ length: n }, () => html`<div class="esqueleto esqueleto-bloque"></div>`)}`;

export const vacio = (icono, texto, columnas) => columnas
    ? html`<tr><td colspan="${columnas}"><div class="vacio"><i class="fa-solid ${icono}"></i>${texto}</div></td></tr>`
    : html`<div class="vacio"><i class="fa-solid ${icono}"></i>${texto}</div>`;

export function cargando(boton, activo) {
    if (!boton) return;
    boton.classList.toggle('cargando', activo);
    boton.disabled = activo;
}

/* ---------------- Formularios ---------------- */
export function leerFormulario(form) {
    const datos = {};
    new FormData(form).forEach((valor, clave) => {
        datos[clave] = typeof valor === 'string' ? valor.trim() : valor;
    });
    return datos;
}

export function limpiarErrores(form) {
    $$('.invalido', form).forEach(el => el.classList.remove('invalido'));
    const caja = $('.form-error', form);
    if (caja) { caja.hidden = true; caja.textContent = ''; }
}

export function mostrarError(form, error) {
    const caja = $('.form-error', form);
    if (caja) {
        caja.textContent = error.message || String(error);
        caja.hidden = false;
        caja.style.animation = 'none';
        void caja.offsetWidth;
        caja.style.animation = '';
    }
    const campos = error.detalles && error.detalles.campos;
    if (campos) {
        Object.keys(campos).forEach((nombre) => {
            const input = form.elements[nombre];
            if (input && input.classList) input.classList.add('invalido');
        });
    }
}

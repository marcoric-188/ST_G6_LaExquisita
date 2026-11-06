/**
 * UTILIDADES · DOM y protección XSS
 * html`...` escapa AUTOMÁTICAMENTE todo valor interpolado. Así, aunque un cliente
 * se registre con el nombre "<script>…", se muestra como texto y no se ejecuta.
 * Solo raw() permite HTML, y se usa únicamente con plantillas propias.
 */
export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapar = (valor) => String(valor ?? '').replace(/[&<>"'`]/g, (c) => ESCAPES[c]);

class HtmlSeguro {
    constructor(texto) { this.texto = texto; }
    toString() { return this.texto; }
}

export const raw = (texto) => new HtmlSeguro(texto);

function convertir(valor) {
    if (valor instanceof HtmlSeguro) return valor.texto;
    if (Array.isArray(valor)) return valor.map(convertir).join('');
    if (valor === null || valor === undefined || valor === false) return '';
    return escapar(valor);
}

export function html(partes, ...valores) {
    return raw(partes.reduce((acc, parte, i) => acc + convertir(valores[i - 1]) + parte));
}

/** Delegación de eventos: on(contenedor, 'click', '[data-action]', fn) */
export function on(raiz, evento, selector, fn) {
    raiz.addEventListener(evento, (e) => {
        const objetivo = e.target.closest(selector);
        if (objetivo && raiz.contains(objetivo)) fn(e, objetivo);
    });
}

export function debounce(fn, ms = 250) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

/** Texto con **negritas** simples, escapando todo lo demás. */
export function textoEnriquecido(texto) {
    return raw(escapar(texto).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
}

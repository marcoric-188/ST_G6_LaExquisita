/**
 * VISTA · Asistente IA (chat conectado en vivo a SQL Server)
 */
import { $, html, on, textoEnriquecido } from '../utils/dom.js';
import { estado } from '../core/store.js';
import { iaService } from '../services/ia.service.js';

const historial = [];
let ocupado = false;

function agregarMensaje(texto, quien, meta = '') {
    const contenedor = $('#chat-mensajes');
    const el = document.createElement('div');
    el.className = `mensaje ${quien}`;
    el.innerHTML = quien === 'usuario'
        ? html`<div class="burbuja">${texto}</div>`
        : html`<span class="avatar-bot"><img src="assets/img/logo.png" alt=""></span><div class="burbuja">${textoEnriquecido(texto)}${meta ? html`<span class="meta">${meta}</span>` : ''}</div>`;
    contenedor.appendChild(el);
    contenedor.scrollTo({ top: contenedor.scrollHeight, behavior: 'smooth' });
    return el;
}

function mostrarEscribiendo() {
    const el = agregarMensaje('', 'bot');
    el.querySelector('.burbuja').innerHTML = '<span class="escribiendo"><span></span><span></span><span></span></span>';
    return el;
}

async function preguntar(texto) {
    if (ocupado || !texto.trim()) return;
    ocupado = true;
    const input = $('#chat-input');
    input.value = '';
    agregarMensaje(texto, 'usuario');
    const escribiendo = mostrarEscribiendo();
    try {
        const r = await iaService.preguntar(texto, historial.slice(-8));
        escribiendo.remove();
        agregarMensaje(r.respuesta, 'bot');
        historial.push({ role: 'user', content: texto }, { role: 'assistant', content: r.respuesta });
    } catch (error) {
        escribiendo.remove();
        agregarMensaje(`No pude consultar los datos: ${error.message}`, 'bot').classList.add('error');
    } finally {
        ocupado = false;
        input.focus();
    }
}

export const asistenteVista = {
    iniciar() {
        const nombre = estado.usuario ? estado.usuario.nombre.split(' ')[0] : '';
        agregarMensaje(`Hola, ${nombre}. Pregúntame lo que necesites del negocio: ventas, inventario, clientes, mermas o cuántas arepas preparar mañana.`, 'bot');
        $('#form-chat').addEventListener('submit', (e) => {
            e.preventDefault();
            preguntar($('#chat-input').value);
        });
        on($('#chat-sugerencias'), 'click', '.chip', (e, chip) => preguntar(chip.textContent));
    },

    mostrar() {
        setTimeout(() => $('#chat-input').focus(), 60);
    }
};

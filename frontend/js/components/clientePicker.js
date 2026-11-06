/**
 * COMPONENTE · Selector de cliente del POS
 *  - Busca clientes existentes en SQL Server mientras se escribe (autocompletar).
 *  - Si existe: un clic y queda seleccionado.
 *  - Si no existe: botón "Registrar nuevo" que abre el formulario y lo deja seleccionado.
 *  - Navegable con teclado (↑ ↓ Enter Esc).
 */
import { $, html, on, debounce } from '../utils/dom.js';
import { dinero, iniciales } from '../utils/format.js';
import { clientesService } from '../services/clientes.service.js';
import { abrirFormularioCliente } from './clienteForm.js';

export function crearClientePicker({ onCambio }) {
    const input = $('#cliente-buscar');
    const lista = $('#picker-resultados');
    const barra = $('#picker-barra');
    const tarjeta = $('#cliente-seleccionado');
    let resultados = [];
    let indice = -1;
    let seleccionado = null;
    let ultimaBusqueda = 0;

    const cerrarLista = () => { lista.hidden = true; indice = -1; };

    function pintarResultados(texto) {
        const filas = resultados.map((c, i) => html`
            <li role="option" data-i="${i}" class="${i === indice ? 'activo' : ''}">
                <span class="avatar">${iniciales(c.nombre)}</span>
                <span class="info"><strong>${c.nombre}</strong>
                    <small>${[c.documento && `Doc. ${c.documento}`, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small></span>
                <span class="badge badge-${c.rango}">${c.rango}</span>
            </li>`);
        lista.innerHTML = html`${filas}
            <li class="sin-resultados">
                <span>${resultados.length ? '¿No es ninguno?' : html`No hay clientes con “${texto}”.`}</span>
                <button type="button" class="btn btn-sm btn-maiz" data-action="registrar-desde-busqueda"><i class="fa-solid fa-user-plus"></i> Registrar nuevo</button>
            </li>`;
        lista.hidden = false;
    }

    const buscar = debounce(async () => {
        const texto = input.value.trim();
        if (texto.length < 1) { cerrarLista(); return; }
        const id = ++ultimaBusqueda;
        try {
            const encontrados = await clientesService.buscar(texto);
            if (id !== ultimaBusqueda) return; // llegó una respuesta vieja
            resultados = encontrados;
            indice = resultados.length ? 0 : -1;
            pintarResultados(texto);
        } catch (_) { /* el toast global ya informa */ }
    }, 220);

    function seleccionar(cliente) {
        seleccionado = cliente;
        cerrarLista();
        input.value = '';
        barra.hidden = true;
        tarjeta.hidden = false;
        tarjeta.innerHTML = html`
            <span class="avatar avatar-lg">${iniciales(cliente.nombre)}</span>
            <div class="info">
                <strong>${cliente.nombre} <span class="badge badge-${cliente.rango}">${cliente.rango}</span></strong>
                <small>${[cliente.tipo_cliente === 'negocio' ? 'Negocio' : 'Persona', cliente.documento && `Doc. ${cliente.documento}`, cliente.telefono].filter(Boolean).join(' · ')}</small><br>
                <small>Compras: ${cliente.numero_compras} · Acumulado ${dinero(cliente.total_compras)}</small>
            </div>
            <button type="button" class="btn btn-sm btn-ghost" data-action="cambiar-cliente"><i class="fa-solid fa-arrow-right-arrow-left"></i> Cambiar</button>`;
        onCambio(cliente);
    }

    function limpiar() {
        seleccionado = null;
        tarjeta.hidden = true;
        barra.hidden = false;
        input.value = '';
        onCambio(null);
    }

    function registrarNuevo() {
        const texto = input.value.trim();
        cerrarLista();
        abrirFormularioCliente({ nombreSugerido: texto, onGuardado: seleccionar });
    }

    input.addEventListener('input', buscar);
    input.addEventListener('focus', () => { if (input.value.trim()) buscar(); });
    input.addEventListener('keydown', (e) => {
        if (lista.hidden) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); indice = Math.min(resultados.length - 1, indice + 1); pintarResultados(input.value.trim()); }
        if (e.key === 'ArrowUp') { e.preventDefault(); indice = Math.max(0, indice - 1); pintarResultados(input.value.trim()); }
        if (e.key === 'Enter') { e.preventDefault(); if (resultados[indice]) seleccionar(resultados[indice]); else registrarNuevo(); }
        if (e.key === 'Escape') cerrarLista();
    });
    on(lista, 'click', 'li[data-i]', (e, li) => seleccionar(resultados[Number(li.dataset.i)]));
    on(lista, 'click', '[data-action="registrar-desde-busqueda"]', registrarNuevo);
    on(tarjeta, 'click', '[data-action="cambiar-cliente"]', () => { limpiar(); input.focus(); });
    $('[data-action="nuevo-cliente-pos"]').addEventListener('click', registrarNuevo);
    document.addEventListener('click', (e) => { if (!e.target.closest('#cliente-picker')) cerrarLista(); });

    return {
        obtener: () => seleccionado,
        limpiar,
        seleccionar
    };
}

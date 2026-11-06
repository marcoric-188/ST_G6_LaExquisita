/**
 * VISTA · Clientes (directorio, rangos, detalle, edición)
 */
import { $, html, on, debounce } from '../utils/dom.js';
import { dinero, numero, fechaCorta, fechaHora, iniciales, METODOS_PAGO } from '../utils/format.js';
import { estado, tieneRol } from '../core/store.js';
import { clientesService } from '../services/clientes.service.js';
import { abrirFormularioCliente } from '../components/clienteForm.js';
import { toast, filasEsqueleto, vacio, confirmar, abrirModal, cerrarModal } from '../components/ui.js';

let clientes = [];

function pintarResumen(e) {
    const datos = [
        ['Clientes activos', e.total, 'fa-users'],
        ['VIP', e.vip, 'fa-crown'],
        ['Frecuentes', e.frecuentes, 'fa-star'],
        ['Regulares', e.regulares, 'fa-user-check'],
        ['Nuevos (sin compras)', e.nuevos, 'fa-seedling']
    ];
    $('#clientes-resumen').innerHTML = html`${datos.map(([t, v, i], k) => html`
        <div class="chip-resumen" style="animation-delay:${k * 50}ms"><small><i class="fa-solid ${i}"></i> ${t}</small><strong>${numero(v)}</strong></div>`)}`;
}

function pintarTabla() {
    const cuerpo = $('#tabla-clientes');
    if (!clientes.length) {
        cuerpo.innerHTML = vacio('fa-user-slash', 'No se encontraron clientes.', 7);
        return;
    }
    const puedeEliminar = tieneRol('administrador');
    cuerpo.innerHTML = html`${clientes.map((c, i) => html`
        <tr data-id="${c.id_cliente}" style="animation-delay:${Math.min(i, 15) * 25}ms">
            <td><div class="celda-cliente"><span class="avatar">${iniciales(c.nombre)}</span>
                <div><strong>${c.nombre}</strong><small>${c.documento ? `Doc. ${c.documento}` : 'Sin documento'}</small></div></div></td>
            <td>${c.telefono || '—'}<br><small>${c.correo || ''}</small></td>
            <td><span class="badge badge-neutro">${c.tipo_cliente === 'negocio' ? 'Negocio' : 'Persona'}</span></td>
            <td class="num">${numero(c.numero_compras)}</td>
            <td class="num"><span class="monto">${dinero(c.total_compras)}</span></td>
            <td><span class="badge badge-${c.rango}">${c.rango === 'VIP' ? html`<i class="fa-solid fa-crown"></i> ` : ''}${c.rango}</span></td>
            <td><div class="acciones">
                <button type="button" class="btn btn-sm btn-maiz" data-action="vender" title="Venderle"><i class="fa-solid fa-cash-register"></i></button>
                <button type="button" class="btn btn-sm btn-ghost" data-action="ver" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
                <button type="button" class="btn btn-sm btn-ghost" data-action="editar" title="Editar"><i class="fa-solid fa-pen"></i></button>
                ${puedeEliminar ? html`<button type="button" class="btn btn-sm btn-ghost" data-action="eliminar" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div></td>
        </tr>`)}`;
}

async function cargar() {
    const buscar = $('#clientes-buscar').value.trim();
    if (!clientes.length) $('#tabla-clientes').innerHTML = filasEsqueleto(5, 7);
    try {
        const datos = await clientesService.listar({ buscar });
        clientes = datos.clientes;
        pintarResumen(datos.estadisticas);
        pintarTabla();
    } catch (error) {
        $('#tabla-clientes').innerHTML = vacio('fa-plug-circle-xmark', error.message, 7);
    }
}

async function verDetalle(id) {
    try {
        const c = await clientesService.obtener(id);
        $('#cliente-detalle-cuerpo').innerHTML = html`
            <div class="detalle-cliente-cabecera">
                <span class="avatar avatar-lg">${iniciales(c.nombre)}</span>
                <div><h3>${c.nombre}</h3><span class="badge badge-${c.rango}">${c.rango}</span> <span class="badge badge-neutro">${c.tipo_cliente === 'negocio' ? 'Negocio' : 'Persona'}</span></div>
            </div>
            <div class="datos-grid">
                <div><small>Documento</small>${c.documento || '—'}</div>
                <div><small>Teléfono</small>${c.telefono || '—'}</div>
                <div><small>Correo</small>${c.correo || '—'}</div>
                <div><small>Dirección</small>${c.direccion || '—'}</div>
                <div><small>Total comprado</small><span class="monto">${dinero(c.total_compras)}</span></div>
                <div><small>Compras · última</small>${numero(c.numero_compras)} · ${fechaCorta(c.ultima_compra)}</div>
            </div>
            <h4 style="margin-bottom:8px">Últimas compras</h4>
            ${c.compras.length ? html`<div class="lista-compacta">${c.compras.map(v => html`
                <div class="item-compacto"><span class="icono-redondo"><i class="fa-solid ${(METODOS_PAGO[v.metodo_pago] || METODOS_PAGO.efectivo).icono}"></i></span>
                <span class="info"><strong>Venta #${v.id_venta}</strong><small>${fechaHora(v.fecha_hora)}</small></span><span class="valor">${dinero(v.total)}</span></div>`)}</div>`
                : vacio('fa-receipt', 'Este cliente aún no tiene compras.')}
            <div class="modal-pie" style="padding:16px 0 12px"><button type="button" class="btn btn-maiz" data-action="vender-detalle"><i class="fa-solid fa-cash-register"></i> Registrar venta a este cliente</button></div>`;
        $('[data-action="vender-detalle"]').addEventListener('click', () => {
            cerrarModal('modal-cliente-detalle');
            venderA(c);
        });
        abrirModal('modal-cliente-detalle');
    } catch (error) {
        toast(error.message, 'error');
    }
}

function venderA(cliente) {
    estado.clientePendiente = cliente;
    location.hash = '#/pos';
}

export const clientesVista = {
    iniciar() {
        $('#clientes-buscar').addEventListener('input', debounce(cargar, 280));
        $('[data-action="nuevo-cliente"]').addEventListener('click', () => abrirFormularioCliente({ onGuardado: cargar }));

        const cuerpo = $('#tabla-clientes');
        const clienteDe = (b) => clientes.find(c => c.id_cliente === Number(b.closest('tr').dataset.id));
        on(cuerpo, 'click', '[data-action="ver"]', (e, b) => verDetalle(clienteDe(b).id_cliente));
        on(cuerpo, 'click', '[data-action="vender"]', (e, b) => venderA(clienteDe(b)));
        on(cuerpo, 'click', '[data-action="editar"]', (e, b) => abrirFormularioCliente({ cliente: clienteDe(b), onGuardado: cargar }));
        on(cuerpo, 'click', '[data-action="eliminar"]', async (e, b) => {
            const c = clienteDe(b);
            if (!(await confirmar(`¿Eliminar a "${c.nombre}"? Su historial de ventas se conserva.`, { textoSi: 'Sí, eliminar' }))) return;
            try {
                await clientesService.eliminar(c.id_cliente);
                toast('Cliente eliminado.', 'exito');
                cargar();
            } catch (error) {
                toast(error.message, 'error');
            }
        });
    },

    mostrar: cargar
};

/**
 * COMPONENTE · Formulario de cliente (crear / editar)
 * Lo usan el POS (registrar cliente nuevo en plena venta) y el módulo Clientes.
 */
import { $ } from '../utils/dom.js';
import { clientesService } from '../services/clientes.service.js';
import { abrirModal, cerrarModal, leerFormulario, limpiarErrores, mostrarError, cargando, toast } from './ui.js';

let alGuardar = null;
let clienteEditando = null;

export function iniciarFormularioCliente() {
    const form = $('#form-cliente');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiarErrores(form);
        const datos = leerFormulario(form);
        if (datos.nombre.length < 3) {
            return mostrarError(form, { message: 'El nombre debe tener mínimo 3 caracteres.', detalles: { campos: { nombre: 1 } } });
        }
        const boton = form.querySelector('[type=submit]');
        cargando(boton, true);
        try {
            const cliente = clienteEditando
                ? await clientesService.actualizar(clienteEditando.id_cliente, datos)
                : await clientesService.crear(datos);
            cerrarModal('modal-cliente');
            toast(clienteEditando ? `Cliente "${cliente.nombre}" actualizado.` : `Cliente "${cliente.nombre}" registrado.`, 'exito');
            if (alGuardar) alGuardar(cliente);
        } catch (error) {
            mostrarError(form, error);
            // El documento ya existe: ofrecer seleccionar ese cliente en lugar de duplicarlo
            const idExistente = error.status === 409 && error.detalles && error.detalles.id_cliente;
            if (idExistente && !clienteEditando && alGuardar) {
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'btn btn-sm btn-maiz';
                boton.style.marginTop = '8px';
                boton.dataset.action = 'usar-existente';
                boton.innerHTML = '<i class="fa-solid fa-user-check"></i> Seleccionar el cliente existente';
                boton.addEventListener('click', async () => {
                    try {
                        const existente = await clientesService.obtener(idExistente);
                        cerrarModal('modal-cliente');
                        alGuardar(existente);
                    } catch (e) { toast(e.message, 'error'); }
                });
                $('.form-error', form).appendChild(document.createElement('br'));
                $('.form-error', form).appendChild(boton);
            }
        } finally {
            cargando(boton, false);
        }
    });
}

/**
 * @param {object} opciones
 * @param {object} [opciones.cliente]  cliente a editar (si no, se crea uno nuevo)
 * @param {string} [opciones.nombreSugerido] texto que el cajero ya había buscado
 * @param {function} opciones.onGuardado callback con el cliente guardado
 */
export function abrirFormularioCliente({ cliente = null, nombreSugerido = '', onGuardado } = {}) {
    const form = $('#form-cliente');
    form.reset();
    limpiarErrores(form);
    clienteEditando = cliente;
    alGuardar = onGuardado;
    $('#modal-cliente-titulo').innerHTML = cliente
        ? '<i class="fa-solid fa-user-pen"></i> Editar cliente'
        : '<i class="fa-solid fa-user-plus"></i> Nuevo cliente';

    if (cliente) {
        ['nombre', 'documento', 'telefono', 'correo', 'direccion', 'tipo_cliente'].forEach((campo) => {
            form.elements[campo].value = cliente[campo] || (campo === 'tipo_cliente' ? 'persona' : '');
        });
    } else if (nombreSugerido) {
        // Si escribió números, probablemente es cédula o teléfono
        if (/^\d{7,}$/.test(nombreSugerido)) form.elements[nombreSugerido.startsWith('3') && nombreSugerido.length === 10 ? 'telefono' : 'documento'].value = nombreSugerido;
        else form.elements.nombre.value = nombreSugerido;
    }
    abrirModal('modal-cliente');
}

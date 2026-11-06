/**
 * VISTA · Sesión del usuario (menú superior, cambio de contraseña, salir)
 */
import { $ } from '../utils/dom.js';
import { iniciales, capitalizar } from '../utils/format.js';
import { estado } from '../core/store.js';
import { authService } from '../services/auth.service.js';
import { abrirModal, cerrarModal, leerFormulario, limpiarErrores, mostrarError, cargando, toast } from '../components/ui.js';

let alCambiarObligatorio = null;

export const sesionVista = {
    iniciar({ onLogout }) {
        const chip = $('[data-action="menu-usuario"]');
        const menu = $('#usuario-dropdown');
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.hidden = !menu.hidden;
            chip.setAttribute('aria-expanded', String(!menu.hidden));
        });
        document.addEventListener('click', () => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); });

        $('[data-action="cambiar-password"]').addEventListener('click', () => sesionVista.pedirCambioPassword(false));
        $('[data-action="logout"]').addEventListener('click', async () => {
            try { await authService.logout(); } catch (_) { /* igual se cierra en pantalla */ }
            onLogout();
        });

        const form = $('#form-password');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            limpiarErrores(form);
            const { actual, nueva, confirmar } = leerFormulario(form);
            if (nueva !== confirmar) {
                return mostrarError(form, { message: 'Las contraseñas nuevas no coinciden.', detalles: { campos: { confirmar: 1 } } });
            }
            if (nueva.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) || !/\d/.test(nueva)) {
                return mostrarError(form, { message: 'La contraseña debe tener mínimo 8 caracteres y combinar letras y números.', detalles: { campos: { nueva: 1 } } });
            }
            const boton = form.querySelector('[type=submit]');
            cargando(boton, true);
            try {
                await authService.cambiarPassword(actual, nueva);
                estado.usuario.debe_cambiar_password = false;
                cerrarModal('modal-password');
                toast('Contraseña actualizada correctamente.', 'exito');
                if (alCambiarObligatorio) {
                    const continuar = alCambiarObligatorio;
                    alCambiarObligatorio = null;
                    continuar();
                }
            } catch (error) {
                mostrarError(form, error);
            } finally {
                cargando(boton, false);
            }
        });
    },

    pintarUsuario(usuario) {
        $('#usuario-avatar').textContent = iniciales(usuario.nombre);
        $('#usuario-nombre').textContent = usuario.nombre;
        $('#usuario-rol').textContent = capitalizar(usuario.rol);
    },

    /** obligatorio = no se puede cerrar hasta cambiarla (contraseña temporal). */
    pedirCambioPassword(obligatorio, alTerminar) {
        const form = $('#form-password');
        form.reset();
        limpiarErrores(form);
        $('#password-obligatorio').hidden = !obligatorio;
        alCambiarObligatorio = obligatorio ? alTerminar : null;
        abrirModal('modal-password', { forzado: obligatorio });
    }
};

/**
 * VISTA · Inicio de sesión
 */
import { $ } from '../utils/dom.js';
import { authService } from '../services/auth.service.js';
import { leerFormulario, limpiarErrores, mostrarError, cargando } from '../components/ui.js';

export const loginVista = {
    iniciar({ onLogin }) {
        const form = $('#form-login');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            limpiarErrores(form);
            const { correo, password } = leerFormulario(form);
            if (!correo || !password) {
                return mostrarError(form, { message: 'Escribe tu correo y tu contraseña.' });
            }
            const boton = form.querySelector('[type=submit]');
            cargando(boton, true);
            try {
                const usuario = await authService.login(correo, password);
                form.reset();
                onLogin(usuario);
            } catch (error) {
                mostrarError(form, error);
                form.elements.password.value = '';
                form.elements.password.focus();
            } finally {
                cargando(boton, false);
            }
        });

        $('[data-action="ver-password"]', form).addEventListener('click', (e) => {
            const input = form.elements.password;
            const mostrar = input.type === 'password';
            input.type = mostrar ? 'text' : 'password';
            e.currentTarget.innerHTML = `<i class="fa-solid ${mostrar ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        });
    },

    mostrar() {
        $('#app').hidden = true;
        $('#pantalla-login').hidden = false;
        setTimeout(() => $('#form-login').elements.correo.focus(), 50);
    }
};

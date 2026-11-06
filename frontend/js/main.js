/**
 * ============================================================================
 *  LA EXQUISITA · Punto de entrada del FRONTEND
 * ----------------------------------------------------------------------------
 *  ARQUITECTURA POR CAPAS DEL FRONTEND (ver docs/ARQUITECTURA.md)
 *
 *    index.html + css/      PRESENTACIÓN: estructura y estilos (colorimetría del logo)
 *          │
 *    js/views/              CONTROLADORES DE VISTA: eventos de cada pantalla y pintado
 *          │                (inicio, pos, clientes, insumos, mermas, ventas, asistente)
 *    js/components/         COMPONENTES: modales, toasts, selector de cliente, formularios
 *          │
 *    js/services/           SERVICIOS: una función por endpoint de la API REST
 *          │
 *    js/core/               NÚCLEO: config, cliente HTTP (fetch), estado global y rutas
 *          │
 *    js/utils/              UTILIDADES: escape anti-XSS (html``), formatos COP y fechas
 *          ▼
 *    Backend /api (Express)  ->  SQL Server
 * ============================================================================
 */
import { $ } from './utils/dom.js';
import { estado, escuchar, aplicarPermisos } from './core/store.js';
import { registrarRuta, iniciarRouter, navegar } from './core/router.js';
import { authService } from './services/auth.service.js';
import { sistemaService } from './services/sistema.service.js';
import { iniciarModales, iniciarOndas, toast, cerrarModal } from './components/ui.js';
import { iniciarFormularioCliente } from './components/clienteForm.js';

import { loginVista } from './views/login.view.js';
import { sesionVista } from './views/sesion.view.js';
import { inicioVista } from './views/inicio.view.js';
import { posVista } from './views/pos.view.js';
import { clientesVista } from './views/clientes.view.js';
import { insumosVista } from './views/insumos.view.js';
import { mermasVista } from './views/mermas.view.js';
import { ventasVista } from './views/ventas.view.js';
import { asistenteVista } from './views/asistente.view.js';

const ADMIN = 'administrador';
const CAJERO = 'cajero';

let routerIniciado = false;
let sondeoBD = null;

/* ---------------- Rutas (con permisos por rol) ---------------- */
registrarRuta('inicio', { vista: inicioVista });
registrarRuta('pos', { vista: posVista, roles: [ADMIN, CAJERO] });
registrarRuta('clientes', { vista: clientesVista, roles: [ADMIN, CAJERO] });
registrarRuta('insumos', { vista: insumosVista });
registrarRuta('mermas', { vista: mermasVista });
registrarRuta('ventas', { vista: ventasVista, roles: [ADMIN, CAJERO] });
registrarRuta('asistente', { vista: asistenteVista });

/* ---------------- Conexión con la base de datos ---------------- */
async function revisarBaseDeDatos() {
    const salud = await sistemaService.estado();
    const bd = salud.base_de_datos || {};
    const banner = $('#banner-bd');
    if (bd.conectada) {
        if (!banner.hidden) {
            banner.hidden = true;
            toast('Conexión con SQL Server restablecida.', 'exito');
            if (estado.usuario) navegar();
        }
        clearInterval(sondeoBD);
        sondeoBD = null;
        return true;
    }
    $('#banner-bd-texto').textContent = bd.sugerencia || 'Reintentando…';
    banner.hidden = false;
    if (!sondeoBD) sondeoBD = setInterval(revisarBaseDeDatos, 8000);
    return false;
}

/* ---------------- Sesión ---------------- */
function mostrarLogin() {
    estado.usuario = null;
    document.querySelectorAll('.modal').forEach(m => cerrarModal(m.id));
    loginVista.mostrar();
}

async function entrarApp(usuario) {
    estado.usuario = usuario;
    sesionVista.pintarUsuario(usuario);
    aplicarPermisos();
    $('#pantalla-login').hidden = true;
    $('#app').hidden = false;

    const arrancar = async () => {
        if (!routerIniciado) {
            routerIniciado = true;
            await iniciarRouter();
        } else {
            await navegar();
        }
    };

    if (usuario.debe_cambiar_password) {
        sesionVista.pedirCambioPassword(true, arrancar);
    } else {
        await arrancar();
    }
}

/* ---------------- Arranque ---------------- */
async function iniciar() {
    iniciarModales();
    iniciarOndas();
    iniciarFormularioCliente();
    loginVista.iniciar({ onLogin: entrarApp });
    sesionVista.iniciar({
        onLogout: () => {
            toast('Sesión cerrada. ¡Hasta pronto!', 'info');
            location.hash = '#/inicio';
            mostrarLogin();
        }
    });

    $('[data-action="reintentar-bd"]').addEventListener('click', revisarBaseDeDatos);

    escuchar('sesion-expirada', (mensaje) => {
        if (!estado.usuario) return;
        toast(mensaje || 'Tu sesión expiró. Inicia sesión de nuevo.', 'error');
        mostrarLogin();
    });
    escuchar('cambiar-password', () => {
        if (estado.usuario) sesionVista.pedirCambioPassword(true, navegar);
    });
    escuchar('bd-desconectada', revisarBaseDeDatos);

    await revisarBaseDeDatos();

    try {
        const usuario = await authService.perfil();
        await entrarApp(usuario);
    } catch (_) {
        mostrarLogin();
    }
}

iniciar();

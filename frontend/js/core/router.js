/**
 * CAPA CORE · Enrutador por hash (#/inicio, #/pos, ...)
 * Muestra una vista a la vez, valida permisos por rol y marca la navegación.
 */
import { tieneRol, estado } from './store.js';

const rutas = new Map();
let vistaActual = null;

export function registrarRuta(nombre, { vista, roles = null }) {
    rutas.set(nombre, { vista, roles, iniciada: false });
}

function rutaDesdeHash() {
    const nombre = location.hash.replace(/^#\/?/, '').split('?')[0] || 'inicio';
    return rutas.has(nombre) ? nombre : 'inicio';
}

export async function navegar() {
    if (!estado.usuario) return; // sin sesión no se carga ninguna vista
    let nombre = rutaDesdeHash();
    let ruta = rutas.get(nombre);
    if (ruta.roles && !tieneRol(...ruta.roles)) {
        nombre = 'inicio';
        ruta = rutas.get(nombre);
        history.replaceState(null, '', '#/inicio');
    }

    document.querySelectorAll('.vista').forEach(s => { s.hidden = s.dataset.vista !== nombre; });
    document.querySelectorAll('.topnav a').forEach(a => a.classList.toggle('activo', a.dataset.ruta === nombre));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    if (!ruta.iniciada && ruta.vista.iniciar) {
        ruta.vista.iniciar();
        ruta.iniciada = true;
    }
    vistaActual = nombre;
    if (ruta.vista.mostrar) await ruta.vista.mostrar();
}

export function rutaActual() {
    return vistaActual;
}

export function iniciarRouter() {
    window.addEventListener('hashchange', navegar);
    return navegar();
}

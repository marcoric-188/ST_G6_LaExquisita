/**
 * CAPA CORE · Estado global y bus de eventos
 * Guarda el usuario de la sesión y permite que las capas se comuniquen sin
 * depender unas de otras (ej: http avisa "sesion-expirada" y main.js reacciona).
 */
const bus = new EventTarget();

export const estado = {
    usuario: null
};

export function emitir(nombre, detalle) {
    bus.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
}

export function escuchar(nombre, fn) {
    bus.addEventListener(nombre, (e) => fn(e.detail));
}

export function tieneRol(...roles) {
    return Boolean(estado.usuario && roles.includes(estado.usuario.rol));
}

/** Oculta los elementos con data-roles="a,b" si el usuario no tiene ese rol. */
export function aplicarPermisos(raiz = document) {
    raiz.querySelectorAll('[data-roles]').forEach((el) => {
        const roles = el.dataset.roles.split(',').map(r => r.trim());
        el.hidden = !tieneRol(...roles);
    });
}

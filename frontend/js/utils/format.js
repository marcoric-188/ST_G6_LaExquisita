/**
 * UTILIDADES · Formatos colombianos (pesos, números, fechas)
 */
const fmtDinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

export const dinero = (v) => fmtDinero.format(Number(v) || 0).replace(/\s/g, '');
export const numero = (v) => fmtNumero.format(Number(v) || 0);
const fmtNumero2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
export const numeroCorto = (v) => fmtNumero2.format(Number(v) || 0);

/** El backend envía 'AAAA-MM-DDTHH:mm:ss' en hora local del servidor. */
export const aFecha = (texto) => (texto ? new Date(texto) : null);

export function fechaHora(texto) {
    const f = aFecha(texto);
    return f ? f.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function fechaCorta(texto) {
    const f = aFecha(texto);
    return f ? f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export function haceCuanto(texto) {
    const f = aFecha(texto);
    if (!f) return '—';
    const seg = Math.round((Date.now() - f.getTime()) / 1000);
    if (seg < 60) return 'hace un momento';
    if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
    return fechaCorta(texto);
}

export const hoyISO = (desplazamientoDias = 0) => {
    const f = new Date();
    f.setDate(f.getDate() + desplazamientoDias);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

export function iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

export const capitalizar = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');

export const METODOS_PAGO = {
    efectivo: { etiqueta: 'Efectivo', icono: 'fa-money-bill-wave' },
    nequi: { etiqueta: 'Nequi', icono: 'fa-mobile-screen' },
    daviplata: { etiqueta: 'Daviplata', icono: 'fa-mobile-retro' },
    tarjeta: { etiqueta: 'Tarjeta', icono: 'fa-credit-card' },
    transferencia: { etiqueta: 'Transferencia', icono: 'fa-building-columns' }
};

export const ESTADOS_STOCK = {
    ok: { etiqueta: 'Stock OK', icono: 'fa-circle-check' },
    bajo: { etiqueta: 'Bajo mínimo', icono: 'fa-triangle-exclamation' },
    critico: { etiqueta: 'Crítico', icono: 'fa-fire' },
    agotado: { etiqueta: 'Agotado', icono: 'fa-ban' }
};

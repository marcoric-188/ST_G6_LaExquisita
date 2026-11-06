/**
 * ============================================================================
 *  UTILIDAD TRANSVERSAL · Validación de entradas (seguridad básica)
 * ----------------------------------------------------------------------------
 *  Toda información que llega del navegador se valida y se limpia ANTES de
 *  llegar a los servicios: tipos, longitudes, rangos y listas permitidas.
 *  (La protección contra inyección SQL la dan las consultas parametrizadas
 *  de los repositorios; esto evita datos basura y abusos).
 *
 *  Uso:
 *    const datos = validar(req.body, {
 *        nombre:   { tipo: 'texto', requerido: true, max: 100 },
 *        cantidad: { tipo: 'numero', requerido: true, min: 0.001 }
 *    });
 * ============================================================================
 */
const { badRequest } = require('./AppError');

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const CORREO = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;
const TELEFONO = /^[0-9+()\-\s]{7,20}$/;
const DOCUMENTO = /^[0-9A-Za-z.\-]{5,20}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function limpiarTexto(valor) {
    return String(valor).replace(CONTROL, '').replace(/\s+/g, ' ').trim();
}

function validarCampo(nombre, valor, regla) {
    const etiqueta = regla.etiqueta || nombre;
    const vacio = valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');

    if (vacio) {
        if (regla.requerido) return { error: `${etiqueta} es obligatorio.` };
        return { valor: regla.defecto !== undefined ? regla.defecto : null };
    }

    switch (regla.tipo) {
        case 'texto':
        case 'correo':
        case 'telefono':
        case 'documento': {
            if (typeof valor !== 'string' && typeof valor !== 'number') return { error: `${etiqueta} no es válido.` };
            let texto = limpiarTexto(valor);
            const min = regla.min || 0;
            const max = regla.max || 255;
            if (texto.length < min) return { error: `${etiqueta} debe tener mínimo ${min} caracteres.` };
            if (texto.length > max) return { error: `${etiqueta} admite máximo ${max} caracteres.` };
            if (regla.tipo === 'correo') {
                texto = texto.toLowerCase();
                if (!CORREO.test(texto)) return { error: `${etiqueta} no tiene un formato válido.` };
            }
            if (regla.tipo === 'telefono' && !TELEFONO.test(texto)) return { error: `${etiqueta} solo admite números (7 a 20 dígitos).` };
            if (regla.tipo === 'documento' && !DOCUMENTO.test(texto)) return { error: `${etiqueta} solo admite números, letras, puntos o guiones (5 a 20).` };
            if (regla.patron && !regla.patron.test(texto)) return { error: regla.mensaje || `${etiqueta} no es válido.` };
            return { valor: texto };
        }
        case 'password': {
            if (typeof valor !== 'string') return { error: `${etiqueta} no es válida.` };
            if (valor.length > (regla.max || 128)) return { error: `${etiqueta} es demasiado larga.` };
            return { valor };
        }
        case 'entero':
        case 'numero': {
            const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
            if (!Number.isFinite(numero)) return { error: `${etiqueta} debe ser un número.` };
            if (regla.tipo === 'entero' && !Number.isInteger(numero)) return { error: `${etiqueta} debe ser un número entero.` };
            if (regla.min !== undefined && numero < regla.min) return { error: `${etiqueta} debe ser mayor o igual a ${regla.min}.` };
            if (regla.max !== undefined && numero > regla.max) return { error: `${etiqueta} debe ser menor o igual a ${regla.max}.` };
            return { valor: regla.tipo === 'numero' && regla.decimales !== undefined
                ? Math.round(numero * 10 ** regla.decimales) / 10 ** regla.decimales
                : numero };
        }
        case 'enum': {
            const texto = limpiarTexto(valor).toLowerCase();
            if (!regla.valores.includes(texto)) return { error: `${etiqueta} debe ser uno de: ${regla.valores.join(', ')}.` };
            return { valor: texto };
        }
        case 'fecha': {
            const texto = limpiarTexto(valor);
            if (!FECHA.test(texto) || Number.isNaN(Date.parse(texto))) return { error: `${etiqueta} debe tener formato AAAA-MM-DD.` };
            return { valor: texto };
        }
        case 'booleano':
            return { valor: valor === true || valor === 'true' || valor === 1 || valor === '1' };
        case 'lista': {
            if (!Array.isArray(valor)) return { error: `${etiqueta} debe ser una lista.` };
            if (regla.min && valor.length < regla.min) return { error: regla.mensajeMin || `${etiqueta} debe tener al menos ${regla.min} elemento(s).` };
            if (regla.max && valor.length > regla.max) return { error: `${etiqueta} admite máximo ${regla.max} elementos.` };
            const items = [];
            for (let i = 0; i < valor.length; i++) {
                if (!valor[i] || typeof valor[i] !== 'object') return { error: `${etiqueta} #${i + 1} no es válido.` };
                try {
                    items.push(validar(valor[i], regla.item));
                } catch (error) {
                    return { error: `${etiqueta} #${i + 1}: ${Object.values(error.detalles?.campos || {})[0] || error.message}` };
                }
            }
            return { valor: items };
        }
        default:
            return { error: `Regla de validación desconocida para ${etiqueta}.` };
    }
}

function validar(entrada, reglas) {
    const fuente = entrada && typeof entrada === 'object' ? entrada : {};
    const limpio = {};
    const campos = {};
    for (const [nombre, regla] of Object.entries(reglas)) {
        const { valor, error } = validarCampo(nombre, fuente[nombre], regla);
        if (error) campos[nombre] = error;
        else limpio[nombre] = valor;
    }
    const errores = Object.values(campos);
    if (errores.length) throw badRequest(errores[0], { campos });
    return limpio;
}

/** Valida un parámetro de ruta tipo :id */
function validarId(valor, etiqueta = 'El identificador') {
    return validar({ id: valor }, { id: { tipo: 'entero', requerido: true, min: 1, etiqueta } }).id;
}

module.exports = { validar, validarId, limpiarTexto };

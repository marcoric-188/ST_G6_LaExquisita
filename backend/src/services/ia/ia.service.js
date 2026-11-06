/**
 * ============================================================================
 *  CAPA DE NEGOCIO · Servicio del ASISTENTE IA
 * ----------------------------------------------------------------------------
 *  1. Valida la pregunta y el historial.
 *  2. Consulta el contexto EN VIVO de SQL Server (contexto.service).
 *  3. Responde con OpenAI si está configurado; si no (o si falla), con el
 *     motor local, que siempre usa las cifras exactas de la base de datos.
 *  La IA es de SOLO LECTURA: nunca modifica datos.
 * ============================================================================
 */
const env = require('../../config/env');
const { validar, limpiarTexto } = require('../../utils/validator');
const { construirContexto, contextoParaModelo } = require('./contexto.service');
const motorLocal = require('./motorLocal');
const openai = require('./openai.provider');

function limpiarHistorial(historial) {
    if (!Array.isArray(historial)) return [];
    return historial
        .filter(h => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string')
        .slice(-8)
        .map(h => ({ role: h.role, content: limpiarTexto(h.content).slice(0, 1500) }));
}

function usarModeloExterno() {
    if (!env.ia.openaiKey) return false;
    return env.ia.proveedor === 'openai' || env.ia.proveedor === 'auto';
}

async function preguntar(body) {
    const { mensaje } = validar(body, {
        mensaje: { tipo: 'texto', requerido: true, min: 1, max: 1000, etiqueta: 'La pregunta' }
    });
    const historial = limpiarHistorial(body.historial);
    const contexto = await construirContexto();

    if (usarModeloExterno()) {
        try {
            const { entidades } = motorLocal.analizar(mensaje, contexto, historial);
            const respuesta = await openai.preguntar({
                mensaje,
                historial,
                contexto: contextoParaModelo(contexto, entidades.cliente)
            });
            return { respuesta, modo: 'openai', datos_al: contexto.generado };
        } catch (error) {
            console.error('IA externa no disponible, se usa el motor local:', error.message);
        }
    }

    return {
        respuesta: motorLocal.responder(mensaje, contexto, historial),
        modo: 'local',
        datos_al: contexto.generado
    };
}

module.exports = { preguntar };

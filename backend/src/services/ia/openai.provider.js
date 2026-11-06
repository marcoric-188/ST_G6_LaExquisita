/**
 * CAPA DE NEGOCIO · IA · Proveedor externo OPCIONAL (OpenAI)
 * Solo se usa si backend/.env tiene OPENAI_API_KEY. Recibe el mismo contexto
 * real de la base de datos; si falla, el servicio responde con el motor local.
 * Se usa fetch nativo de Node (no requiere instalar paquetes extra).
 */
const env = require('../../config/env');

const INSTRUCCIONES = `
Eres el asistente de La Exquisita, un negocio colombiano que vende arepas de choclo
en paquetes de 10 (grande y pequeña) y también por unidad.
Responde SIEMPRE en español, breve, claro y con viñetas cuando ayude.
Usa EXCLUSIVAMENTE los números del JSON de contexto (vienen en vivo de SQL Server).
Nunca inventes cifras. Si un dato no está en el contexto, dilo.
Formatea el dinero en pesos colombianos (ej. $23.000) y las cantidades con su unidad.
Puedes recomendar, pero distingue claramente dato real de recomendación.
No puedes modificar la base de datos: solo consultas.
`.trim();

function extraerTexto(respuesta) {
    if (typeof respuesta.output_text === 'string') return respuesta.output_text;
    return (respuesta.output || [])
        .flatMap(item => item.content || [])
        .filter(c => c.type === 'output_text' && typeof c.text === 'string')
        .map(c => c.text)
        .join('\n');
}

async function preguntar({ mensaje, historial, contexto }) {
    const cuerpo = {
        model: env.ia.openaiModel,
        instructions: INSTRUCCIONES,
        input: [
            ...historial.map(h => ({ role: h.role, content: h.content })),
            {
                role: 'user',
                content: `Contexto actual del negocio (JSON):\n${JSON.stringify(contexto)}\n\nPregunta: ${mensaje}`
            }
        ],
        max_output_tokens: 700
    };

    const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.ia.openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(25000)
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((datos.error && datos.error.message) || `HTTP ${res.status}`);

    const texto = extraerTexto(datos).trim();
    if (!texto) throw new Error('El modelo no devolvió texto.');
    return texto;
}

module.exports = { preguntar };

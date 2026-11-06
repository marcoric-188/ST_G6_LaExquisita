const express = require('express');
const router = express.Router();
const { poolPromise } = require('../config/db');
const { buildBusinessContext, generateChatbotAnswer, localAnswer } = require('../services/chatbot.service');

router.post('/', async (req, res) => {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];

    if (!message) {
        return res.status(400).json({
            success: false,
            error: 'Escribe una pregunta para el asistente.'
        });
    }

    if (message.length > 1500) {
        return res.status(400).json({
            success: false,
            error: 'El mensaje no puede superar los 1500 caracteres.'
        });
    }

    try {
        const pool = await poolPromise;
        const businessContext = await buildBusinessContext(pool);

        const useAI = String(process.env.CHATBOT_USE_AI || 'true').toLowerCase() === 'true';
        const hasKey = Boolean(process.env.OPENAI_API_KEY);

        if (useAI && hasKey) {
            try {
                const answer = await generateChatbotAnswer({
                    message,
                    history,
                    businessContext
                });

                return res.json({
                    success: true,
                    mode: 'openai',
                    answer,
                    data_timestamp: businessContext.generatedAt
                });
            } catch (aiError) {
                console.error('Chatbot: fallo al consultar el modelo:', aiError.message);
                return res.json({
                    success: true,
                    mode: 'local_fallback',
                    answer: localAnswer(message, businessContext) +
                        '\n\nNota: en este momento no fue posible consultar el modelo de IA; te muestro el análisis local disponible.',
                    data_timestamp: businessContext.generatedAt
                });
            }
        }

        return res.json({
            success: true,
            mode: 'local',
            answer: localAnswer(message, businessContext),
            data_timestamp: businessContext.generatedAt
        });
    } catch (error) {
        console.error('Chatbot: error consultando la base de datos:', error);
        return res.status(503).json({
            success: false,
            error: 'No pude consultar los datos de La Exquisita. Verifica que SQL Server esté encendido y que la conexión del backend funcione.'
        });
    }
});

module.exports = router;

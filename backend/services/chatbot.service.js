const OpenAI = require('openai');

async function buildBusinessContext(pool) {
    // Mantener estas consultas alineadas con database/schema.sql.
    const [stockResult, salesResult, totalsResult] = await Promise.all([
        pool.request().query(`
            SELECT id_insumo, nombre, unidad_medida, stock_actual, stock_minimo
            FROM dbo.insumos
            ORDER BY nombre;
        `),
        pool.request().query(`
            SELECT TOP 10
                p.nombre AS producto,
                SUM(d.cantidad) AS unidades_vendidas,
                SUM(d.subtotal) AS ventas_generadas
            FROM dbo.detalle_ventas AS d
            INNER JOIN dbo.ventas AS v ON v.id_venta = d.id_venta
            INNER JOIN dbo.productos AS p ON p.id_producto = d.id_producto
            WHERE v.fecha_hora >= DATEADD(DAY, -30, GETDATE())
            GROUP BY p.nombre
            ORDER BY SUM(d.cantidad) DESC;
        `),
        pool.request().query(`
            SELECT
                COUNT(*) AS cantidad_ventas_30_dias,
                COALESCE(SUM(total), 0) AS total_vendido_30_dias
            FROM dbo.ventas
            WHERE fecha_hora >= DATEADD(DAY, -30, GETDATE());
        `)
    ]);

    const stock = stockResult.recordset.map(row => ({
        id: row.id_insumo,
        nombre: row.nombre,
        unidad: row.unidad_medida,
        stockActual: Number(row.stock_actual),
        stockMinimo: Number(row.stock_minimo),
        requiereRevision: Number(row.stock_actual) <= Number(row.stock_minimo)
    }));

    const topProducts = salesResult.recordset.map(row => ({
        producto: row.producto,
        unidadesVendidas: Number(row.unidades_vendidas),
        ventasGeneradas: Number(row.ventas_generadas)
    }));

    const totals = totalsResult.recordset[0] || {
        cantidad_ventas_30_dias: 0,
        total_vendido_30_dias: 0
    };

    return {
        generatedAt: new Date().toISOString(),
        period: 'Últimos 30 días',
        inventory: {
            totalInsumos: stock.length,
            itemsAtOrBelowMinimum: stock.filter(item => item.requiereRevision),
            allItems: stock
        },
        sales: {
            count: Number(totals.cantidad_ventas_30_dias),
            total: Number(totals.total_vendido_30_dias),
            topProducts
        },
        dataNotes: [
            'Las cifras de ventas por producto dependen de que detalle_ventas tenga registros.',
            'Los insumos por revisar son aquellos cuyo stock_actual es menor o igual a stock_minimo.',
            'Este módulo es de consulta y no modifica ventas ni inventario.'
        ]
    };
}

function sanitizeHistory(history) {
    return history
        .filter(item =>
            item &&
            ['user', 'assistant'].includes(item.role) &&
            typeof item.content === 'string'
        )
        .slice(-8)
        .map(item => ({
            role: item.role,
            content: item.content.slice(0, 1000)
        }));
}

async function generateChatbotAnswer({ message, history, businessContext }) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-5.5';

    const instructions = `
Eres el Asistente de Inteligencia Artificial de La Exquisita, un negocio de alimentos.
Responde siempre en español, con lenguaje claro, amable y práctico.
Tu función es apoyar al administrador a interpretar ventas e inventario.
Usa exclusivamente los datos del contexto suministrado para dar cifras.
No inventes ventas, existencias, fechas, recetas ni costos.
Si faltan datos o detalle_ventas está vacío, dilo claramente y explica qué registro hace falta.
Distingue observaciones de recomendaciones. No afirmes que una predicción es segura.
No ejecutes ni sugieras operaciones de escritura en la base de datos.
No tienes permiso para cambiar precios, registrar ventas, eliminar datos o modificar inventario.
Si preguntan por cantidades exactas de compra, explica que todavía falta validar recetas, unidades y tiempos de abastecimiento.
Responde de forma breve y ordenada. Cuando sea útil, usa viñetas.
`;

    const input = [
        ...sanitizeHistory(history),
        {
            role: 'user',
            content:
                `Datos actuales del negocio en formato JSON:\n${JSON.stringify(businessContext)}\n\n` +
                `Pregunta del usuario:\n${message}`
        }
    ];

    const response = await client.responses.create({
        model,
        instructions,
        input,
        max_output_tokens: 500
    });

    const answer = response.output_text;
    if (!answer || !answer.trim()) {
        throw new Error('El modelo no devolvió texto.');
    }
    return answer.trim();
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(Number(value || 0));
}

function localAnswer(message, context) {
    const q = message.toLowerCase();
    const lowStock = context.inventory.itemsAtOrBelowMinimum;
    const top = context.sales.topProducts;
    const hasSalesDetails = top.length > 0;

    if (/(stock|inventario|insumo|agot|mínim|minim)/i.test(q)) {
        if (lowStock.length === 0) {
            return `Revisé ${context.inventory.totalInsumos} insumos. Ninguno está actualmente por debajo o igual a su stock mínimo, según los datos registrados.`;
        }

        const lines = lowStock.map(item =>
            `• ${item.nombre}: ${item.stockActual} ${item.unidad} disponibles; mínimo: ${item.stockMinimo} ${item.unidad}.`
        );
        return `Encontré ${lowStock.length} insumo(s) que requieren revisión:\n${lines.join('\n')}`;
    }

    if (/(más vendido|mas vendido|producto|ventas por producto|ranking)/i.test(q)) {
        if (!hasSalesDetails) {
            return 'Todavía no encuentro detalles de ventas en los últimos 30 días. Para identificar los productos más vendidos, cada venta debe guardar sus productos y cantidades en la tabla detalle_ventas.';
        }
        return `Estos son los productos con mayor movimiento en los últimos 30 días:\n` +
            top.map((item, index) =>
                `${index + 1}. ${item.producto}: ${item.unidadesVendidas} unidades (${formatCurrency(item.ventasGeneradas)}).`
            ).join('\n');
    }

    if (/(resumen|recomiend|hoy|estado|general)/i.test(q)) {
        const stockText = lowStock.length
            ? `${lowStock.length} insumo(s) están en el mínimo o por debajo`
            : 'ningún insumo está en el mínimo o por debajo';
        const salesText = hasSalesDetails
            ? `el producto con mayor movimiento es ${top[0].producto} (${top[0].unidadesVendidas} unidades)`
            : 'aún no hay detalle de ventas suficiente para elaborar un ranking';
        return `Resumen de La Exquisita (${context.period}):\n` +
            `• Ventas registradas: ${context.sales.count}.\n` +
            `• Total vendido: ${formatCurrency(context.sales.total)}.\n` +
            `• Inventario: ${context.inventory.totalInsumos} insumos revisados; ${stockText}.\n` +
            `• Ventas por producto: ${salesText}.\n\n` +
            'Recomendación: revisar los insumos señalados y asegurar que el POS registre cada producto y cantidad en detalle_ventas.';
    }

    return 'Puedo ayudarte a revisar el inventario, los insumos por debajo del mínimo, el resumen de ventas y los productos con mayor movimiento. Prueba preguntando: “¿Qué insumos necesitan revisión?” o “¿Cuáles son los productos más vendidos?”.';
}

module.exports = {
    buildBusinessContext,
    generateChatbotAnswer,
    localAnswer
};

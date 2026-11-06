/**
 * ============================================================================
 *  CAPA DE NEGOCIO · IA · Motor local de lenguaje natural (español)
 * ----------------------------------------------------------------------------
 *  Funciona SIN internet y SIN llaves de API. Entiende la intención de la
 *  pregunta (stock, ventas, capacidad, clientes, mermas, precios, pagos...),
 *  detecta entidades (insumo, producto grande/pequeña, periodo, cliente) y
 *  responde con las cifras EXACTAS del contexto que viene de SQL Server.
 *  Es determinista: nunca inventa números.
 * ============================================================================
 */

/* ------------------------------ Utilidades ------------------------------ */
const norm = (texto) => String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fmtDinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const dinero = (v) => fmtDinero.format(Number(v) || 0).replace(/\s/g, '');
const n = (v) => fmtNumero.format(Number(v) || 0);
const plural = (cantidad, singular, pluralTxt) => `${n(cantidad)} ${Number(cantidad) === 1 ? singular : pluralTxt}`;

const ETIQUETA_PERIODO = {
    hoy: 'hoy',
    ayer: 'ayer',
    semana: 'los últimos 7 días',
    mes: 'los últimos 30 días',
    total: 'todo el historial'
};
// "No hay ventas hoy" / "No hay ventas en los últimos 7 días"
const EN_PERIODO = {
    hoy: 'hoy',
    ayer: 'ayer',
    semana: 'en los últimos 7 días',
    mes: 'en los últimos 30 días',
    total: 'en todo el historial'
};
const ICONO_ESTADO = { ok: '✅', bajo: '⚠️', critico: '🔴', agotado: '⛔' };
const TEXTO_ESTADO = { ok: 'nivel correcto', bajo: 'por debajo del mínimo', critico: 'nivel crítico', agotado: 'agotado' };

const PALABRAS_VACIAS = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y', 'con', 'para', 'por', 'un', 'una']);
const PALABRAS_COMUNES_CLIENTE = new Set([
    ...PALABRAS_VACIAS, 'tienda', 'don', 'dona', 'cafeteria', 'senor', 'senora', 'san', 'santa', 'buen', 'dia',
    'hoy', 'casa', 'panaderia', 'restaurante', 'supermercado', 'minimercado', 'mercado', 'cliente', 'clientes'
]);
const SINONIMOS_INSUMO = { mazorca: 'maiz', choclo: 'maiz', cuajada: 'queso', margarina: 'mantequilla' };

/* --------------------------- Detección de entidades --------------------------- */
function detectarPeriodo(q) {
    if (/\bhoy\b|\beste dia\b|\bdel dia\b|\bhoy dia\b/.test(q)) return 'hoy';
    if (/\bayer\b/.test(q)) return 'ayer';
    if (/\bsemana\b|\b7 dias\b|\bsiete dias\b|\bsemanal\b/.test(q)) return 'semana';
    if (/\bmes\b|\b30 dias\b|\btreinta dias\b|\bmensual\b/.test(q)) return 'mes';
    if (/\bhistoric|\bsiempre\b|\bhasta ahora\b|\ben total\b|\btodo el tiempo\b|\bdesde el inicio\b|\btotales\b/.test(q)) return 'total';
    return null;
}

function detectarTamano(q) {
    const grande = /\bgrandes?\b/.test(q);
    const pequena = /\bpequen[ao]s?\b|\bchiquit[ao]s?\b|\bminis?\b/.test(q);
    if (grande && !pequena) return 'grande';
    if (pequena && !grande) return 'pequena';
    return null;
}

function tokensPregunta(q) {
    return new Set(q.split(' ').map(t => SINONIMOS_INSUMO[t] || t));
}

function coincide(token, tokens) {
    return tokens.has(token) || tokens.has(`${token}s`) || tokens.has(`${token}es`);
}

function detectarInsumos(q, insumos) {
    const tokens = tokensPregunta(q);
    return insumos
        .map(insumo => {
            const partes = norm(insumo.nombre).split(' ')
                .map(t => SINONIMOS_INSUMO[t] || t)
                .filter(t => t.length >= 3 && !PALABRAS_VACIAS.has(t));
            return { insumo, puntaje: partes.filter(t => coincide(t, tokens)).length };
        })
        .filter(x => x.puntaje > 0)
        .sort((a, b) => b.puntaje - a.puntaje)
        .map(x => x.insumo);
}

function detectarCliente(q, clientes) {
    const conEspacios = ` ${q} `;
    const tokens = new Set(q.split(' '));
    const conteoToken = new Map();
    const candidatos = [];

    for (const c of clientes) {
        const nombre = norm(c.nombre);
        if (nombre.length >= 4 && conEspacios.includes(` ${nombre} `)) return c;
        const partes = [...new Set(nombre.split(' ').filter(t => t.length >= 3 && !PALABRAS_COMUNES_CLIENTE.has(t)))];
        partes.forEach(t => conteoToken.set(t, (conteoToken.get(t) || 0) + 1));
        const aciertos = partes.filter(t => tokens.has(t));
        if (aciertos.length) candidatos.push({ c, aciertos });
    }
    candidatos.sort((a, b) => b.aciertos.length - a.aciertos.length);
    const mejor = candidatos[0];
    if (!mejor) return null;
    if (mejor.aciertos.length >= 2) return mejor.c;
    const pideCliente = /(client|compr|cuanto ha|rango|gast|pedid|datos|telefono|quien es|celular|direccion)/.test(q);
    const unico = mejor.aciertos.some(t => t.length >= 4 && conteoToken.get(t) === 1);
    return pideCliente && unico ? mejor.c : null;
}

/* ------------------------------ Intenciones ------------------------------ */
const INTENCIONES = [
    // Las raíces terminan en \w* para aceptar variaciones: vend\w* -> vendimos, vendieron, vendido...
    ['ayuda', /\b(ayuda|que puedes|que sabes|que haces|como funciona|que te puedo preguntar|opciones)\b/],
    ['capacidad', /\b(alcanza\w*|puedo (hacer|producir|preparar|vender)|se pueden (hacer|producir|preparar)|producir|capacidad|cuant[ao]s? (paquetes|arepas) (puedo|se pueden|alcanzan|quedan|hay disponibles)|disponibles para vender)\b/],
    ['mermas', /\b(merma\w*|desperdici\w*|perdid\w*|danad\w*|dano\w*|quemad\w*|vencid\w*|botad\w*)\b/],
    ['compras', /\b(comprar|reabastec\w*|pedir al proveedor|hace falta comprar|que falta|que me falta|surtir|proveedor\w*|pedido de insumos)\b/],
    ['ranking', /\b(mas vendid\w*|mas se vende\w*|menos vendid\w*|top|ranking|mejor producto|popular\w*|preferid\w*|estrella)\b/],
    ['inventario', /\b(stock|inventario\w*|insumos?|materia prima|existencias?|agotad\w*|bajos?|minimos?|queda|quedan|cuanto hay|cuanta hay|hay de|tenemos de)\b/],
    ['precios', /\b(precios?|cuesta\w*|valen?|valor|cobra\w*|tarifa\w*)\b/],
    ['pagos', /\b(nequi|daviplata|efectivo|tarjeta\w*|transferencia\w*|metodos? de pago|medios? de pago|formas? de pago|como pagan|pagaron|pagos?)\b/],
    ['clientes', /\b(client\w*|comprador\w*)\b/],
    ['ventas', /\b(venta\w*|vend\w*|factur\w*|ingreso\w*|ganancia\w*|plata|dinero|caja|recaud\w*|ticket|paquetes?|unidades|arepas?)\b/],
    ['resumen', /\b(resumen|estado|como va|como vamos|general|reporte|informe|negocio|balance|novedades)\b/],
    // Saludos al final: "hola, ¿cuánto vendimos hoy?" debe responder las ventas
    ['saludo', /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que mas|quiubo|saludos)\b/],
    ['gracias', /^(gracias|muchas gracias|listo|ok|vale|perfecto|super)\b/]
];

function detectarIntencion(q, entidades) {
    for (const [nombre, patron] of INTENCIONES) {
        if (patron.test(q)) {
            // "cuánto maíz hay" -> inventario aunque diga "hay"; "cuánto ha comprado X" -> cliente
            if (entidades.cliente && ['ventas', 'clientes', 'resumen'].includes(nombre)) return 'cliente';
            if (entidades.insumos.length && nombre === 'resumen') return 'inventario';
            return nombre;
        }
    }
    if (entidades.cliente) return 'cliente';
    if (entidades.insumos.length) return 'inventario';
    return null;
}

/* ------------------------------ Respuestas ------------------------------ */
function lineaProducto(p) {
    const partes = [];
    if (p.paquetes) partes.push(plural(p.paquetes, 'paquete', 'paquetes'));
    if (p.unidades_sueltas) partes.push(plural(p.unidades_sueltas, 'unidad suelta', 'unidades sueltas'));
    return `• ${p.nombre}: ${partes.join(' + ') || '0'} → ${plural(p.arepas, 'arepa', 'arepas')} · ${dinero(p.total)}`;
}

function responderVentasTamano(ctx, periodo, tamano) {
    const etiqueta = tamano === 'grande' ? 'grandes' : 'pequeñas';
    const periodos = periodo ? [periodo] : ['hoy', 'semana', 'mes', 'total'];
    const lineas = periodos.map(p => {
        const x = ctx.ventas[p].por_producto.find(prod => prod.tamano === tamano);
        const titulo = ETIQUETA_PERIODO[p][0].toUpperCase() + ETIQUETA_PERIODO[p].slice(1);
        if (!x) return `• ${titulo}: no se vendieron arepas ${etiqueta}.`;
        return `• ${titulo}: ${plural(x.arepas, 'arepa', 'arepas')} ${etiqueta} (${plural(x.paquetes, 'paquete', 'paquetes')} + ${plural(x.unidades_sueltas, 'unidad suelta', 'unidades sueltas')}) · ${dinero(x.total)}`;
    });
    return [`🫓 Arepas ${etiqueta} vendidas:`, ...lineas].join('\n');
}

function responderVentas(ctx, { periodo, tamano }) {
    if (tamano) return responderVentasTamano(ctx, periodo, tamano);
    if (periodo) {
        const v = ctx.ventas[periodo];
        let productos = v.por_producto;
        if (tamano) productos = productos.filter(p => p.tamano === tamano);
        if (!v.ventas) return `No hay ventas registradas ${EN_PERIODO[periodo]}.`;
        const lineas = [
            `📊 Ventas de ${ETIQUETA_PERIODO[periodo]}: ${plural(v.ventas, 'venta', 'ventas')} por ${dinero(v.total)} (ticket promedio ${dinero(v.ticket_promedio)}).`
        ];
        if (productos.length) lineas.push(...productos.map(lineaProducto));
        else if (tamano) lineas.push(`• No se vendieron arepas ${tamano === 'grande' ? 'grandes' : 'pequeñas'} en ese periodo.`);
        return lineas.join('\n');
    }
    const r = ['📊 Resumen de ventas registradas en SQL Server:'];
    for (const p of ['hoy', 'semana', 'mes', 'total']) {
        const v = ctx.ventas[p];
        r.push(`• ${ETIQUETA_PERIODO[p][0].toUpperCase()}${ETIQUETA_PERIODO[p].slice(1)}: ${plural(v.ventas, 'venta', 'ventas')} · ${dinero(v.total)}`);
    }
    const ref = ctx.ventas.hoy.ventas ? 'hoy' : 'mes';
    let productos = ctx.ventas[ref].por_producto;
    if (tamano) productos = productos.filter(p => p.tamano === tamano);
    if (productos.length) {
        r.push('', `Por producto (${ETIQUETA_PERIODO[ref]}):`, ...productos.map(lineaProducto));
    }
    return r.join('\n');
}

function responderInsumo(ctx, insumo) {
    const estado = `${ICONO_ESTADO[insumo.estado] || ''} ${TEXTO_ESTADO[insumo.estado] || insumo.estado}`.trim();
    const lineas = [
        `📦 ${insumo.nombre}: hay ${n(insumo.stock_actual)} ${insumo.unidad_medida} (mínimo ${n(insumo.stock_minimo)} ${insumo.unidad_medida}) → ${estado}.`
    ];
    if (insumo.consumo_7_dias > 0) {
        lineas.push(`• Consumo por ventas en los últimos 7 días: ${n(insumo.consumo_7_dias)} ${insumo.unidad_medida}.`);
        if (insumo.dias_cobertura !== null) lineas.push(`• Al ritmo actual alcanza para unos ${plural(insumo.dias_cobertura, 'día', 'días')}.`);
    }
    for (const p of ctx.productos) {
        const receta = p.receta.find(r => r.id_insumo === insumo.id_insumo);
        if (!receta) continue;
        const arepas = Math.floor((insumo.stock_actual + 1e-9) / receta.cantidad_por_unidad);
        lineas.push(`• Para ${p.nombre}: ${n(receta.cantidad_por_unidad)} ${insumo.unidad_medida} por arepa → este insumo alcanza para ${plural(arepas, 'arepa', 'arepas')} (${plural(Math.floor(arepas / p.unidades_por_paquete), 'paquete', 'paquetes')}).`);
    }
    return lineas.join('\n');
}

function responderInventario(ctx, { insumos }) {
    if (insumos.length) return insumos.map(i => responderInsumo(ctx, i)).join('\n\n');
    const alertas = ctx.insumos.filter(i => i.estado !== 'ok');
    const lineas = [`📦 Inventario actual (${plural(ctx.insumos.length, 'insumo', 'insumos')}):`];
    for (const i of ctx.insumos) {
        lineas.push(`${ICONO_ESTADO[i.estado] || '•'} ${i.nombre}: ${n(i.stock_actual)} ${i.unidad_medida} (mín. ${n(i.stock_minimo)})`);
    }
    lineas.push('', alertas.length
        ? `Atención: ${plural(alertas.length, 'insumo necesita', 'insumos necesitan')} revisión: ${alertas.map(i => i.nombre).join(', ')}.`
        : 'Todos los insumos están por encima de su stock mínimo.');
    return lineas.join('\n');
}

function responderCompras(ctx) {
    const pendientes = ctx.insumos.filter(i => i.stock_actual <= i.stock_minimo * 1.2);
    if (!pendientes.length) {
        return '🛒 No hace falta comprar nada por ahora: todos los insumos están por encima de su mínimo (con 20% de margen).';
    }
    return ['🛒 Sugerencia de compra (para llegar al doble del stock mínimo):',
        ...pendientes.map(i => {
            const sugerido = Math.max(0, i.stock_minimo * 2 - i.stock_actual);
            return `${ICONO_ESTADO[i.estado] || '•'} ${i.nombre}: hay ${n(i.stock_actual)} ${i.unidad_medida}; comprar aprox. ${n(Math.ceil(sugerido * 10) / 10)} ${i.unidad_medida}.`;
        }),
        '', 'Es una recomendación basada en el stock mínimo configurado; ajústala según tu proveedor.'].join('\n');
}

function responderCapacidad(ctx, { tamano, insumos }) {
    if (insumos.length) return insumos.map(i => responderInsumo(ctx, i)).join('\n\n');
    let productos = ctx.productos;
    if (tamano) productos = productos.filter(p => p.tamano === tamano);
    if (!productos.length) return 'No encontré productos activos con receta para calcular la capacidad.';
    const lineas = ['🫓 Con el inventario actual alcanza para preparar:'];
    for (const p of productos) {
        if (p.unidades_disponibles === null) {
            lineas.push(`• ${p.nombre}: no tiene receta registrada, no puedo calcularlo.`);
            continue;
        }
        lineas.push(`• ${p.nombre}: ${plural(p.paquetes_disponibles, 'paquete', 'paquetes')} (${plural(p.unidades_disponibles, 'arepa', 'arepas')}). Insumo que limita: ${p.insumo_limitante}.`);
    }
    if (!tamano && productos.length > 1) lineas.push('', 'Ojo: los productos comparten insumos, así que son cantidades para cada uno por separado.');
    return lineas.join('\n');
}

function responderPrecios(ctx, { tamano }) {
    let productos = ctx.productos;
    if (tamano) productos = productos.filter(p => p.tamano === tamano);
    return ['💲 Precios vigentes en la base de datos:',
        ...productos.map(p => `• ${p.nombre}: ${dinero(p.precio)} el paquete` +
            (p.precio_unidad ? ` · ${dinero(p.precio_unidad)} la unidad suelta` : ''))].join('\n');
}

function responderPagos(ctx, { periodo }) {
    const p = periodo || 'mes';
    const metodos = [...ctx.ventas[p].metodos_pago].sort((a, b) => b.total - a.total);
    if (!metodos.length) return `No hay ventas registradas ${EN_PERIODO[p]}.`;
    const total = metodos.reduce((acc, m) => acc + m.total, 0);
    return [`💳 Métodos de pago ${EN_PERIODO[p]}:`,
        ...metodos.map(m => `• ${m.metodo_pago[0].toUpperCase()}${m.metodo_pago.slice(1)}: ${plural(m.ventas, 'venta', 'ventas')} · ${dinero(m.total)} (${Math.round((m.total / total) * 100)}%)`)].join('\n');
}

function responderRanking(ctx, { periodo }) {
    let p = periodo || 'mes';
    if (!periodo && !ctx.ventas.mes.por_producto.length) p = 'total';
    const productos = ctx.ventas[p].por_producto;
    if (!productos.length) return `Todavía no hay ventas ${EN_PERIODO[p]} para armar un ranking.`;
    return [`🏆 Productos más vendidos ${EN_PERIODO[p]} (por arepas):`,
        ...productos.map((x, i) => `${i + 1}. ${x.nombre}: ${plural(x.arepas, 'arepa', 'arepas')} · ${dinero(x.total)}`)].join('\n');
}

function responderClientes(ctx) {
    const e = ctx.clientes.estadisticas;
    const top = ctx.clientes.lista.slice(0, 5).filter(c => c.total_compras > 0);
    const lineas = [
        `👥 Hay ${plural(e.total, 'cliente activo', 'clientes activos')} (${n(e.nuevos_30_dias)} registrados en los últimos 30 días).`,
        `• Rangos: VIP ${n(e.vip)} · Frecuentes ${n(e.frecuentes)} · Regulares ${n(e.regulares)} · Nuevos ${n(e.nuevos)}`
    ];
    if (top.length) {
        lineas.push('', 'Top clientes por compras:',
            ...top.map((c, i) => `${i + 1}. ${c.nombre} (${c.rango}): ${dinero(c.total_compras)} en ${plural(c.numero_compras, 'compra', 'compras')}`));
    }
    return lineas.join('\n');
}

function responderCliente(cliente) {
    const fecha = cliente.ultima_compra ? new Date(cliente.ultima_compra).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : 'sin compras aún';
    return [
        `👤 ${cliente.nombre} (${cliente.tipo_cliente === 'negocio' ? 'negocio' : 'persona'}) · rango ${cliente.rango}`,
        `• Total comprado: ${dinero(cliente.total_compras)} en ${plural(cliente.numero_compras, 'compra', 'compras')}`,
        `• Última compra: ${fecha}`,
        cliente.telefono ? `• Teléfono: ${cliente.telefono}` : null,
        cliente.documento ? `• Documento: ${cliente.documento}` : null
    ].filter(Boolean).join('\n');
}

function responderMermas(ctx, { insumos }) {
    let resumen = ctx.mermas.resumen_30_dias;
    if (insumos.length) resumen = resumen.filter(m => insumos.some(i => i.id_insumo === m.id_insumo));
    if (!resumen.length) {
        return insumos.length
            ? `No hay mermas de ${insumos.map(i => i.nombre).join(', ')} en los últimos 30 días. 👏`
            : 'No hay mermas registradas en los últimos 30 días. 👏';
    }
    const lineas = ['🗑️ Mermas de los últimos 30 días:',
        ...resumen.map(m => `• ${m.insumo}: ${n(m.cantidad)} ${m.unidad_medida} en ${plural(m.registros, 'registro', 'registros')}`)];
    const recientes = ctx.mermas.recientes.slice(0, 3);
    if (recientes.length && !insumos.length) {
        lineas.push('', 'Más recientes:', ...recientes.map(m => `• ${m.insumo}: ${n(m.cantidad)} ${m.unidad_medida || ''} — ${m.motivo}`));
    }
    return lineas.join('\n');
}

function responderResumen(ctx) {
    const hoy = ctx.ventas.hoy;
    const mes = ctx.ventas.mes;
    const alertas = ctx.insumos.filter(i => i.estado !== 'ok');
    const top = (mes.por_producto[0] || null);
    const mermas = ctx.mermas.resumen_30_dias.reduce((acc, m) => acc + m.registros, 0);
    return [
        `📋 Resumen de La Exquisita · ${ctx.fecha_local}`,
        `• Hoy: ${plural(hoy.ventas, 'venta', 'ventas')} por ${dinero(hoy.total)}.`,
        `• Últimos 30 días: ${plural(mes.ventas, 'venta', 'ventas')} por ${dinero(mes.total)} (ticket promedio ${dinero(mes.ticket_promedio)}).`,
        top ? `• Producto estrella del mes: ${top.nombre} (${plural(top.arepas, 'arepa', 'arepas')}).` : '• Aún no hay ventas este mes para elegir producto estrella.',
        alertas.length
            ? `• Inventario: ${plural(alertas.length, 'insumo', 'insumos')} en alerta (${alertas.map(i => `${i.nombre} ${n(i.stock_actual)} ${i.unidad_medida}`).join(', ')}).`
            : `• Inventario: los ${n(ctx.insumos.length)} insumos están por encima del mínimo.`,
        ...ctx.productos.filter(p => p.paquetes_disponibles !== null)
            .map(p => `• Se pueden preparar ${plural(p.paquetes_disponibles, 'paquete', 'paquetes')} de ${p.nombre}.`),
        `• Clientes activos: ${n(ctx.clientes.estadisticas.total)} · Mermas (30 días): ${plural(mermas, 'registro', 'registros')}.`
    ].join('\n');
}

const AYUDA = [
    'Puedo responder con datos reales de la base de datos. Prueba con:',
    '• "¿Cuánto maíz hay?" o "¿Qué insumos están bajos?"',
    '• "¿Cuántos paquetes grandes puedo hacer?"',
    '• "¿Cuánto vendimos hoy?" / "ventas de la semana"',
    '• "¿Cuántas arepas pequeñas se vendieron este mes?"',
    '• "¿Cuál es el producto más vendido?"',
    '• "¿Qué debo comprar?" · "mermas del mes" · "pagos por Nequi"',
    '• "¿Cuánto ha comprado Tienda Don Pepe?" · "resumen general"'
].join('\n');

/* ------------------------------ Punto de entrada ------------------------------ */
function analizar(mensaje, ctx, historial = []) {
    const q = norm(mensaje);
    const entidades = {
        periodo: detectarPeriodo(q),
        tamano: detectarTamano(q),
        insumos: detectarInsumos(q, ctx.insumos),
        cliente: detectarCliente(q, ctx.clientes.lista)
    };
    let intencion = detectarIntencion(q, entidades);

    // Preguntas de seguimiento: "¿y ayer?", "¿y las pequeñas?"
    if ((!intencion || intencion === 'saludo') && (entidades.periodo || entidades.tamano) && q.split(' ').length <= 5) {
        const previa = [...historial].reverse().find(h => h.role === 'user');
        if (previa) {
            const qPrevia = norm(previa.content);
            const anterior = detectarIntencion(qPrevia, { insumos: [], cliente: null });
            if (anterior && !['saludo', 'gracias', 'ayuda'].includes(anterior)) {
                intencion = anterior;
                if (!entidades.insumos.length) entidades.insumos = detectarInsumos(qPrevia, ctx.insumos);
                if (!entidades.tamano) entidades.tamano = detectarTamano(qPrevia);
            }
        }
    }
    return { intencion, entidades };
}

function responder(mensaje, ctx, historial = []) {
    const { intencion, entidades } = analizar(mensaje, ctx, historial);
    switch (intencion) {
        case 'saludo': return `¡Hola! 👋 Soy el asistente de La Exquisita y estoy conectado a la base de datos.\n\n${AYUDA}`;
        case 'gracias': return '¡Con gusto! Si necesitas otra cifra, aquí estoy. 🌽';
        case 'ayuda': return AYUDA;
        case 'capacidad': return responderCapacidad(ctx, entidades);
        case 'mermas': return responderMermas(ctx, entidades);
        case 'compras': return responderCompras(ctx);
        case 'inventario': return responderInventario(ctx, entidades);
        case 'precios': return responderPrecios(ctx, entidades);
        case 'pagos': return responderPagos(ctx, entidades);
        case 'ranking': return responderRanking(ctx, entidades);
        case 'cliente': return responderCliente(entidades.cliente);
        case 'clientes': return responderClientes(ctx);
        case 'ventas': return responderVentas(ctx, entidades);
        case 'resumen': return responderResumen(ctx);
        default:
            return `No estoy seguro de qué necesitas, así que te dejo el estado general:\n\n${responderResumen(ctx)}\n\n${AYUDA}`;
    }
}

module.exports = { responder, analizar, norm };

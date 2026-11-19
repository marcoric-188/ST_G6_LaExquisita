/**
 * ============================================================================
 *  CAPA DE NEGOCIO · IA · Servicio de PRONÓSTICO DE DEMANDA (red neuronal)
 * ----------------------------------------------------------------------------
 *  Problema que resuelve: ¿cuántas arepas grandes y pequeñas debo preparar
 *  mañana y qué insumos voy a necesitar? Preparar de más genera mermas; de
 *  menos, ventas perdidas.
 *
 *  Información que procesa (desde SQL Server):
 *    - Arepas vendidas por día y producto (últimos 120 días, sin reembolsos).
 *    - Recetas e inventario actual de insumos.
 *
 *  Variables de entrada de la red, por cada día y producto:
 *    día de la semana (7) · ventas de ayer · ventas de hace 7 días ·
 *    promedio de los últimos 7 días · promedio de los últimos 28 días ·
 *    promedio del mismo día de la semana (últimas 4 semanas) · producto
 *
 *  Resultado: arepas pronosticadas por producto para los próximos 7 días,
 *  paquetes sugeridos para mañana, insumos necesarios y alertas si no alcanzan.
 *
 *  Cómo lo usa el sistema: panel de Inicio («Producción sugerida para mañana»),
 *  asistente IA («¿cuántas arepas preparo mañana?») y sugerencia de compras.
 *  El modelo y sus pronósticos quedan guardados en SQL Server.
 * ============================================================================
 */
const { RedNeuronal } = require('./redNeuronal');
const ventasRepo = require('../../repositories/ventas.repository');
const iaRepo = require('../../repositories/ia.repository');
const productosService = require('../productos.service');

const DIAS_HISTORIA = 120;
const MIN_DIAS_CON_VENTAS = 2;  // con 2 días de ventas ya puede empezar a aprender
const MAX_DIAS_VALIDACION = 14;
const HORIZONTE = 7;
const HORAS_REENTRENO = 24;
const DIAS_CONFIANZA_TOTAL = 14; // desde aquí la red decide sola; antes se combina con el promedio reciente
const OCULTAS = [8];
const EPOCAS = 300;
const NOMBRE_MODELO = 'Pronóstico de demanda diaria';

/* ------------------------------ Fechas ------------------------------ */
const aISO = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const sumarDias = (iso, n) => {
    const [a, m, d] = iso.split('-').map(Number);
    return aISO(new Date(a, m - 1, d + n));
};
const diaSemana = (iso) => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).getDay(); // 0 = domingo
};
const hoyISO = () => aISO(new Date());
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* ------------------------------ Datos ------------------------------ */
const promedio = (lista) => (lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : 0);

/**
 * Convierte las filas de SQL en una serie diaria continua (días sin ventas = 0) por producto.
 * La serie empieza el primer día con ventas (máximo 120 días atrás).
 */
function construirSeries(filas, idsProductos, hasta) {
    const limite = sumarDias(hasta, -(DIAS_HISTORIA - 1));
    const conVentas = filas.filter(f => f.unidades > 0 && f.fecha >= limite && f.fecha <= hasta).map(f => f.fecha).sort();
    const desde = conVentas.length ? conVentas[0] : hasta;
    const fechas = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) fechas.push(f);
    const series = new Map(idsProductos.map(id => [id, new Map(fechas.map(f => [f, 0]))]));
    for (const fila of filas) {
        const serie = series.get(fila.id_producto);
        if (serie && serie.has(fila.fecha)) serie.set(fila.fecha, serie.get(fila.fecha) + fila.unidades);
    }
    return { fechas, series: new Map([...series].map(([id, m]) => [id, fechas.map(f => m.get(f))])) };
}

/** Variables de entrada para pronosticar el día t a partir de los valores anteriores. */
function variables(valores, t, fechaObjetivo, indiceProducto, totalProductos, escala) {
    const dow = new Array(7).fill(0);
    dow[diaSemana(fechaObjetivo)] = 1;
    const producto = new Array(totalProductos).fill(0);
    producto[indiceProducto] = 1;
    const ultimos7 = valores.slice(Math.max(0, t - 7), t);
    const ultimos28 = valores.slice(Math.max(0, t - 28), t);
    return [
        ...dow,
        (valores[t - 1] || 0) / escala,
        (valores[t - 7] || 0) / escala,
        promedio(ultimos7) / escala,
        promedio(ultimos28) / escala,
        promedio([valores[t - 7], valores[t - 14], valores[t - 21], valores[t - 28]].filter(v => v !== undefined)) / escala,
        ...producto
    ];
}

function armarEjemplos(series, fechas, idsProductos, escala) {
    const ejemplos = [];
    idsProductos.forEach((id, k) => {
        const valores = series.get(id);
        for (let t = 1; t < valores.length; t++) {
            ejemplos.push({
                fecha: fechas[t],
                id_producto: id,
                x: variables(valores, t, fechas[t], k, idsProductos.length, escala),
                y: valores[t] / escala,
                real: valores[t],
                base: promedio(valores.slice(t - 7, t)) // referencia: promedio de 7 días
            });
        }
    });
    return ejemplos;
}

const mae = (pares) => promedio(pares.map(([a, b]) => Math.abs(a - b)));

/* ------------------------------ Entrenamiento ------------------------------ */
async function entrenar(usuario = null) {
    const productos = await productosService.listarConDisponibilidad();
    const ids = productos.map(p => p.id_producto);
    const ayer = sumarDias(hoyISO(), -1); // hoy aún no termina: no se usa para entrenar
    const filas = await ventasRepo.demandaDiaria(DIAS_HISTORIA + 1);
    const { fechas, series } = construirSeries(filas, ids, ayer);

    const diasConVentas = fechas.filter((_, i) => ids.some(id => series.get(id)[i] > 0)).length;
    if (!ids.length || diasConVentas < MIN_DIAS_CON_VENTAS || fechas.length < 2) {
        return {
            estado: 'sin_datos',
            dias_con_ventas: diasConVentas,
            minimo: MIN_DIAS_CON_VENTAS,
            mensaje: `La red neuronal necesita ventas de al menos ${MIN_DIAS_CON_VENTAS} días anteriores a hoy para aprender (hay ${diasConVentas}).`
        };
    }

    const maximo = Math.max(1, ...ids.flatMap(id => series.get(id)));
    const escala = Math.ceil(maximo * 1.2);
    const ejemplos = armarEjemplos(series, fechas, ids, escala);

    // 1) Validación: entrena sin los últimos días (hasta 14) y mide el error en ellos.
    //    Con muy poco historial todavía no se puede medir, pero el modelo igual se entrena.
    const diasValidacion = Math.min(MAX_DIAS_VALIDACION, Math.floor((fechas.length - 1) / 4));
    let maeRed = null;
    let maeBase = null;
    let mediaReal = 0;
    if (diasValidacion >= 1) {
        const corte = fechas[fechas.length - diasValidacion];
        const entrenamiento = ejemplos.filter(e => e.fecha < corte);
        const validacion = ejemplos.filter(e => e.fecha >= corte);
        if (entrenamiento.length && validacion.length) {
            const redPrueba = new RedNeuronal({ entradas: ejemplos[0].x.length, ocultas: OCULTAS });
            redPrueba.entrenar(entrenamiento.map(e => e.x), entrenamiento.map(e => e.y), { epocas: EPOCAS, tasa: 0.01 });
            maeRed = mae(validacion.map(e => [Math.max(0, redPrueba.predecir(e.x) * escala), e.real]));
            maeBase = mae(validacion.map(e => [e.base, e.real]));
            mediaReal = promedio(validacion.map(e => e.real));
        }
    }

    // 2) Modelo final: entrena con todos los datos
    const red = new RedNeuronal({ entradas: ejemplos[0].x.length, ocultas: OCULTAS });
    const resultado = red.entrenar(ejemplos.map(e => e.x), ejemplos.map(e => e.y), { epocas: EPOCAS, tasa: 0.01 });

    const metricas = {
        mae_unidades: maeRed === null ? null : Number(maeRed.toFixed(2)),
        mae_promedio_simple: maeBase === null ? null : Number(maeBase.toFixed(2)),
        mejora_vs_promedio: maeRed === null ? null : maeBase > 0 ? Number((((maeBase - maeRed) / maeBase) * 100).toFixed(1)) : 0,
        precision_aprox: maeRed !== null && mediaReal > 0 ? Number(Math.max(0, (1 - maeRed / mediaReal) * 100).toFixed(1)) : null,
        error_inicial: Number(resultado.errorInicial.toFixed(5)),
        error_final: Number(resultado.errorFinal.toFixed(5)),
        curva_error: resultado.historial,
        epocas: resultado.epocas,
        ejemplos_entrenamiento: ejemplos.length,
        dias_validacion: diasValidacion,
        dias_con_ventas: diasConVentas
    };

    const guardado = await iaRepo.guardarModelo({
        nombre: NOMBRE_MODELO,
        arquitectura: `MLP ${red.arquitectura} (tanh, Adam)`,
        pesos: { red: red.aJSON(), escala, productos: ids, version: 1 },
        metricas,
        muestras: ejemplos.length,
        id_usuario: usuario && usuario.id
    });
    return { estado: 'ok', id_modelo: guardado.id_modelo, fecha_entrenamiento: guardado.fecha_entrenamiento, arquitectura: `MLP ${red.arquitectura}`, metricas };
}

/* ------------------------------ Pronóstico ------------------------------ */
async function obtenerModelo(ids) {
    let modelo = await iaRepo.modeloActivo();
    const productosCambiaron = modelo && JSON.stringify(modelo.pesos.productos) !== JSON.stringify(ids);
    if (!modelo || productosCambiaron || modelo.horas >= HORAS_REENTRENO) {
        const r = await entrenar(null);
        if (r.estado !== 'ok') return { sinDatos: r, modelo: null };
        modelo = await iaRepo.modeloActivo();
    }
    return { modelo };
}

async function pronosticar() {
    const productos = await productosService.listarConDisponibilidad();
    const ids = productos.map(p => p.id_producto);
    const { modelo, sinDatos } = await obtenerModelo(ids);
    if (!modelo) return sinDatos;

    const red = RedNeuronal.desdeJSON(modelo.pesos.red);
    const { escala } = modelo.pesos;
    const hoy = hoyISO();
    const ayer = sumarDias(hoy, -1);
    const filas = await ventasRepo.demandaDiaria(DIAS_HISTORIA + 1);
    const { series } = construirSeries(filas, ids, ayer);

    // Mientras aprende (pocos días de historial), el resultado combina la red con el promedio
    // reciente; el peso de la red sube hasta 100 % al llegar a 14 días con ventas.
    const diasHistorial = (modelo.metricas && modelo.metricas.dias_con_ventas) || 0;
    const pesoRed = Math.min(1, diasHistorial / DIAS_CONFIANZA_TOTAL);

    // Pronóstico recursivo: lo que predice para hoy se usa para predecir mañana, y así.
    const porDia = [];
    const valoresPorProducto = new Map(ids.map(id => [id, [...series.get(id)]]));
    for (let paso = 0; paso <= HORIZONTE; paso++) {
        const fecha = sumarDias(hoy, paso);
        const dia = { fecha, dia_semana: NOMBRES_DIA[diaSemana(fecha)], productos: [] };
        ids.forEach((id, k) => {
            const valores = valoresPorProducto.get(id);
            const x = variables(valores, valores.length, fecha, k, ids.length, escala);
            const reciente = promedio(valores.slice(-7));
            const deLaRed = Math.max(0, red.predecir(x) * escala);
            const unidades = Math.max(0, Math.round(pesoRed * deLaRed + (1 - pesoRed) * reciente));
            valores.push(unidades);
            const p = productos[k];
            dia.productos.push({
                id_producto: id,
                nombre: p.nombre,
                tamano: p.tamano,
                unidades,
                paquetes: Math.ceil(unidades / (p.unidades_por_paquete || 10))
            });
        });
        dia.total_arepas = dia.productos.reduce((a, p) => a + p.unidades, 0);
        porDia.push(dia);
    }

    await iaRepo.guardarPredicciones(modelo.id_modelo, porDia.flatMap(d => d.productos.map(p => ({ ...p, fecha: d.fecha }))));

    // Insumos que se necesitan para producir lo pronosticado mañana
    const manana = porDia[1];
    const necesidades = new Map();
    for (const item of manana.productos) {
        const producto = productos.find(p => p.id_producto === item.id_producto);
        for (const r of producto.receta) {
            const previo = necesidades.get(r.id_insumo) || { id_insumo: r.id_insumo, insumo: r.insumo, unidad: r.unidad_medida, necesita: 0, stock: r.stock_actual };
            previo.necesita += r.cantidad_por_unidad * item.unidades;
            necesidades.set(r.id_insumo, previo);
        }
    }
    const insumos = [...necesidades.values()].map(n => ({
        ...n,
        necesita: Math.round(n.necesita * 1000) / 1000,
        alcanza: n.stock + 1e-9 >= n.necesita,
        falta: Math.max(0, Math.round((n.necesita - n.stock) * 1000) / 1000)
    }));

    return {
        estado: 'ok',
        modelo: {
            id_modelo: modelo.id_modelo,
            nombre: modelo.nombre,
            arquitectura: modelo.arquitectura,
            fecha_entrenamiento: modelo.fecha_entrenamiento,
            muestras: modelo.muestras,
            metricas: modelo.metricas
        },
        peso_red: Math.round(pesoRed * 100),
        dias_historial: diasHistorial,
        hoy: porDia[0],
        manana,
        proximos_dias: porDia.slice(1),
        insumos_manana: insumos,
        alertas: insumos.filter(i => !i.alcanza).map(i => `Para mañana faltan ${i.falta} ${i.unidad} de ${i.insumo}.`)
    };
}

module.exports = { entrenar, pronosticar, construirSeries, armarEjemplos, variables, sumarDias };

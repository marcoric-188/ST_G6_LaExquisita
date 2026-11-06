/**
 * CAPA DE NEGOCIO · Servicio de PRODUCTOS
 * Calcula cuántas arepas / paquetes alcanzan con el stock actual según la receta,
 * para que el POS avise ANTES de vender algo que no se puede preparar.
 */
const productosRepo = require('../repositories/productos.repository');

/** Agrupa las recetas por producto. */
function agruparRecetas(recetas) {
    const mapa = new Map();
    for (const r of recetas) {
        if (!mapa.has(r.id_producto)) mapa.set(r.id_producto, []);
        mapa.get(r.id_producto).push(r);
    }
    return mapa;
}

/** Arepas posibles = mínimo entre (stock del insumo / gasto por arepa). */
function calcularCapacidad(producto, receta) {
    if (!receta || receta.length === 0) {
        return { unidades_disponibles: null, paquetes_disponibles: null, insumo_limitante: null };
    }
    let unidades = Infinity;
    let limitante = null;
    for (const r of receta) {
        const posibles = Math.floor((r.stock_actual + 1e-9) / r.cantidad_requerida);
        if (posibles < unidades) {
            unidades = posibles;
            limitante = r.insumo;
        }
    }
    return {
        unidades_disponibles: unidades,
        paquetes_disponibles: Math.floor(unidades / producto.unidades_por_paquete),
        insumo_limitante: limitante
    };
}

async function listarConDisponibilidad() {
    const [productos, recetas] = await Promise.all([
        productosRepo.listarActivos(),
        productosRepo.recetas()
    ]);
    const porProducto = agruparRecetas(recetas);
    return productos.map(p => ({
        ...p,
        receta: (porProducto.get(p.id_producto) || []).map(r => ({
            id_insumo: r.id_insumo,
            insumo: r.insumo,
            unidad_medida: r.unidad_medida,
            cantidad_por_unidad: r.cantidad_requerida,
            stock_actual: r.stock_actual
        })),
        ...calcularCapacidad(p, porProducto.get(p.id_producto))
    }));
}

module.exports = { listarConDisponibilidad, calcularCapacidad, agruparRecetas };

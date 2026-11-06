/**
 * CAPA DE ACCESO A DATOS · Repositorio de PRODUCTOS y RECETAS
 */
const { sql, db, num } = require('./_base');

const mapear = (f) => f && ({
    ...f,
    precio: num(f.precio),
    precio_unidad: num(f.precio_unidad),
    unidades_por_paquete: num(f.unidades_por_paquete) || 10
});

async function listarActivos(runner) {
    const r = await db(runner).request().query(`
        SELECT id_producto, nombre, COALESCE(nombre_corto, nombre) AS nombre_corto, descripcion, categoria,
               tamano, precio, precio_unidad, unidades_por_paquete, imagen, activo
        FROM dbo.productos
        WHERE activo = 1
        ORDER BY orden, nombre;`);
    return r.recordset.map(mapear);
}

/** Productos por id (ids ya validados como enteros). */
async function buscarPorIds(ids, runner) {
    if (!ids.length) return [];
    const request = db(runner).request();
    const marcadores = ids.map((id, i) => {
        request.input(`id${i}`, sql.Int, id);
        return `@id${i}`;
    });
    const r = await request.query(`
        SELECT id_producto, nombre, COALESCE(nombre_corto, nombre) AS nombre_corto, tamano,
               precio, precio_unidad, unidades_por_paquete, activo
        FROM dbo.productos
        WHERE id_producto IN (${marcadores.join(', ')});`);
    return r.recordset.map(mapear);
}

/** Recetas (insumo por UNA arepa) con el stock actual de cada insumo. */
async function recetas(runner) {
    const r = await db(runner).request().query(`
        SELECT r.id_producto, r.id_insumo, r.cantidad_requerida,
               i.nombre AS insumo, i.unidad_medida, i.stock_actual
        FROM dbo.recetas AS r
        JOIN dbo.insumos AS i ON i.id_insumo = r.id_insumo;`);
    return r.recordset.map(f => ({
        ...f,
        cantidad_requerida: num(f.cantidad_requerida),
        stock_actual: num(f.stock_actual)
    }));
}

module.exports = { listarActivos, buscarPorIds, recetas };

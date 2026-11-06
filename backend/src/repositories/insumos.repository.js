/**
 * CAPA DE ACCESO A DATOS · Repositorio de INSUMOS y KARDEX
 * (tablas dbo.insumos, dbo.movimientos_inventario y vista dbo.vw_insumos_estado)
 */
const { sql, db, num, fecha } = require('./_base');

const mapear = (f) => f && ({
    ...f,
    stock_actual: num(f.stock_actual),
    stock_minimo: num(f.stock_minimo)
});

async function listar(runner) {
    const r = await db(runner).request().query(`
        SELECT id_insumo, nombre, unidad_medida, stock_actual, stock_minimo, estado
        FROM dbo.vw_insumos_estado
        WHERE activo = 1
        ORDER BY nombre;`);
    return r.recordset.map(mapear);
}

async function buscarPorId(id, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .query(`SELECT id_insumo, nombre, unidad_medida, stock_actual, stock_minimo, estado, activo
                FROM dbo.vw_insumos_estado WHERE id_insumo = @id;`);
    return mapear(r.recordset[0]) || null;
}

async function buscarPorNombre(nombre, excluirId = null) {
    const r = await db().request()
        .input('nombre', sql.VarChar(100), nombre)
        .input('excluir', sql.Int, excluirId)
        .query(`SELECT id_insumo, nombre, activo FROM dbo.insumos
                WHERE nombre = @nombre AND (@excluir IS NULL OR id_insumo <> @excluir);`);
    return r.recordset[0] || null;
}

async function crear({ nombre, unidad_medida, stock_actual, stock_minimo }, runner) {
    const r = await db(runner).request()
        .input('nombre', sql.VarChar(100), nombre)
        .input('unidad', sql.VarChar(20), unidad_medida)
        .input('stock', sql.Decimal(12, 3), stock_actual)
        .input('minimo', sql.Decimal(12, 3), stock_minimo)
        .query(`INSERT INTO dbo.insumos (nombre, unidad_medida, stock_actual, stock_minimo, activo)
                OUTPUT INSERTED.id_insumo
                VALUES (@nombre, @unidad, @stock, @minimo, 1);`);
    return r.recordset[0].id_insumo;
}

async function reactivar(id, { unidad_medida, stock_minimo }, runner) {
    await db(runner).request()
        .input('id', sql.Int, id)
        .input('unidad', sql.VarChar(20), unidad_medida)
        .input('minimo', sql.Decimal(12, 3), stock_minimo)
        .query('UPDATE dbo.insumos SET activo = 1, unidad_medida = @unidad, stock_minimo = @minimo WHERE id_insumo = @id;');
}

async function actualizar(id, { nombre, unidad_medida, stock_minimo }) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .input('nombre', sql.VarChar(100), nombre)
        .input('unidad', sql.VarChar(20), unidad_medida)
        .input('minimo', sql.Decimal(12, 3), stock_minimo)
        .query(`UPDATE dbo.insumos SET nombre = @nombre, unidad_medida = @unidad, stock_minimo = @minimo
                WHERE id_insumo = @id AND activo = 1;`);
    return r.rowsAffected[0] > 0;
}

async function desactivar(id) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .query('UPDATE dbo.insumos SET activo = 0 WHERE id_insumo = @id AND activo = 1;');
    return r.rowsAffected[0] > 0;
}

/**
 * Descuenta stock de forma ATÓMICA: solo si alcanza (stock_actual >= cantidad).
 * Devuelve el stock resultante, o null si no había suficiente.
 */
async function descontar(id, cantidad, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .input('cantidad', sql.Decimal(12, 3), cantidad)
        .query(`UPDATE dbo.insumos
                SET stock_actual = stock_actual - @cantidad
                OUTPUT INSERTED.stock_actual
                WHERE id_insumo = @id AND activo = 1 AND stock_actual >= @cantidad;`);
    return r.recordset[0] ? num(r.recordset[0].stock_actual) : null;
}

async function sumar(id, cantidad, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .input('cantidad', sql.Decimal(12, 3), cantidad)
        .query(`UPDATE dbo.insumos
                SET stock_actual = stock_actual + @cantidad
                OUTPUT INSERTED.stock_actual
                WHERE id_insumo = @id AND activo = 1;`);
    return r.recordset[0] ? num(r.recordset[0].stock_actual) : null;
}

async function registrarMovimiento({ id_insumo, tipo, cantidad, stock_resultante, referencia, id_usuario }, runner) {
    await db(runner).request()
        .input('id_insumo', sql.Int, id_insumo)
        .input('tipo', sql.VarChar(20), tipo)
        .input('cantidad', sql.Decimal(12, 3), cantidad)
        .input('stock', sql.Decimal(12, 3), stock_resultante)
        .input('referencia', sql.VarChar(100), referencia || null)
        .input('id_usuario', sql.Int, id_usuario || null)
        .query(`INSERT INTO dbo.movimientos_inventario (id_insumo, tipo, cantidad, stock_resultante, referencia, id_usuario)
                VALUES (@id_insumo, @tipo, @cantidad, @stock, @referencia, @id_usuario);`);
}

async function movimientos({ id_insumo = null, limite = 50 } = {}) {
    const r = await db().request()
        .input('id', sql.Int, id_insumo)
        .input('limite', sql.Int, limite)
        .query(`
            SELECT TOP (@limite) m.id_movimiento, m.id_insumo, i.nombre AS insumo, i.unidad_medida,
                   m.tipo, m.cantidad, m.stock_resultante, m.referencia, u.nombre AS usuario,
                   ${fecha('m.fecha_hora', 'fecha_hora')}
            FROM dbo.movimientos_inventario AS m
            JOIN dbo.insumos AS i ON i.id_insumo = m.id_insumo
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = m.id_usuario
            WHERE (@id IS NULL OR m.id_insumo = @id)
            ORDER BY m.id_movimiento DESC;`);
    return r.recordset.map(f => ({ ...f, cantidad: num(f.cantidad), stock_resultante: num(f.stock_resultante) }));
}

/** Consumo por ventas de cada insumo en los últimos N días. */
async function consumoPorVentas(dias = 7) {
    const r = await db().request()
        .input('dias', sql.Int, dias)
        .query(`
            SELECT id_insumo, SUM(-cantidad) AS consumo
            FROM dbo.movimientos_inventario
            WHERE tipo = 'venta' AND fecha_hora >= DATEADD(DAY, -@dias, GETDATE())
            GROUP BY id_insumo;`);
    return new Map(r.recordset.map(f => [f.id_insumo, num(f.consumo)]));
}

module.exports = {
    listar,
    buscarPorId,
    buscarPorNombre,
    crear,
    reactivar,
    actualizar,
    desactivar,
    descontar,
    sumar,
    registrarMovimiento,
    movimientos,
    consumoPorVentas
};

/**
 * CAPA DE ACCESO A DATOS · Repositorio de VENTAS y DETALLE_VENTAS
 * Incluye las consultas de reportes que usan el panel de inicio y la IA.
 */
const { sql, db, num, fecha, CTE_PERIODOS, UNIDADES_LINEA } = require('./_base');

const NOMBRE_LINEA = `CASE WHEN d.modalidad = 'unidad' THEN COALESCE(p.nombre_corto, p.nombre) + ' (unidad)' ELSE p.nombre END`;

async function crear({ total, metodo_pago, id_usuario, id_cliente }, runner) {
    const r = await db(runner).request()
        .input('total', sql.Decimal(12, 2), total)
        .input('metodo', sql.VarChar(20), metodo_pago)
        .input('id_usuario', sql.Int, id_usuario)
        .input('id_cliente', sql.Int, id_cliente)
        .query(`INSERT INTO dbo.ventas (fecha_hora, total, metodo_pago, id_usuario, id_cliente)
                OUTPUT INSERTED.id_venta, ${fecha('INSERTED.fecha_hora', 'fecha_hora')}
                VALUES (GETDATE(), @total, @metodo, @id_usuario, @id_cliente);`);
    return r.recordset[0];
}

async function crearDetalle({ id_venta, id_producto, modalidad, cantidad, unidades, precio_unitario, subtotal }, runner) {
    await db(runner).request()
        .input('id_venta', sql.Int, id_venta)
        .input('id_producto', sql.Int, id_producto)
        .input('modalidad', sql.VarChar(10), modalidad)
        .input('cantidad', sql.Int, cantidad)
        .input('unidades', sql.Int, unidades)
        .input('precio', sql.Decimal(10, 2), precio_unitario)
        .input('subtotal', sql.Decimal(12, 2), subtotal)
        .query(`INSERT INTO dbo.detalle_ventas (id_venta, id_producto, modalidad, cantidad, unidades, precio_unitario, subtotal)
                VALUES (@id_venta, @id_producto, @modalidad, @cantidad, @unidades, @precio, @subtotal);`);
}

async function listar({ desde = null, hasta = null, id_cliente = null, limite = 100 } = {}) {
    const r = await db().request()
        .input('desde', sql.VarChar(10), desde)
        .input('hasta', sql.VarChar(10), hasta)
        .input('id_cliente', sql.Int, id_cliente)
        .input('limite', sql.Int, limite)
        .query(`
            SELECT TOP (@limite)
                   v.id_venta, ${fecha('v.fecha_hora', 'fecha_hora')}, v.metodo_pago, v.total,
                   v.id_cliente, c.nombre AS cliente, u.nombre AS vendedor,
                   (SELECT STRING_AGG(CONCAT(d.cantidad, ' x ', ${NOMBRE_LINEA}), ', ')
                      FROM dbo.detalle_ventas AS d JOIN dbo.productos AS p ON p.id_producto = d.id_producto
                     WHERE d.id_venta = v.id_venta) AS resumen,
                   (SELECT SUM(${UNIDADES_LINEA})
                      FROM dbo.detalle_ventas AS d JOIN dbo.productos AS p ON p.id_producto = d.id_producto
                     WHERE d.id_venta = v.id_venta) AS unidades
            FROM dbo.ventas AS v
            LEFT JOIN dbo.clientes AS c ON c.id_cliente = v.id_cliente
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = v.id_usuario
            WHERE (@desde IS NULL OR v.fecha_hora >= CAST(@desde AS DATE))
              AND (@hasta IS NULL OR v.fecha_hora < DATEADD(DAY, 1, CAST(@hasta AS DATE)))
              AND (@id_cliente IS NULL OR v.id_cliente = @id_cliente)
            ORDER BY v.id_venta DESC;`);
    return r.recordset.map(f => ({ ...f, total: num(f.total), unidades: num(f.unidades) || 0 }));
}

async function totalesRango({ desde = null, hasta = null } = {}) {
    const r = await db().request()
        .input('desde', sql.VarChar(10), desde)
        .input('hasta', sql.VarChar(10), hasta)
        .query(`
            SELECT COUNT(*) AS ventas, ISNULL(SUM(total), 0) AS total
            FROM dbo.ventas AS v
            WHERE (@desde IS NULL OR v.fecha_hora >= CAST(@desde AS DATE))
              AND (@hasta IS NULL OR v.fecha_hora < DATEADD(DAY, 1, CAST(@hasta AS DATE)));`);
    const f = r.recordset[0];
    return { ventas: num(f.ventas), total: num(f.total) };
}

async function buscarPorId(id) {
    const cabecera = await db().request()
        .input('id', sql.Int, id)
        .query(`
            SELECT v.id_venta, ${fecha('v.fecha_hora', 'fecha_hora')}, v.metodo_pago, v.total,
                   v.id_cliente, c.nombre AS cliente, c.documento, c.telefono, u.nombre AS vendedor
            FROM dbo.ventas AS v
            LEFT JOIN dbo.clientes AS c ON c.id_cliente = v.id_cliente
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = v.id_usuario
            WHERE v.id_venta = @id;`);
    if (!cabecera.recordset[0]) return null;

    const lineas = await db().request()
        .input('id', sql.Int, id)
        .query(`
            SELECT d.id_detalle, d.id_producto, ${NOMBRE_LINEA} AS producto, d.modalidad,
                   d.cantidad, ${UNIDADES_LINEA} AS unidades, d.precio_unitario, d.subtotal
            FROM dbo.detalle_ventas AS d
            JOIN dbo.productos AS p ON p.id_producto = d.id_producto
            WHERE d.id_venta = @id
            ORDER BY d.id_detalle;`);

    return {
        ...cabecera.recordset[0],
        total: num(cabecera.recordset[0].total),
        items: lineas.recordset.map(l => ({
            ...l,
            unidades: num(l.unidades),
            precio_unitario: num(l.precio_unitario),
            subtotal: num(l.subtotal)
        }))
    };
}

/* ---------------------------- Reportes ---------------------------- */

/** Cantidad y total vendido por periodo: hoy, ayer, semana, mes, total. */
async function resumenPorPeriodo() {
    const r = await db().request().query(`
        WITH ${CTE_PERIODOS}
        SELECT pe.periodo, COUNT(v.id_venta) AS ventas, ISNULL(SUM(v.total), 0) AS total
        FROM periodos AS pe
        LEFT JOIN dbo.ventas AS v ON v.fecha_hora >= pe.desde AND v.fecha_hora < pe.hasta
        GROUP BY pe.periodo;`);
    const salida = {};
    for (const f of r.recordset) salida[f.periodo] = { ventas: num(f.ventas), total: num(f.total) };
    return salida;
}

/** Paquetes/unidades vendidas por producto, modalidad y periodo. */
async function productosPorPeriodo() {
    const r = await db().request().query(`
        WITH ${CTE_PERIODOS}
        SELECT pe.periodo, p.id_producto, p.nombre, COALESCE(p.nombre_corto, p.nombre) AS nombre_corto,
               p.tamano, d.modalidad,
               SUM(d.cantidad) AS cantidad, SUM(${UNIDADES_LINEA}) AS unidades, SUM(d.subtotal) AS total
        FROM periodos AS pe
        JOIN dbo.ventas AS v ON v.fecha_hora >= pe.desde AND v.fecha_hora < pe.hasta
        JOIN dbo.detalle_ventas AS d ON d.id_venta = v.id_venta
        JOIN dbo.productos AS p ON p.id_producto = d.id_producto
        GROUP BY pe.periodo, p.id_producto, p.nombre, p.nombre_corto, p.tamano, d.modalidad;`);
    return r.recordset.map(f => ({
        ...f,
        cantidad: num(f.cantidad),
        unidades: num(f.unidades),
        total: num(f.total)
    }));
}

/** Total por método de pago y periodo. */
async function metodosPorPeriodo() {
    const r = await db().request().query(`
        WITH ${CTE_PERIODOS}
        SELECT pe.periodo, v.metodo_pago, COUNT(*) AS ventas, SUM(v.total) AS total
        FROM periodos AS pe
        JOIN dbo.ventas AS v ON v.fecha_hora >= pe.desde AND v.fecha_hora < pe.hasta
        GROUP BY pe.periodo, v.metodo_pago;`);
    return r.recordset.map(f => ({ ...f, ventas: num(f.ventas), total: num(f.total) }));
}

/** Serie diaria de los últimos N días (incluye días sin ventas en 0). */
async function serieDiaria(dias = 7) {
    const r = await db().request()
        .input('dias', sql.Int, dias)
        .query(`
            WITH dias AS (
                SELECT CAST(GETDATE() AS DATE) AS dia, 1 AS n
                UNION ALL
                SELECT DATEADD(DAY, -1, dia), n + 1 FROM dias WHERE n < @dias
            )
            SELECT CONVERT(VARCHAR(10), dias.dia, 23) AS fecha,
                   COUNT(v.id_venta) AS ventas, ISNULL(SUM(v.total), 0) AS total
            FROM dias
            LEFT JOIN dbo.ventas AS v
                   ON v.fecha_hora >= dias.dia AND v.fecha_hora < DATEADD(DAY, 1, dias.dia)
            GROUP BY dias.dia
            ORDER BY dias.dia
            OPTION (MAXRECURSION 400);`);
    return r.recordset.map(f => ({ fecha: f.fecha, ventas: num(f.ventas), total: num(f.total) }));
}

module.exports = {
    crear,
    crearDetalle,
    listar,
    totalesRango,
    buscarPorId,
    resumenPorPeriodo,
    productosPorPeriodo,
    metodosPorPeriodo,
    serieDiaria
};

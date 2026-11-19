/**
 * CAPA DE ACCESO A DATOS · Repositorio de VENTAS, DETALLE_VENTAS y DEVOLUCIONES
 * Incluye las consultas de reportes que usan el panel de inicio, la IA y la red neuronal.
 *
 * Reglas de los reportes:
 *  - Las ventas PENDIENTES no cuentan como vendido (todavía no se han cobrado).
 *  - El total que se reporta es el NETO: total - total_devuelto (reembolsos).
 */
const { sql, db, num, fecha, CTE_PERIODOS, UNIDADES_LINEA } = require('./_base');

const NOMBRE_LINEA = `CASE WHEN d.modalidad = 'unidad' THEN COALESCE(p.nombre_corto, p.nombre) + ' (unidad)' ELSE p.nombre END`;
const NETO = `(v.total - ISNULL(v.total_devuelto, 0))`;
const CONFIRMADA = `ISNULL(v.estado, 'completada') <> 'pendiente'`;

/* ---------------------------- Escritura ---------------------------- */

async function crear({ total, metodo_pago, id_usuario, id_cliente, estado = 'completada', observacion = null, origen = 'pos', fecha_hora = null }, runner) {
    const r = await db(runner).request()
        .input('total', sql.Decimal(12, 2), total)
        .input('metodo', sql.VarChar(20), metodo_pago)
        .input('id_usuario', sql.Int, id_usuario)
        .input('id_cliente', sql.Int, id_cliente)
        .input('estado', sql.VarChar(20), estado)
        .input('observacion', sql.VarChar(255), observacion)
        .input('origen', sql.VarChar(10), origen)
        .input('fecha', sql.VarChar(19), fecha_hora)
        .query(`
            DECLARE @f DATETIME = COALESCE(CONVERT(DATETIME, @fecha, 126), GETDATE());
            -- Número consecutivo visible (0001, 0002...). UPDLOCK + HOLDLOCK evita que
            -- dos ventas simultáneas tomen el mismo número.
            DECLARE @numero INT = (SELECT ISNULL(MAX(numero), 0) + 1 FROM dbo.ventas WITH (UPDLOCK, HOLDLOCK));
            INSERT INTO dbo.ventas (numero, fecha_hora, total, metodo_pago, id_usuario, id_cliente, estado, observacion, origen, fecha_completada)
            OUTPUT INSERTED.id_venta, INSERTED.numero, ${fecha('INSERTED.fecha_hora', 'fecha_hora')}
            VALUES (@numero, @f, @total, @metodo, @id_usuario, @id_cliente, @estado, @observacion, @origen,
                    CASE WHEN @estado = 'completada' THEN @f ELSE NULL END);`);
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

/** Bloquea la fila de la venta dentro de la transacción (evita dos cambios a la vez). */
async function bloquear(id, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .query(`SELECT id_venta, ISNULL(numero, id_venta) AS numero, id_cliente, total, ISNULL(total_devuelto, 0) AS total_devuelto,
                       ISNULL(estado, 'completada') AS estado, metodo_pago
                FROM dbo.ventas WITH (UPDLOCK, ROWLOCK)
                WHERE id_venta = @id;`);
    const f = r.recordset[0];
    return f ? { ...f, total: num(f.total), total_devuelto: num(f.total_devuelto) } : null;
}

/** Pendiente -> completada. Devuelve false si ya no estaba pendiente. */
async function completar(id, metodo_pago, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .input('metodo', sql.VarChar(20), metodo_pago)
        .query(`UPDATE dbo.ventas
                SET estado = 'completada', metodo_pago = @metodo, fecha_completada = GETDATE()
                WHERE id_venta = @id AND estado = 'pendiente';`);
    return r.rowsAffected[0] > 0;
}

/** Líneas de la venta con lo que ya se devolvió de cada una. */
async function lineasConDevuelto(id, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .query(`
            SELECT d.id_detalle, d.id_producto, ${NOMBRE_LINEA} AS producto, d.modalidad, d.cantidad,
                   ${UNIDADES_LINEA} AS unidades, d.precio_unitario, d.subtotal,
                   ISNULL((SELECT SUM(dd.cantidad) FROM dbo.detalle_devoluciones AS dd
                           WHERE dd.id_detalle = d.id_detalle), 0) AS cantidad_devuelta
            FROM dbo.detalle_ventas AS d
            JOIN dbo.productos AS p ON p.id_producto = d.id_producto
            WHERE d.id_venta = @id
            ORDER BY d.id_detalle;`);
    return r.recordset.map(l => ({
        ...l,
        unidades: num(l.unidades),
        precio_unitario: num(l.precio_unitario),
        subtotal: num(l.subtotal),
        cantidad_devuelta: num(l.cantidad_devuelta)
    }));
}

async function crearDevolucion({ id_venta, tipo, accion, motivo, total_reembolsado, id_usuario }, runner) {
    const r = await db(runner).request()
        .input('id_venta', sql.Int, id_venta)
        .input('tipo', sql.VarChar(30), tipo)
        .input('accion', sql.VarChar(20), accion)
        .input('motivo', sql.VarChar(255), motivo)
        .input('total', sql.Decimal(12, 2), total_reembolsado)
        .input('id_usuario', sql.Int, id_usuario)
        .query(`INSERT INTO dbo.devoluciones (id_venta, tipo, accion, motivo, total_reembolsado, id_usuario)
                OUTPUT INSERTED.id_devolucion, ${fecha('INSERTED.fecha_hora', 'fecha_hora')}
                VALUES (@id_venta, @tipo, @accion, @motivo, @total, @id_usuario);`);
    return r.recordset[0];
}

async function crearDetalleDevolucion({ id_devolucion, id_detalle, cantidad, unidades, subtotal }, runner) {
    await db(runner).request()
        .input('id_devolucion', sql.Int, id_devolucion)
        .input('id_detalle', sql.Int, id_detalle)
        .input('cantidad', sql.Int, cantidad)
        .input('unidades', sql.Int, unidades)
        .input('subtotal', sql.Decimal(12, 2), subtotal)
        .query(`INSERT INTO dbo.detalle_devoluciones (id_devolucion, id_detalle, cantidad, unidades, subtotal)
                VALUES (@id_devolucion, @id_detalle, @cantidad, @unidades, @subtotal);`);
}

/** Suma un reembolso a la venta y recalcula su estado. */
async function aplicarReembolso(id, monto, devueltoTodo, runner) {
    await db(runner).request()
        .input('id', sql.Int, id)
        .input('monto', sql.Decimal(12, 2), monto)
        .input('todo', sql.Bit, devueltoTodo)
        .query(`UPDATE dbo.ventas
                SET total_devuelto = ISNULL(total_devuelto, 0) + @monto,
                    estado = CASE WHEN @todo = 1 THEN 'devuelta' ELSE 'devuelta_parcial' END
                WHERE id_venta = @id;`);
}

/* ---------------------------- Lectura ---------------------------- */

async function listar({ desde = null, hasta = null, id_cliente = null, estado = null, limite = 100 } = {}) {
    const r = await db().request()
        .input('desde', sql.VarChar(10), desde)
        .input('hasta', sql.VarChar(10), hasta)
        .input('id_cliente', sql.Int, id_cliente)
        .input('estado', sql.VarChar(20), estado)
        .input('limite', sql.Int, limite)
        .query(`
            SELECT TOP (@limite)
                   v.id_venta, ISNULL(v.numero, v.id_venta) AS numero, ${fecha('v.fecha_hora', 'fecha_hora')}, v.metodo_pago, v.total,
                   ISNULL(v.total_devuelto, 0) AS total_devuelto, ${NETO} AS total_neto,
                   ISNULL(v.estado, 'completada') AS estado,
                   v.id_cliente, c.nombre AS cliente, u.nombre AS vendedor,
                   (SELECT STRING_AGG(CONCAT(d.cantidad, ' x ', ${NOMBRE_LINEA}), ', ')
                      FROM dbo.detalle_ventas AS d JOIN dbo.productos AS p ON p.id_producto = d.id_producto
                     WHERE d.id_venta = v.id_venta) AS resumen,
                   (SELECT SUM(${UNIDADES_LINEA})
                      FROM dbo.detalle_ventas AS d JOIN dbo.productos AS p ON p.id_producto = d.id_producto
                     WHERE d.id_venta = v.id_venta) AS unidades,
                   (SELECT COUNT(*) FROM dbo.devoluciones AS dv WHERE dv.id_venta = v.id_venta) AS devoluciones
            FROM dbo.ventas AS v
            LEFT JOIN dbo.clientes AS c ON c.id_cliente = v.id_cliente
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = v.id_usuario
            WHERE (@desde IS NULL OR v.fecha_hora >= CAST(@desde AS DATE))
              AND (@hasta IS NULL OR v.fecha_hora < DATEADD(DAY, 1, CAST(@hasta AS DATE)))
              AND (@id_cliente IS NULL OR v.id_cliente = @id_cliente)
              AND (@estado IS NULL OR ISNULL(v.estado, 'completada') = @estado
                   OR (@estado = 'devuelta' AND v.estado = 'devuelta_parcial'))
            ORDER BY v.id_venta DESC;`);
    return r.recordset.map(f => ({
        ...f,
        total: num(f.total),
        total_devuelto: num(f.total_devuelto),
        total_neto: num(f.total_neto),
        unidades: num(f.unidades) || 0,
        devoluciones: num(f.devoluciones) || 0
    }));
}

/** Totales del rango: vendido neto (sin pendientes) y lo que está pendiente por cobrar. */
async function totalesRango({ desde = null, hasta = null } = {}) {
    const r = await db().request()
        .input('desde', sql.VarChar(10), desde)
        .input('hasta', sql.VarChar(10), hasta)
        .query(`
            SELECT SUM(CASE WHEN ${CONFIRMADA} THEN 1 ELSE 0 END) AS ventas,
                   ISNULL(SUM(CASE WHEN ${CONFIRMADA} THEN ${NETO} ELSE 0 END), 0) AS total,
                   SUM(CASE WHEN v.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
                   ISNULL(SUM(CASE WHEN v.estado = 'pendiente' THEN v.total ELSE 0 END), 0) AS por_cobrar,
                   ISNULL(SUM(ISNULL(v.total_devuelto, 0)), 0) AS devuelto
            FROM dbo.ventas AS v
            WHERE (@desde IS NULL OR v.fecha_hora >= CAST(@desde AS DATE))
              AND (@hasta IS NULL OR v.fecha_hora < DATEADD(DAY, 1, CAST(@hasta AS DATE)));`);
    const f = r.recordset[0];
    return {
        ventas: num(f.ventas) || 0,
        total: num(f.total),
        pendientes: num(f.pendientes) || 0,
        por_cobrar: num(f.por_cobrar),
        devuelto: num(f.devuelto)
    };
}

async function buscarPorId(id) {
    const cabecera = await db().request()
        .input('id', sql.Int, id)
        .query(`
            SELECT v.id_venta, ISNULL(v.numero, v.id_venta) AS numero, ${fecha('v.fecha_hora', 'fecha_hora')}, ${fecha('v.fecha_completada', 'fecha_completada')},
                   v.metodo_pago, v.total, ISNULL(v.total_devuelto, 0) AS total_devuelto, ${NETO} AS total_neto,
                   ISNULL(v.estado, 'completada') AS estado, v.observacion,
                   v.id_cliente, c.nombre AS cliente, c.documento, c.telefono, u.nombre AS vendedor
            FROM dbo.ventas AS v
            LEFT JOIN dbo.clientes AS c ON c.id_cliente = v.id_cliente
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = v.id_usuario
            WHERE v.id_venta = @id;`);
    const venta = cabecera.recordset[0];
    if (!venta) return null;

    const items = await lineasConDevuelto(id);
    const devs = await db().request()
        .input('id', sql.Int, id)
        .query(`
            SELECT dv.id_devolucion, ${fecha('dv.fecha_hora', 'fecha_hora')}, dv.tipo, dv.accion, dv.motivo,
                   dv.total_reembolsado, u.nombre AS usuario,
                   (SELECT STRING_AGG(CONCAT(dd.cantidad, ' x ', ${NOMBRE_LINEA}), ', ')
                      FROM dbo.detalle_devoluciones AS dd
                      JOIN dbo.detalle_ventas AS d ON d.id_detalle = dd.id_detalle
                      JOIN dbo.productos AS p ON p.id_producto = d.id_producto
                     WHERE dd.id_devolucion = dv.id_devolucion) AS resumen
            FROM dbo.devoluciones AS dv
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = dv.id_usuario
            WHERE dv.id_venta = @id
            ORDER BY dv.id_devolucion;`);

    return {
        ...venta,
        total: num(venta.total),
        total_devuelto: num(venta.total_devuelto),
        total_neto: num(venta.total_neto),
        items,
        devoluciones: devs.recordset.map(d => ({ ...d, total_reembolsado: num(d.total_reembolsado) }))
    };
}

/* ---------------------------- Reportes ---------------------------- */

/** Cantidad y total NETO vendido por periodo (sin pendientes) + pendientes por cobrar. */
async function resumenPorPeriodo() {
    const r = await db().request().query(`
        WITH ${CTE_PERIODOS}
        SELECT pe.periodo,
               SUM(CASE WHEN v.id_venta IS NOT NULL AND ${CONFIRMADA} THEN 1 ELSE 0 END) AS ventas,
               ISNULL(SUM(CASE WHEN ${CONFIRMADA} THEN ${NETO} END), 0) AS total,
               SUM(CASE WHEN v.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
               ISNULL(SUM(CASE WHEN v.estado = 'pendiente' THEN v.total END), 0) AS por_cobrar,
               ISNULL(SUM(v.total_devuelto), 0) AS devuelto
        FROM periodos AS pe
        LEFT JOIN dbo.ventas AS v ON v.fecha_hora >= pe.desde AND v.fecha_hora < pe.hasta
        GROUP BY pe.periodo;`);
    const salida = {};
    for (const f of r.recordset) {
        salida[f.periodo] = {
            ventas: num(f.ventas) || 0,
            total: num(f.total),
            pendientes: num(f.pendientes) || 0,
            por_cobrar: num(f.por_cobrar),
            devuelto: num(f.devuelto)
        };
    }
    return salida;
}

/** Paquetes/unidades vendidas por producto, modalidad y periodo (sin pendientes). */
async function productosPorPeriodo() {
    const r = await db().request().query(`
        WITH ${CTE_PERIODOS}
        SELECT pe.periodo, p.id_producto, p.nombre, COALESCE(p.nombre_corto, p.nombre) AS nombre_corto,
               p.tamano, d.modalidad,
               SUM(d.cantidad) AS cantidad, SUM(${UNIDADES_LINEA}) AS unidades, SUM(d.subtotal) AS total
        FROM periodos AS pe
        JOIN dbo.ventas AS v ON v.fecha_hora >= pe.desde AND v.fecha_hora < pe.hasta AND ${CONFIRMADA}
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

/** Total neto por método de pago y periodo. */
async function metodosPorPeriodo() {
    const r = await db().request().query(`
        WITH ${CTE_PERIODOS}
        SELECT pe.periodo, v.metodo_pago, COUNT(*) AS ventas, SUM(${NETO}) AS total
        FROM periodos AS pe
        JOIN dbo.ventas AS v ON v.fecha_hora >= pe.desde AND v.fecha_hora < pe.hasta AND ${CONFIRMADA}
        GROUP BY pe.periodo, v.metodo_pago;`);
    return r.recordset.map(f => ({ ...f, ventas: num(f.ventas), total: num(f.total) }));
}

/** Serie diaria NETA de los últimos N días (incluye días sin ventas en 0). */
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
                   COUNT(v.id_venta) AS ventas, ISNULL(SUM(${NETO}), 0) AS total
            FROM dias
            LEFT JOIN dbo.ventas AS v
                   ON v.fecha_hora >= dias.dia AND v.fecha_hora < DATEADD(DAY, 1, dias.dia) AND ${CONFIRMADA}
            GROUP BY dias.dia
            ORDER BY dias.dia
            OPTION (MAXRECURSION 400);`);
    return r.recordset.map(f => ({ fecha: f.fecha, ventas: num(f.ventas), total: num(f.total) }));
}

/** Resumen de devoluciones de los últimos N días por tipo y acción. */
async function resumenDevoluciones(dias = 30) {
    const r = await db().request()
        .input('dias', sql.Int, dias)
        .query(`
            SELECT tipo, accion, COUNT(*) AS cantidad, ISNULL(SUM(total_reembolsado), 0) AS reembolsado
            FROM dbo.devoluciones
            WHERE fecha_hora >= DATEADD(DAY, -@dias, GETDATE())
            GROUP BY tipo, accion;`);
    return r.recordset.map(f => ({ ...f, cantidad: num(f.cantidad), reembolsado: num(f.reembolsado) }));
}

/**
 * Historial para la RED NEURONAL: arepas vendidas por día y producto en los últimos N días.
 * Cuenta toda la demanda registrada (también pendientes), excepto lo reembolsado.
 */
async function demandaDiaria(dias = 120) {
    const r = await db().request()
        .input('dias', sql.Int, dias)
        .query(`
            SELECT CONVERT(VARCHAR(10), CAST(v.fecha_hora AS DATE), 23) AS fecha, d.id_producto,
                   SUM(${UNIDADES_LINEA}) - ISNULL(SUM(dev.unidades), 0) AS unidades
            FROM dbo.ventas AS v
            JOIN dbo.detalle_ventas AS d ON d.id_venta = v.id_venta
            JOIN dbo.productos AS p ON p.id_producto = d.id_producto
            OUTER APPLY (SELECT SUM(dd.unidades) AS unidades
                         FROM dbo.detalle_devoluciones AS dd
                         JOIN dbo.devoluciones AS dv ON dv.id_devolucion = dd.id_devolucion
                         WHERE dd.id_detalle = d.id_detalle AND dv.accion = 'reembolso') AS dev
            WHERE v.fecha_hora >= DATEADD(DAY, -@dias, CAST(GETDATE() AS DATE))
            GROUP BY CAST(v.fecha_hora AS DATE), d.id_producto;`);
    return r.recordset.map(f => ({ fecha: f.fecha, id_producto: f.id_producto, unidades: Math.max(0, num(f.unidades) || 0) }));
}

module.exports = {
    crear,
    crearDetalle,
    bloquear,
    completar,
    lineasConDevuelto,
    crearDevolucion,
    crearDetalleDevolucion,
    aplicarReembolso,
    listar,
    totalesRango,
    buscarPorId,
    resumenPorPeriodo,
    productosPorPeriodo,
    metodosPorPeriodo,
    serieDiaria,
    resumenDevoluciones,
    demandaDiaria
};

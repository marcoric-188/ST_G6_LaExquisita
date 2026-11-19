/**
 * CAPA DE ACCESO A DATOS · Repositorio de CLIENTES (tabla dbo.clientes)
 */
const { sql, db, num, patronLike, fecha } = require('./_base');

/**
 * Frecuencia del cliente (según cuántos DÍAS distintos compró en los últimos 30 días):
 *   Nuevo     -> todavía no tiene compras
 *   Frecuente -> compró en 4 o más días distintos del último mes
 *   Ocasional -> compra, pero menos seguido
 * Las compras y el acumulado se calculan desde la tabla ventas (netos, sin pendientes),
 * así siempre coinciden con el historial.
 */
const DIAS_FRECUENTE = 4;

const RESUMEN_COMPRAS = `
    OUTER APPLY (
        SELECT COUNT(*) AS compras,
               SUM(v.total - ISNULL(v.total_devuelto, 0)) AS total,
               MAX(v.fecha_hora) AS ultima,
               COUNT(DISTINCT CASE WHEN v.fecha_hora >= DATEADD(DAY, -30, GETDATE())
                                   THEN CAST(v.fecha_hora AS DATE) END) AS dias_mes
        FROM dbo.ventas AS v
        WHERE v.id_cliente = c.id_cliente AND ISNULL(v.estado, 'completada') <> 'pendiente'
    ) AS a`;

const FRECUENCIA = `CASE WHEN ISNULL(a.compras, 0) = 0 THEN 'Nuevo'
                         WHEN a.dias_mes >= ${DIAS_FRECUENTE} THEN 'Frecuente'
                         ELSE 'Ocasional' END`;

const SELECT_CLIENTE = `
    SELECT c.id_cliente, c.nombre, c.documento, c.telefono, c.correo, c.direccion, c.tipo_cliente,
           ISNULL(a.total, 0)   AS total_compras,
           ISNULL(a.compras, 0) AS numero_compras,
           ISNULL(a.dias_mes, 0) AS dias_compra_mes,
           ${FRECUENCIA}        AS rango,
           c.activo,
           ${fecha('a.ultima', 'ultima_compra')},
           ${fecha('c.fecha_registro', 'fecha_registro')}
    FROM dbo.clientes AS c
    ${RESUMEN_COMPRAS}`;

const mapear = (fila) => fila && ({
    ...fila,
    total_compras: num(fila.total_compras),
    numero_compras: num(fila.numero_compras),
    dias_compra_mes: num(fila.dias_compra_mes)
});

async function listar({ buscar = null, limite = 200, orden = 'compras' } = {}) {
    const ordenSql = orden === 'nombre' ? 'c.nombre ASC' : 'total_compras DESC, c.nombre ASC';
    const r = await db().request()
        .input('limite', sql.Int, limite)
        .input('buscar', sql.VarChar(100), buscar)
        .input('patron', sql.VarChar(110), buscar ? patronLike(buscar) : null)
        .query(`
            ${SELECT_CLIENTE.replace('SELECT', 'SELECT TOP (@limite)')}
            WHERE c.activo = 1
              AND (@buscar IS NULL OR c.nombre LIKE @patron OR c.documento LIKE @patron OR c.telefono LIKE @patron)
            ORDER BY ${ordenSql};`);
    return r.recordset.map(mapear);
}

async function buscarPorId(id, runner) {
    const r = await db(runner).request()
        .input('id', sql.Int, id)
        .query(`${SELECT_CLIENTE} WHERE c.id_cliente = @id;`);
    return mapear(r.recordset[0]) || null;
}

async function buscarPorDocumento(documento, excluirId = null) {
    const r = await db().request()
        .input('documento', sql.VarChar(20), documento)
        .input('excluir', sql.Int, excluirId)
        .query(`SELECT id_cliente, nombre, activo FROM dbo.clientes
                WHERE documento = @documento AND (@excluir IS NULL OR id_cliente <> @excluir);`);
    return r.recordset[0] || null;
}

function entradasCliente(request, datos) {
    return request
        .input('nombre', sql.VarChar(100), datos.nombre)
        .input('documento', sql.VarChar(20), datos.documento)
        .input('telefono', sql.VarChar(20), datos.telefono)
        .input('correo', sql.VarChar(100), datos.correo)
        .input('direccion', sql.VarChar(150), datos.direccion)
        .input('tipo', sql.VarChar(20), datos.tipo_cliente);
}

async function crear(datos) {
    const r = await entradasCliente(db().request(), datos).query(`
        INSERT INTO dbo.clientes (nombre, documento, telefono, correo, direccion, tipo_cliente,
                                  total_compras, numero_compras, rango, activo, fecha_registro)
        OUTPUT INSERTED.id_cliente
        VALUES (@nombre, @documento, @telefono, @correo, @direccion, @tipo, 0, 0, 'Nuevo', 1, GETDATE());`);
    return r.recordset[0].id_cliente;
}

async function actualizar(id, datos) {
    const r = await entradasCliente(db().request(), datos)
        .input('id', sql.Int, id)
        .query(`
            UPDATE dbo.clientes
            SET nombre = @nombre, documento = @documento, telefono = @telefono,
                correo = @correo, direccion = @direccion, tipo_cliente = @tipo
            WHERE id_cliente = @id AND activo = 1;`);
    return r.rowsAffected[0] > 0;
}

async function desactivar(id) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .query('UPDATE dbo.clientes SET activo = 0 WHERE id_cliente = @id AND activo = 1;');
    return r.rowsAffected[0] > 0;
}

/** Suma la compra al acumulado y recalcula el rango (dentro de la transacción de la venta). */
/** Suma la compra al acumulado guardado del cliente (dentro de la transacción de la venta). */
async function registrarCompra(id, total, runner) {
    await db(runner).request()
        .input('id', sql.Int, id)
        .input('total', sql.Decimal(12, 2), total)
        .query(`
            UPDATE dbo.clientes
            SET total_compras  = ISNULL(total_compras, 0) + @total,
                numero_compras = ISNULL(numero_compras, 0) + 1,
                ultima_compra  = GETDATE()
            WHERE id_cliente = @id;`);
}

/** Resta un reembolso del acumulado guardado del cliente. */
async function descontarCompra(id, monto, runner) {
    await db(runner).request()
        .input('id', sql.Int, id)
        .input('monto', sql.Decimal(12, 2), monto)
        .query(`
            UPDATE dbo.clientes
            SET total_compras = CASE WHEN ISNULL(total_compras, 0) - @monto < 0 THEN 0 ELSE ISNULL(total_compras, 0) - @monto END
            WHERE id_cliente = @id;`);
}

async function historialCompras(id, limite = 10) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .input('limite', sql.Int, limite)
        .query(`
            SELECT TOP (@limite) v.id_venta, ISNULL(v.numero, v.id_venta) AS numero, ${fecha('v.fecha_hora', 'fecha_hora')}, v.total, v.metodo_pago, ISNULL(v.estado, 'completada') AS estado
            FROM dbo.ventas AS v
            WHERE v.id_cliente = @id
            ORDER BY v.id_venta DESC;`);
    return r.recordset.map(f => ({ ...f, total: num(f.total) }));
}

async function estadisticas() {
    const r = await db().request().query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN c.fecha_registro >= DATEADD(DAY, -30, GETDATE()) THEN 1 ELSE 0 END) AS nuevos_30_dias,
               SUM(CASE WHEN ${FRECUENCIA} = 'Frecuente' THEN 1 ELSE 0 END) AS frecuentes,
               SUM(CASE WHEN ${FRECUENCIA} = 'Ocasional' THEN 1 ELSE 0 END) AS ocasionales,
               SUM(CASE WHEN ${FRECUENCIA} = 'Nuevo' THEN 1 ELSE 0 END)     AS nuevos
        FROM dbo.clientes AS c
        ${RESUMEN_COMPRAS}
        WHERE c.activo = 1;`);
    const f = r.recordset[0] || {};
    return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, num(v) || 0]));
}

module.exports = {
    listar,
    buscarPorId,
    buscarPorDocumento,
    crear,
    actualizar,
    desactivar,
    registrarCompra,
    descontarCompra,
    historialCompras,
    estadisticas
};

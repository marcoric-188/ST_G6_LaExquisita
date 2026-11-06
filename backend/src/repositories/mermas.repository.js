/**
 * CAPA DE ACCESO A DATOS · Repositorio de MERMAS (tabla dbo.mermas)
 */
const { sql, db, num, fecha } = require('./_base');

async function listar({ limite = 100, dias = null } = {}) {
    const r = await db().request()
        .input('limite', sql.Int, limite)
        .input('dias', sql.Int, dias)
        .query(`
            SELECT TOP (@limite) m.id_merma, m.id_insumo, COALESCE(i.nombre, 'Insumo sin registrar') AS insumo,
                   i.unidad_medida, m.cantidad, m.motivo, m.observacion, u.nombre AS usuario,
                   ${fecha('m.fecha_hora', 'fecha_hora')}
            FROM dbo.mermas AS m
            LEFT JOIN dbo.insumos  AS i ON i.id_insumo = m.id_insumo
            LEFT JOIN dbo.usuarios AS u ON u.id_usuario = m.id_usuario
            WHERE (@dias IS NULL OR m.fecha_hora >= DATEADD(DAY, -@dias, GETDATE()))
            ORDER BY m.id_merma DESC;`);
    return r.recordset.map(f => ({ ...f, cantidad: num(f.cantidad) }));
}

async function crear({ id_insumo, cantidad, motivo, observacion, id_usuario }, runner) {
    const r = await db(runner).request()
        .input('id_insumo', sql.Int, id_insumo)
        .input('cantidad', sql.Decimal(12, 3), cantidad)
        .input('motivo', sql.VarChar(255), motivo)
        .input('observacion', sql.VarChar(255), observacion)
        .input('id_usuario', sql.Int, id_usuario)
        .query(`INSERT INTO dbo.mermas (id_insumo, cantidad, motivo, observacion, fecha_hora, id_usuario)
                OUTPUT INSERTED.id_merma
                VALUES (@id_insumo, @cantidad, @motivo, @observacion, GETDATE(), @id_usuario);`);
    return r.recordset[0].id_merma;
}

/** Totales de merma por insumo en los últimos N días. */
async function resumenPorInsumo(dias = 30) {
    const r = await db().request()
        .input('dias', sql.Int, dias)
        .query(`
            SELECT i.id_insumo, i.nombre AS insumo, i.unidad_medida,
                   COUNT(*) AS registros, SUM(m.cantidad) AS cantidad
            FROM dbo.mermas AS m
            JOIN dbo.insumos AS i ON i.id_insumo = m.id_insumo
            WHERE m.fecha_hora >= DATEADD(DAY, -@dias, GETDATE())
            GROUP BY i.id_insumo, i.nombre, i.unidad_medida
            ORDER BY SUM(m.cantidad) DESC;`);
    return r.recordset.map(f => ({ ...f, cantidad: num(f.cantidad), registros: num(f.registros) }));
}

module.exports = { listar, crear, resumenPorInsumo };

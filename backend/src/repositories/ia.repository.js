/**
 * CAPA DE ACCESO A DATOS · Repositorio de la IA (tablas modelos_ia y predicciones_demanda)
 * El modelo entrenado (pesos de la red neuronal) se PERSISTE en SQL Server como JSON,
 * así no hay que volver a entrenar cada vez que se reinicia el servidor.
 */
const { sql, db, getPool, fecha } = require('./_base');

async function guardarModelo({ nombre, arquitectura, pesos, metricas, muestras, id_usuario }) {
    const transaccion = new sql.Transaction(getPool());
    await transaccion.begin();
    try {
        await transaccion.request().query('UPDATE dbo.modelos_ia SET activo = 0 WHERE activo = 1;');
        const r = await transaccion.request()
            .input('nombre', sql.VarChar(60), nombre)
            .input('arquitectura', sql.VarChar(100), arquitectura)
            .input('pesos', sql.NVarChar(sql.MAX), JSON.stringify(pesos))
            .input('metricas', sql.NVarChar(sql.MAX), JSON.stringify(metricas))
            .input('muestras', sql.Int, muestras)
            .input('id_usuario', sql.Int, id_usuario || null)
            .query(`INSERT INTO dbo.modelos_ia (nombre, arquitectura, pesos, metricas, muestras, id_usuario, activo)
                    OUTPUT INSERTED.id_modelo, ${fecha('INSERTED.fecha_entrenamiento', 'fecha_entrenamiento')}
                    VALUES (@nombre, @arquitectura, @pesos, @metricas, @muestras, @id_usuario, 1);`);
        await transaccion.commit();
        return r.recordset[0];
    } catch (error) {
        try { await transaccion.rollback(); } catch (_) { /* ya revertida */ }
        throw error;
    }
}

async function modeloActivo() {
    const r = await db().request().query(`
        SELECT TOP 1 id_modelo, nombre, arquitectura, pesos, metricas, muestras,
               ${fecha('fecha_entrenamiento', 'fecha_entrenamiento')},
               DATEDIFF(HOUR, fecha_entrenamiento, GETDATE()) AS horas
        FROM dbo.modelos_ia
        WHERE activo = 1
        ORDER BY id_modelo DESC;`);
    const f = r.recordset[0];
    if (!f) return null;
    return { ...f, pesos: JSON.parse(f.pesos), metricas: f.metricas ? JSON.parse(f.metricas) : null, horas: Number(f.horas) };
}

/** Guarda (o actualiza) el pronóstico de cada día y producto. */
async function guardarPredicciones(idModelo, predicciones) {
    for (const p of predicciones) {
        await db().request()
            .input('id_modelo', sql.Int, idModelo)
            .input('id_producto', sql.Int, p.id_producto)
            .input('fecha', sql.VarChar(10), p.fecha)
            .input('unidades', sql.Int, p.unidades)
            .query(`
                MERGE dbo.predicciones_demanda AS destino
                USING (SELECT CAST(@fecha AS DATE) AS fecha_objetivo, @id_producto AS id_producto) AS origen
                   ON destino.fecha_objetivo = origen.fecha_objetivo AND destino.id_producto = origen.id_producto
                WHEN MATCHED THEN
                    UPDATE SET unidades_predichas = @unidades, id_modelo = @id_modelo, fecha_generada = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (id_modelo, id_producto, fecha_objetivo, unidades_predichas)
                    VALUES (@id_modelo, @id_producto, origen.fecha_objetivo, @unidades);`);
    }
}

/** Compara lo que la red pronosticó con lo que de verdad se vendió (últimos N días). */
async function precisionReciente(dias = 14) {
    const r = await db().request()
        .input('dias', sql.Int, dias)
        .query(`
            SELECT CONVERT(VARCHAR(10), pd.fecha_objetivo, 23) AS fecha, pd.id_producto, pd.unidades_predichas,
                   ISNULL((SELECT SUM(COALESCE(d.unidades, d.cantidad))
                           FROM dbo.ventas AS v JOIN dbo.detalle_ventas AS d ON d.id_venta = v.id_venta
                           WHERE d.id_producto = pd.id_producto
                             AND v.fecha_hora >= pd.fecha_objetivo
                             AND v.fecha_hora < DATEADD(DAY, 1, pd.fecha_objetivo)), 0) AS unidades_reales
            FROM dbo.predicciones_demanda AS pd
            WHERE pd.fecha_objetivo < CAST(GETDATE() AS DATE)
              AND pd.fecha_objetivo >= DATEADD(DAY, -@dias, CAST(GETDATE() AS DATE))
            ORDER BY pd.fecha_objetivo;`);
    return r.recordset.map(f => ({ ...f, unidades_predichas: Number(f.unidades_predichas), unidades_reales: Number(f.unidades_reales) }));
}

module.exports = { guardarModelo, modeloActivo, guardarPredicciones, precisionReciente };

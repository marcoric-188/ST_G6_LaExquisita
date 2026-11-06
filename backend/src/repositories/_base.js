/**
 * CAPA DE ACCESO A DATOS · Utilidades comunes de los repositorios
 *
 * Reglas de esta capa:
 *  - Es la ÚNICA que escribe SQL.
 *  - SIEMPRE usa parámetros (@nombre) -> protege contra inyección SQL.
 *  - Recibe opcionalmente una transacción (runner) para que el servicio pueda
 *    agrupar varias operaciones en una sola transacción.
 *  - Convierte los DECIMAL a número (el driver de Windows los entrega como texto).
 */
const { sql, getPool } = require('../config/database');

/** Usa la transacción recibida o el pool general. */
const db = (runner) => runner || getPool();

/** DECIMAL/BIGINT -> Number (null se mantiene). */
const num = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** Escapa comodines de LIKE para que el texto del usuario se busque literal. */
const patronLike = (texto) => `%${String(texto).replace(/[%_[]/g, (c) => `[${c}]`)}%`;

/** Fecha SQL -> 'AAAA-MM-DDTHH:mm:ss' (hora local del servidor, sin conversión UTC). */
const fecha = (columna, alias) => `CONVERT(VARCHAR(19), ${columna}, 126) AS ${alias}`;

/** Periodos usados en reportes e IA (hoy, ayer, últimos 7 días, últimos 30 días, histórico). */
const CTE_PERIODOS = `
    periodos AS (
        SELECT 'hoy' AS periodo, CAST(CAST(GETDATE() AS DATE) AS DATETIME) AS desde, CAST(DATEADD(DAY, 1, CAST(GETDATE() AS DATE)) AS DATETIME) AS hasta
        UNION ALL SELECT 'ayer',   CAST(DATEADD(DAY, -1, CAST(GETDATE() AS DATE)) AS DATETIME),  CAST(CAST(GETDATE() AS DATE) AS DATETIME)
        UNION ALL SELECT 'semana', CAST(DATEADD(DAY, -6, CAST(GETDATE() AS DATE)) AS DATETIME),  CAST(DATEADD(DAY, 1, CAST(GETDATE() AS DATE)) AS DATETIME)
        UNION ALL SELECT 'mes',    CAST(DATEADD(DAY, -29, CAST(GETDATE() AS DATE)) AS DATETIME), CAST(DATEADD(DAY, 1, CAST(GETDATE() AS DATE)) AS DATETIME)
        UNION ALL SELECT 'total',  CAST('19000101' AS DATETIME), CAST('99991231' AS DATETIME)
    )`;

/** Expresión de unidades (arepas) de una línea de detalle. */
const UNIDADES_LINEA = `COALESCE(d.unidades, CASE WHEN d.modalidad = 'unidad' THEN d.cantidad ELSE d.cantidad * p.unidades_por_paquete END)`;

module.exports = { sql, db, num, patronLike, fecha, CTE_PERIODOS, UNIDADES_LINEA };

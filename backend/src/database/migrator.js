/**
 * ============================================================================
 *  CAPA DE ACCESO A DATOS · Migrador
 * ----------------------------------------------------------------------------
 *  Ejecuta database/schema.sql y database/seed.sql al arrancar el backend.
 *  Ambos scripts son idempotentes: crean lo que falta y no borran datos.
 *
 *  Cómo funciona:
 *    1. Divide cada script en lotes usando las líneas "GO" (igual que SSMS).
 *    2. Los lotes anteriores al "USE la_exquisita_db" se ejecutan en "master"
 *       (ahí se crea la base si no existe).
 *    3. Desde el "USE" en adelante, se ejecutan conectados a la base del negocio.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const CARPETA_SQL = path.join(__dirname, '..', '..', '..', 'database');
const SCRIPTS = ['schema.sql', 'seed.sql'];

function dividirEnLotes(texto) {
    return texto
        .replace(/^﻿/, '')
        .split(/^\s*GO\s*;?\s*$/im)
        .map(lote => lote.trim())
        .filter(lote => lote.length > 0);
}

async function migrar({ abrirPool }) {
    const inicio = Date.now();
    let master = null;
    let base = null;
    let lotes = 0;

    try {
        master = await abrirPool('master', { max: 1 });

        for (const archivo of SCRIPTS) {
            const ruta = path.join(CARPETA_SQL, archivo);
            if (!fs.existsSync(ruta)) throw new Error(`No se encontró ${ruta}`);

            // Permite usar otro nombre de base (DB_NAME) sin editar los scripts.
            const texto = fs.readFileSync(ruta, 'utf8').replace(/\bla_exquisita_db\b/g, env.db.database);
            let actual = master;

            for (const lote of dividirEnLotes(texto)) {
                if (/^USE\s+\[?\w+\]?\s*;?$/i.test(lote)) {
                    if (!base) base = await abrirPool(env.db.database, { max: 1 });
                    actual = base;
                    continue;
                }
                try {
                    await actual.request().batch(lote);
                    lotes++;
                } catch (error) {
                    const linea = lote.split('\n').find(l => l.trim() && !l.trim().startsWith('--') && !l.trim().startsWith('/*')) || '';
                    error.message = `[${archivo}] ${error.message} (lote: "${linea.trim().slice(0, 90)}")`;
                    throw error;
                }
            }
        }

        const resultado = { ok: true, lotes, ms: Date.now() - inicio, fecha: new Date().toISOString() };
        console.log(`🛠️  Migración de base de datos aplicada (${lotes} lotes en ${resultado.ms} ms)`);
        return resultado;
    } finally {
        if (base) await base.close().catch(() => {});
        if (master) await master.close().catch(() => {});
    }
}

module.exports = { migrar, dividirEnLotes };

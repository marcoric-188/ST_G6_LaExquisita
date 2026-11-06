/**
 * Ejecuta manualmente database/schema.sql + database/seed.sql
 * Uso:  npm run migrar
 */
const database = require('../src/config/database');
const { migrar } = require('../src/database/migrator');

migrar({ abrirPool: database.abrirPool })
    .then((r) => {
        console.log(`✅ Base de datos lista (${r.lotes} lotes, ${r.ms} ms).`);
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error en la migración:', error.message);
        process.exit(1);
    });

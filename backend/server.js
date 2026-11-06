/**
 * ============================================================================
 *  LA EXQUISITA · Punto de arranque del backend
 * ----------------------------------------------------------------------------
 *  1. Carga la configuración (.env)
 *  2. Levanta el servidor web (API + frontend) en http://localhost:PORT
 *  3. Conecta a SQL Server, aplica la migración y reintenta si falla
 *     (el servidor NO se cae si la base de datos está apagada).
 * ============================================================================
 */
const env = require('./src/config/env');
const database = require('./src/config/database');
const { crearApp } = require('./src/app');

const app = crearApp();

const servidor = app.listen(env.port, () => {
    console.log('');
    console.log('🌽  La Exquisita · POS & ERP');
    console.log(`🚀  Abre en el navegador: http://localhost:${env.port}`);
    console.log(`🔐  Autenticación BD: ${env.db.auth === 'windows' ? 'Windows (msnodesqlv8)' : 'SQL Server (usuario/contraseña)'}`);
    if (env.auth.jwtSecretGenerado) {
        console.log('⚠️   JWT_SECRET no está en .env: se generó uno temporal (las sesiones se cierran al reiniciar).');
    }
    console.log('');
});

database.iniciar();

process.on('unhandledRejection', (error) => {
    console.error('⚠️  Promesa rechazada sin manejar:', error);
});

function apagar() {
    console.log('\nCerrando servidor...');
    servidor.close(() => database.cerrar().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

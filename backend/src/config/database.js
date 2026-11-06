/**
 * ============================================================================
 *  CAPA DE ACCESO A DATOS · Conexión a SQL Server
 * ----------------------------------------------------------------------------
 *  Crea y mantiene el pool de conexiones. Lo usan SOLO los repositorios.
 *
 *  DB_AUTH=windows (por defecto)  -> msnodesqlv8 + ODBC con Trusted_Connection.
 *      Si no se define DB_ODBC_DRIVER, prueba en orden los drivers ODBC que
 *      suelen estar instalados en Windows (18, 17, Native Client, SQL Server).
 *  DB_AUTH=sql                    -> tedious con usuario y contraseña.
 *
 *  Si SQL Server no responde, el servidor web NO se cae: sigue sirviendo la
 *  interfaz, informa el error en /api/health y reintenta cada N segundos.
 * ============================================================================
 */
const env = require('./env');

let sql;
let errorDriver = null;
if (env.db.auth === 'windows') {
    try {
        sql = require('mssql/msnodesqlv8');
    } catch (error) {
        errorDriver = error;
        sql = require('mssql');
    }
} else {
    sql = require('mssql');
}

const DRIVERS_ODBC = [
    'ODBC Driver 18 for SQL Server',
    'ODBC Driver 17 for SQL Server',
    'SQL Server Native Client 11.0',
    'SQL Server'
];

const estado = {
    conectada: false,
    conectando: false,
    driver: null,
    ultimoError: null,
    sugerencia: null,
    migracion: null,
    desde: null
};

let pool = null;
let timerReintento = null;
const alConectar = [];

function nombreServidor({ odbc } = { odbc: false }) {
    const { server, instance, port } = env.db;
    if (instance) return `${server}\\${instance}`;
    if (port) return odbc ? `${server},${port}` : server;
    return server;
}

function configWindows(driver, database) {
    const partes = [
        `Driver={${driver}}`,
        `Server=${nombreServidor({ odbc: true })}`,
        `Database=${database}`,
        'Trusted_Connection=yes'
    ];
    if (/ODBC Driver 1[78]/.test(driver)) {
        partes.push(`Encrypt=${env.db.encrypt ? 'yes' : 'no'}`);
        partes.push(`TrustServerCertificate=${env.db.trustServerCertificate ? 'yes' : 'no'}`);
    }
    return {
        connectionString: partes.join(';') + ';',
        connectionTimeout: 10000,
        requestTimeout: 30000,
        options: { useUTC: false },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };
}

function configSql(database) {
    if (!env.db.user) {
        throw new Error('Con DB_AUTH=sql debes definir DB_USER y DB_PASSWORD en backend/.env');
    }
    return {
        server: env.db.server,
        port: env.db.instance ? undefined : env.db.port,
        database,
        user: env.db.user,
        password: env.db.password,
        connectionTimeout: 10000,
        requestTimeout: 30000,
        options: {
            instanceName: env.db.instance || undefined,
            encrypt: env.db.encrypt,
            trustServerCertificate: env.db.trustServerCertificate,
            useUTC: false,
            enableArithAbort: true
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };
}

/** Explica en español los errores de conexión más comunes. */
function sugerirSolucion(error) {
    const msg = `${error && error.message || error} ${error && error.code || ''}`;
    if (errorDriver || /Cannot find module 'msnodesqlv8'/i.test(msg)) {
        return 'Falta el paquete msnodesqlv8 (autenticación de Windows). Ejecuta "npm install" dentro de la carpeta backend, o usa DB_AUTH=sql con usuario y contraseña.';
    }
    if (/IM002|Data source name not found|no default driver/i.test(msg)) {
        return 'No se encontró el driver ODBC. Instala "ODBC Driver 18 for SQL Server" de Microsoft o define DB_ODBC_DRIVER en backend/.env con el driver que tengas.';
    }
    if (/Login failed|Error de inicio de sesi/i.test(msg)) {
        return 'SQL Server rechazó el usuario. Con DB_AUTH=windows tu usuario de Windows debe tener acceso a la instancia; con DB_AUTH=sql revisa DB_USER y DB_PASSWORD.';
    }
    if (/Cannot open database|No se puede abrir la base de datos/i.test(msg)) {
        return `La base ${env.db.database} no existe o no tienes permiso. Deja DB_AUTO_MIGRATE=true o ejecuta database/schema.sql en SSMS.`;
    }
    if (/server was not found|not accessible|Named Pipes|ETIMEOUT|ESOCKET|ECONNREFUSED|ECONNCLOSED|Failed to connect|Could not connect|timeout|instance/i.test(msg)) {
        return `No se encontró el servidor "${nombreServidor()}". Verifica que el servicio SQL Server (${env.db.instance || 'MSSQLSERVER'}) esté iniciado, que DB_SERVER/DB_INSTANCE sean correctos y, si usas instancia con nombre, que el servicio "SQL Server Browser" esté activo.`;
    }
    return 'Revisa la configuración de backend/.env (DB_SERVER, DB_INSTANCE, DB_NAME, DB_AUTH).';
}

/** Abre un pool. Con autenticación de Windows prueba varios drivers ODBC. */
async function abrirPool(database, opciones = {}) {
    if (env.db.auth === 'windows') {
        if (errorDriver) throw errorDriver;
        const candidatos = env.db.odbcDriver ? [env.db.odbcDriver] : (estado.driver ? [estado.driver] : DRIVERS_ODBC);
        let ultimoError;
        for (const driver of candidatos) {
            try {
                const cfg = configWindows(driver, database);
                if (opciones.max) cfg.pool = { max: opciones.max, min: 0 };
                const nuevo = await new sql.ConnectionPool(cfg).connect();
                estado.driver = driver;
                return nuevo;
            } catch (error) {
                ultimoError = error;
                // Si el driver existe pero falla por otra razón (login, servidor), no seguir probando.
                if (!/IM002|Data source name not found|no default driver|specified driver could not be loaded|nombre del origen de datos|Can't open lib/i.test(error.message)) break;
            }
        }
        throw ultimoError;
    }
    const cfg = configSql(database);
    if (opciones.max) cfg.pool = { max: opciones.max, min: 0 };
    const nuevo = await new sql.ConnectionPool(cfg).connect();
    estado.driver = 'tedious (usuario SQL)';
    return nuevo;
}

/** Conecta, migra (si está activo) y deja el pool listo. Reintenta si falla. */
async function iniciar() {
    if (estado.conectando || estado.conectada) return;
    estado.conectando = true;
    clearTimeout(timerReintento);
    try {
        if (env.db.autoMigrate && !(estado.migracion && estado.migracion.ok)) {
            const { migrar } = require('../database/migrator');
            try {
                estado.migracion = await migrar({ abrirPool });
            } catch (error) {
                // Si el servidor ni siquiera responde, se reintenta todo más tarde.
                if (/ETIMEOUT|ESOCKET|ECONNREFUSED|Failed to connect|Could not connect|IM002|Login failed|not found|msnodesqlv8/i.test(`${error.message} ${error.code || ''}`)) throw error;
                // Si falla un script, se informa pero se intenta trabajar con la base existente.
                estado.migracion = { ok: false, error: error.message, fecha: new Date().toISOString() };
                console.error('⚠️  La migración automática falló:', error.message);
                console.error('   Puedes ejecutar database/schema.sql y database/seed.sql manualmente en SSMS.');
            }
        }
        pool = await abrirPool(env.db.database);
        pool.on('error', (error) => {
            console.error('⚠️  Error en el pool de SQL Server:', error.message);
        });
        estado.conectada = true;
        estado.ultimoError = null;
        estado.sugerencia = null;
        estado.desde = new Date().toISOString();
        console.log(`✅ Conectado a SQL Server · ${nombreServidor()} · base ${env.db.database} · ${estado.driver}`);
        for (const fn of alConectar) {
            try { await fn(pool); } catch (error) { console.error('⚠️ ', error.message); }
        }
    } catch (error) {
        estado.conectada = false;
        estado.ultimoError = error.message;
        estado.sugerencia = sugerirSolucion(error);
        console.error(`❌ No fue posible conectar con SQL Server: ${error.message}`);
        console.error(`   👉 ${estado.sugerencia}`);
        console.error(`   Reintentando en ${env.db.reintentoSegundos} s...`);
        timerReintento = setTimeout(iniciar, env.db.reintentoSegundos * 1000);
        timerReintento.unref();
    } finally {
        estado.conectando = false;
    }
}

/** Devuelve el pool o lanza un error 503 claro (lo traduce el manejador de errores). */
function getPool() {
    if (!pool || !estado.conectada) {
        const error = new Error('No hay conexión con la base de datos.');
        error.status = 503;
        error.publico = true;
        error.detalles = { sugerencia: estado.sugerencia || 'El servidor está intentando conectarse a SQL Server.' };
        throw error;
    }
    return pool;
}

/**
 * Ejecuta varias operaciones en UNA transacción: o se guardan todas o ninguna.
 * Ej.: venta + detalle + descuento de stock + kardex + acumulado del cliente.
 */
async function withTransaction(trabajo) {
    const transaccion = new sql.Transaction(getPool());
    await transaccion.begin();
    try {
        const resultado = await trabajo(transaccion);
        await transaccion.commit();
        return resultado;
    } catch (error) {
        try { await transaccion.rollback(); } catch (_) { /* ya revertida */ }
        throw error;
    }
}

/** Comprueba en vivo que SQL Server responda (lo usa /api/health). */
async function ping() {
    if (!pool || !estado.conectada) return false;
    try {
        await pool.request().query('SELECT 1 AS ok;');
        if (estado.ultimoError) { estado.ultimoError = null; estado.sugerencia = null; }
        return true;
    } catch (error) {
        estado.ultimoError = error.message;
        estado.sugerencia = sugerirSolucion(error);
        return false;
    }
}

async function cerrar() {
    clearTimeout(timerReintento);
    if (pool) await pool.close();
    pool = null;
    estado.conectada = false;
}

module.exports = {
    sql,
    iniciar,
    cerrar,
    getPool,
    withTransaction,
    abrirPool,
    ping,
    alConectar: (fn) => alConectar.push(fn),
    estado: () => ({ ...estado, servidor: nombreServidor(), base: env.db.database, auth: env.db.auth })
};

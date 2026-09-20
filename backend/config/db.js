const sql = require('mssql/msnodesqlv8');

const config = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost\\SQL2025;Database=la_exquisita_db;Trusted_Connection=yes;'
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ ¡Conexión exitosa a SQL Server (la_exquisita_db)!');
        return pool;
    })
    .catch(err => {
        console.error('❌ Error al conectar con SQL Server:', err.message);
    });

module.exports = { sql, poolPromise };
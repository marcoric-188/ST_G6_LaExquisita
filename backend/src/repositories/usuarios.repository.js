/**
 * CAPA DE ACCESO A DATOS · Repositorio de USUARIOS (tabla dbo.usuarios)
 */
const { sql, db } = require('./_base');

const COLUMNAS = `
    id_usuario, nombre, correo, rol, activo, debe_cambiar_password, intentos_fallidos,
    CASE WHEN bloqueado_hasta > GETDATE() THEN DATEDIFF(SECOND, GETDATE(), bloqueado_hasta) ELSE 0 END AS segundos_bloqueo`;

async function buscarPorCorreo(correo) {
    const r = await db().request()
        .input('correo', sql.VarChar(100), correo)
        .query(`SELECT ${COLUMNAS}, password_hash FROM dbo.usuarios WHERE correo = @correo;`);
    return r.recordset[0] || null;
}

async function buscarPorId(id) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .query(`SELECT ${COLUMNAS} FROM dbo.usuarios WHERE id_usuario = @id;`);
    return r.recordset[0] || null;
}

async function obtenerHash(id) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .query('SELECT password_hash FROM dbo.usuarios WHERE id_usuario = @id;');
    return r.recordset[0] ? r.recordset[0].password_hash : null;
}

/** Suma un intento fallido; al llegar al máximo bloquea la cuenta N minutos. */
async function registrarIntentoFallido(id, maxIntentos, minutosBloqueo) {
    const r = await db().request()
        .input('id', sql.Int, id)
        .input('max', sql.Int, maxIntentos)
        .input('minutos', sql.Int, minutosBloqueo)
        .query(`
            UPDATE dbo.usuarios
            SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= @max THEN 0 ELSE intentos_fallidos + 1 END,
                bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= @max THEN DATEADD(MINUTE, @minutos, GETDATE()) ELSE bloqueado_hasta END
            OUTPUT INSERTED.intentos_fallidos,
                   CASE WHEN INSERTED.bloqueado_hasta > GETDATE() THEN 1 ELSE 0 END AS bloqueado
            WHERE id_usuario = @id;`);
    return r.recordset[0];
}

async function registrarAccesoExitoso(id) {
    await db().request()
        .input('id', sql.Int, id)
        .query(`UPDATE dbo.usuarios
                SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = GETDATE()
                WHERE id_usuario = @id;`);
}

async function actualizarPassword(id, hash, debeCambiar = false) {
    await db().request()
        .input('id', sql.Int, id)
        .input('hash', sql.VarChar(100), hash)
        .input('cambiar', sql.Bit, debeCambiar)
        .query('UPDATE dbo.usuarios SET password_hash = @hash, debe_cambiar_password = @cambiar WHERE id_usuario = @id;');
}

async function crear({ nombre, correo, rol, hash, debeCambiar = true }) {
    const r = await db().request()
        .input('nombre', sql.VarChar(100), nombre)
        .input('correo', sql.VarChar(100), correo)
        .input('rol', sql.VarChar(20), rol)
        .input('hash', sql.VarChar(100), hash)
        .input('cambiar', sql.Bit, debeCambiar)
        .query(`INSERT INTO dbo.usuarios (nombre, correo, rol, password_hash, debe_cambiar_password)
                OUTPUT INSERTED.id_usuario
                VALUES (@nombre, @correo, @rol, @hash, @cambiar);`);
    return r.recordset[0].id_usuario;
}

async function actualizarDatos(id, { nombre, rol }) {
    await db().request()
        .input('id', sql.Int, id)
        .input('nombre', sql.VarChar(100), nombre)
        .input('rol', sql.VarChar(20), rol)
        .query('UPDATE dbo.usuarios SET nombre = @nombre, rol = @rol, activo = 1 WHERE id_usuario = @id;');
}

module.exports = {
    buscarPorCorreo,
    buscarPorId,
    obtenerHash,
    registrarIntentoFallido,
    registrarAccesoExitoso,
    actualizarPassword,
    crear,
    actualizarDatos
};

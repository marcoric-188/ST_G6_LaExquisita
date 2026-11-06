/**
 * Crea (o actualiza) un usuario del sistema con contraseña segura (bcrypt).
 *
 * Uso:
 *   npm run crear-usuario -- --nombre "Ana Pérez" --correo ana@laexquisita.com --rol cajero --password "Clave2026"
 *
 * Roles: administrador | cajero | cocina
 * El usuario deberá cambiar la contraseña en su primer inicio de sesión.
 */
const database = require('../src/config/database');
const usuariosRepo = require('../src/repositories/usuarios.repository');
const { validarPolitica, hashPassword } = require('../src/services/auth.service');
const { validar } = require('../src/utils/validator');

function leerArgumentos() {
    const args = {};
    const lista = process.argv.slice(2);
    for (let i = 0; i < lista.length; i++) {
        if (lista[i].startsWith('--')) args[lista[i].slice(2)] = lista[i + 1];
    }
    return args;
}

(async () => {
    try {
        const datos = validar(leerArgumentos(), {
            nombre: { tipo: 'texto', requerido: true, min: 3, max: 100, etiqueta: '--nombre' },
            correo: { tipo: 'correo', requerido: true, etiqueta: '--correo' },
            rol: { tipo: 'enum', requerido: true, valores: ['administrador', 'cajero', 'cocina'], etiqueta: '--rol' },
            password: { tipo: 'password', requerido: true, etiqueta: '--password' }
        });
        validarPolitica(datos.password);

        await database.iniciar();
        database.getPool();

        const hash = await hashPassword(datos.password);
        const existente = await usuariosRepo.buscarPorCorreo(datos.correo);
        if (existente) {
            await usuariosRepo.actualizarDatos(existente.id_usuario, datos);
            await usuariosRepo.actualizarPassword(existente.id_usuario, hash, true);
            console.log(`✅ Usuario actualizado: ${datos.correo} (${datos.rol})`);
        } else {
            await usuariosRepo.crear({ ...datos, hash, debeCambiar: true });
            console.log(`✅ Usuario creado: ${datos.correo} (${datos.rol})`);
        }
        await database.cerrar();
        process.exit(0);
    } catch (error) {
        console.error('❌', error.message);
        process.exit(1);
    }
})();

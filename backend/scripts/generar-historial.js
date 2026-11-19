/**
 * Genera un HISTORIAL DE VENTAS DE PRÁCTICA para entrenar y demostrar la red neuronal.
 *
 *   npm run historial-demo                 -> 90 días de ventas simuladas
 *   npm run historial-demo -- --dias 60    -> otra cantidad de días
 *   npm run historial-demo -- --borrar     -> elimina SOLO las ventas de práctica
 *
 * Las ventas quedan con origen = 'demo' (las reales son 'pos'), así se distinguen
 * y se pueden borrar sin tocar nada real. No descuentan inventario: es historia pasada.
 * Patrón simulado: más ventas los fines de semana, leve crecimiento y ruido aleatorio.
 */
const database = require('../src/config/database');
const { sql, getPool } = database;
const productosRepo = require('../src/repositories/productos.repository');
const clientesRepo = require('../src/repositories/clientes.repository');
const ventasRepo = require('../src/repositories/ventas.repository');
const { generadorAleatorio } = require('../src/services/ia/redNeuronal');

const args = process.argv.slice(2);
const borrar = args.includes('--borrar');
const dias = Number(args[args.indexOf('--dias') + 1]) || 90;
const aleatorio = generadorAleatorio(2026);
const entre = (min, max) => Math.floor(min + aleatorio() * (max - min + 1));

// Arepas promedio por día de la semana (domingo..sábado)
const FACTOR_DIA = [1.45, 0.8, 0.85, 0.9, 1.0, 1.25, 1.6];

async function borrarDemo() {
    const pool = getPool();
    const r = await pool.request().query(`
        DELETE dd FROM dbo.detalle_devoluciones AS dd
        JOIN dbo.devoluciones AS dv ON dv.id_devolucion = dd.id_devolucion
        JOIN dbo.ventas AS v ON v.id_venta = dv.id_venta WHERE v.origen = 'demo';
        DELETE dv FROM dbo.devoluciones AS dv JOIN dbo.ventas AS v ON v.id_venta = dv.id_venta WHERE v.origen = 'demo';
        DELETE FROM dbo.ventas WHERE origen = 'demo';
        SELECT @@ROWCOUNT AS borradas;`);
    await pool.request().query('UPDATE dbo.modelos_ia SET activo = 0 WHERE activo = 1;');
    console.log(`Ventas de práctica eliminadas: ${r.recordset[0].borradas}. La red neuronal se reentrenará con los datos reales.`);
}

async function generar() {
    const productos = (await productosRepo.listarActivos()).filter(p => p.precio);
    const clientes = await clientesRepo.listar({ limite: 50 });
    if (!productos.length || !clientes.length) throw new Error('Se necesitan productos y clientes activos.');
    const usuario = (await getPool().request().query("SELECT TOP 1 id_usuario FROM dbo.usuarios WHERE rol = 'administrador' ORDER BY id_usuario")).recordset[0];

    let ventas = 0;
    const hoy = new Date();
    for (let d = dias; d >= 1; d--) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - d);
        const crecimiento = 1 + (dias - d) / dias * 0.25;
        // Arepas que "pide" el día por producto: base x día de la semana x crecimiento x ±12 % de variación
        const pendientes = productos.map((p, k) => ({
            p,
            arepas: Math.round((k === 0 ? 48 : 34) * FACTOR_DIA[fecha.getDay()] * crecimiento * (0.88 + aleatorio() * 0.24))
        }));

        const tx = new sql.Transaction(getPool());
        await tx.begin();
        try {
            while (pendientes.some(x => x.arepas > 0)) {
                const cliente = clientes[entre(0, clientes.length - 1)];
                const lineas = [];
                for (const item of pendientes) {
                    if (item.arepas <= 0 || aleatorio() < 0.35) continue;
                    const p = item.p;
                    const upp = p.unidades_por_paquete;
                    const porUnidad = p.precio_unidad && (item.arepas < upp || aleatorio() < 0.25);
                    const cantidad = porUnidad ? Math.min(item.arepas, entre(2, 8)) : Math.min(Math.floor(item.arepas / upp), entre(1, 3));
                    if (cantidad <= 0) continue;
                    const unidades = porUnidad ? cantidad : cantidad * upp;
                    item.arepas -= unidades;
                    const precio = porUnidad ? p.precio_unidad : p.precio;
                    lineas.push({ id_producto: p.id_producto, modalidad: porUnidad ? 'unidad' : 'paquete', cantidad, unidades, precio_unitario: precio, subtotal: precio * cantidad });
                }
                if (!lineas.length) continue;
                const hora = `${String(entre(7, 19)).padStart(2, '0')}:${String(entre(0, 59)).padStart(2, '0')}:00`;
                const f = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}T${hora}`;
                const venta = await ventasRepo.crear({
                    total: lineas.reduce((a, l) => a + l.subtotal, 0),
                    metodo_pago: aleatorio() < 0.55 ? 'efectivo' : 'transferencia',
                    id_usuario: usuario.id_usuario, id_cliente: cliente.id_cliente,
                    estado: 'completada', origen: 'demo', fecha_hora: f
                }, tx);
                for (const l of lineas) await ventasRepo.crearDetalle({ id_venta: venta.id_venta, ...l }, tx);
                ventas++;
            }
            await tx.commit();
        } catch (error) {
            await tx.rollback();
            throw error;
        }
    }
    await getPool().request().query('UPDATE dbo.modelos_ia SET activo = 0 WHERE activo = 1;');
    console.log(`Historial de práctica creado: ${ventas} ventas en ${dias} días (origen = 'demo').`);
    console.log('Abre el Inicio o pregúntale a la IA "¿cuántas arepas preparo mañana?" para que la red neuronal se entrene.');
}

(async () => {
    try {
        await database.iniciar();
        database.getPool();
        if (borrar) await borrarDemo();
        else await generar();
        await database.cerrar();
        process.exit(0);
    } catch (error) {
        console.error('', error.message);
        process.exit(1);
    }
})();

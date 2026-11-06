const express = require('express');
const cors = require('cors');
const { poolPromise, sql } = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. Estado del servidor
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor Backend La Exquisita activo' });
});

// 2. Insumos (Inventario)
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM insumos');
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Clientes (Directorio y Rangos)
app.get('/api/clientes', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM clientes ORDER BY total_compras DESC');
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/clientes', async (req, res) => {
    const { nombre, telefono, correo } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('nombre', sql.VarChar, nombre)
            .input('telefono', sql.VarChar, telefono)
            .input('correo', sql.VarChar, correo)
            .query('INSERT INTO clientes (nombre, telefono, correo, total_compras, rango) VALUES (@nombre, @telefono, @correo, 0, \'Nuevo\')');
        res.json({ success: true, message: 'Cliente registrado con éxito' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Mermas
app.get('/api/mermas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM mermas ORDER BY id_merma DESC');
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/mermas', async (req, res) => {
    const { descripcion, cantidad, motivo } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('descripcion', sql.VarChar, descripcion)
            .input('cantidad', sql.Decimal(10,2), cantidad)
            .input('motivo', sql.VarChar, motivo)
            .query('INSERT INTO mermas (descripcion, cantidad, motivo, fecha) VALUES (@descripcion, @cantidad, @motivo, GETDATE())');
        res.json({ success: true, message: 'Merma registrada correctamente' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Historial de Ventas
app.get('/api/ventas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM ventas ORDER BY id_venta DESC');
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Registrar Venta POS con Transacción SQL y Descuento de Stock Real
app.post('/api/ventas', async (req, res) => {
    const { items, metodo_pago = 'Efectivo', id_cliente = null } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'El carrito está vacío.' });
    }

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        let totalCalculado = items.reduce((acc, item) => acc + (item.precio * (item.cantidad || 1)), 0);

        // Registrar Venta
        const ventaRequest = new sql.Request(transaction);
        ventaRequest.input('total', sql.Decimal(10, 2), totalCalculado);
        ventaRequest.input('metodo_pago', sql.VarChar(50), metodo_pago);
        
        const ventaResult = await ventaRequest.query(`
            INSERT INTO ventas (total, fecha_hora, metodo_pago) 
            OUTPUT INSERTED.id_venta 
            VALUES (@total, GETDATE(), @metodo_pago);
        `);
        const idVenta = ventaResult.recordset[0].id_venta;

        // Registrar Detalle y Descontar Stock de Insumos automáticamente
        for (const item of items) {
            const cantidad = item.cantidad || 1;
            const subtotal = item.precio * cantidad;

            const detalleRequest = new sql.Request(transaction);
            detalleRequest.input('id_venta', sql.Int, idVenta);
            detalleRequest.input('nombre_producto', sql.VarChar(100), item.nombre);
            detalleRequest.input('cantidad', sql.Int, cantidad);
            detalleRequest.input('subtotal', sql.Decimal(10, 2), subtotal);

            await detalleRequest.query(`
                INSERT INTO detalle_ventas (id_venta, nombre_producto, cantidad, subtotal) 
                VALUES (@id_venta, @nombre_producto, @cantidad, @subtotal);
            `);

            // Descontar inventario base según insumos genéricos (Ejemplo: Maíz / Queso)
            const stockRequest = new sql.Request(transaction);
            stockRequest.input('cant_descuento', sql.Decimal(10,2), cantidad * 0.5); // 0.5 KG por paquete
            await stockRequest.query(`
                UPDATE insumos SET stock_actual = CASE WHEN stock_actual >= @cant_descuento THEN stock_actual - @cant_descuento ELSE 0 END
                WHERE nombre LIKE '%Maíz%' OR nombre LIKE '%Queso%';
            `);
        }

        // Si hay cliente seleccionado, actualizar su acumulado y rango automático
        if (id_cliente) {
            const clienteReq = new sql.Request(transaction);
            clienteReq.input('id_c', sql.Int, id_cliente);
            clienteReq.input('tot', sql.Decimal(10,2), totalCalculado);
            await clienteReq.query(`
                UPDATE clientes 
                SET total_compras = total_compras + @tot,
                    rango = CASE 
                        WHEN (total_compras + @tot) > 200000 THEN 'VIP / Platino'
                        WHEN (total_compras + @tot) > 100000 THEN 'Frecuente'
                        ELSE 'Regular'
                    END
                WHERE id_cliente = @id_c;
            `);
        }

        await transaction.commit();
        res.json({ success: true, message: 'Venta procesada y stock descontado con éxito', id_venta: idVenta });

    } catch (error) {
        await transaction.rollback();
        res.status(500).json({ success: false, error: 'Error en transacción: ' + error.message });
    }
});

// 7. Nueva IA Alimentada Directamente con la Base de Datos
app.post('/api/chatbot/query', async (req, res) => {
    const { mensaje } = req.body;
    try {
        const pool = await poolPromise;
        const msgLower = mensaje.toLowerCase();

        if (msgLower.includes('stock') || msgLower.includes('inventario') || msgLower.includes('cuántos') || msgLower.includes('insumo')) {
            const insumos = await pool.request().query('SELECT nombre, stock_actual, unidad_medida FROM insumos');
            let respuesta = "📊 **Estado actual del inventario en SQL Server:**\n";
            insumos.recordset.forEach(i => {
                respuesta += `- **${i.nombre}**: ${i.stock_actual} ${i.unidad_medida}\n`;
            });
            return res.json({ success: true, respuesta });
        }

        if (msgLower.includes('venta') || msgLower.includes('total') || msgLower.includes('facturado')) {
            const ventas = await pool.request().query('SELECT COUNT(*) as total_v, SUM(total) as suma_t FROM ventas');
            const v = ventas.recordset[0];
            return res.json({ success: true, respuesta: `💰 Se han registrado **${v.total_v || 0} ventas** en el sistema para un acumulado total de **$${(v.suma_t || 0).toLocaleString()}**.` });
        }

        if (msgLower.includes('cliente') || msgLower.includes('comprador')) {
            const clientes = await pool.request().query('SELECT TOP 5 nombre, rango, total_compras FROM clientes ORDER BY total_compras DESC');
            let respuesta = "👥 **Top Clientes Registrados:**\n";
            if(clientes.recordset.length === 0) respuesta = "No hay clientes registrados todavía en el sistema.";
            clientes.recordset.forEach(c => {
                respuesta += `- **${c.nombre}** (${c.rango}) - Compras: $${c.total_compras.toLocaleString()}\n`;
            });
            return res.json({ success: true, respuesta });
        }

        res.json({ 
            success: true, 
            respuesta: `🤖 Analizando consulta sobre "${mensaje}": El ERP de La Exquisita opera con normalidad conectado a SQL Server. Puedes preguntarme por "inventario", "ventas" o "clientes".` 
        });

    } catch (error) {
        res.status(500).json({ success: false, respuesta: 'Error consultando la base de datos para la IA: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
const express = require('express');
const cors = require('cors');
const { poolPromise, sql } = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint 1: Estado de salud del servidor
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Servidor Backend de La Exquisita en ejecución',
        timestamp: new Date()
    });
});

// Endpoint 2: Prueba de conexión real consultando los insumos de la BD
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM insumos');
        res.json({
            success: true,
            total_insumos: result.recordset.length,
            data: result.recordset
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint 3: Consultar el Historial de Ventas (Para el nuevo módulo de Consulta de Ventas)
app.get('/api/ventas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM ventas ORDER BY id_venta DESC');
        res.json({
            success: true,
            total_ventas: result.recordset.length,
            data: result.recordset
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint 4: Registrar una Venta (Módulo POS) corregido con la columna fecha_hora
app.post('/api/ventas', async (req, res) => {
    const { total, items } = req.body; 
    try {
        const pool = await poolPromise;
        
        // Insertar cabecera de la venta usando fecha_hora que es la columna real de tu tabla
        const ventaResult = await pool.request()
            .input('total', sql.Decimal(10,2), total)
            .query('INSERT INTO ventas (total, fecha_hora) OUTPUT INSERTED.id_venta VALUES (@total, GETDATE());');
        
        const idVenta = ventaResult.recordset[0].id_venta;

        res.json({ 
            success: true, 
            message: 'Venta registrada con éxito', 
            id_venta: idVenta 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
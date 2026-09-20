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

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
/* ==========================================================================
   LA EXQUISITA · CONSULTAS OPERATIVAS Y REPORTES (solo lectura)
   --------------------------------------------------------------------------
   Reemplaza al antiguo SQLQuery1.sql. Aquí NO hay DELETE ni ALTER:
   se puede ejecutar cualquier bloque sin riesgo de dañar datos.
   ========================================================================== */
USE la_exquisita_db;
GO

/* 1. Inventario con estado (ok | bajo | critico | agotado) */
SELECT id_insumo, nombre, unidad_medida, stock_actual, stock_minimo, estado
FROM dbo.vw_insumos_estado
WHERE activo = 1
ORDER BY CASE estado WHEN 'agotado' THEN 1 WHEN 'critico' THEN 2 WHEN 'bajo' THEN 3 ELSE 4 END, nombre;

/* 2. Productos y precios (paquete x10 y por unidad) */
SELECT id_producto, nombre, nombre_corto, tamano, precio AS precio_paquete, precio_unidad,
       unidades_por_paquete, activo
FROM dbo.productos
ORDER BY activo DESC, orden;

/* 3. Recetas: insumo que gasta UNA arepa de cada producto */
SELECT p.nombre AS producto, i.nombre AS insumo, r.cantidad_requerida, i.unidad_medida
FROM dbo.recetas AS r
JOIN dbo.productos AS p ON p.id_producto = r.id_producto
JOIN dbo.insumos   AS i ON i.id_insumo   = r.id_insumo
ORDER BY p.nombre, i.nombre;

/* 4. Últimas 20 ventas con cliente y vendedor */
SELECT TOP 20 v.id_venta, v.fecha_hora, c.nombre AS cliente, u.nombre AS vendedor, v.metodo_pago, v.total
FROM dbo.ventas AS v
LEFT JOIN dbo.clientes AS c ON c.id_cliente = v.id_cliente
LEFT JOIN dbo.usuarios AS u ON u.id_usuario = v.id_usuario
ORDER BY v.id_venta DESC;

/* 5. Detalle de ventas (paquetes y unidades sueltas) */
SELECT TOP 50 id_venta, fecha_hora, cliente, producto, modalidad, cantidad, unidades, precio_unitario, subtotal
FROM dbo.vw_ventas_detalle
ORDER BY id_venta DESC, id_detalle;

/* 6. Cierre de caja de HOY por método de pago */
SELECT metodo_pago, COUNT(*) AS ventas, SUM(total) AS total
FROM dbo.ventas
WHERE fecha_hora >= CAST(GETDATE() AS DATE)
GROUP BY metodo_pago
ORDER BY total DESC;

/* 7. Arepas vendidas por producto y modalidad (últimos 30 días) */
SELECT producto, modalidad, SUM(cantidad) AS cantidad, SUM(unidades) AS arepas, SUM(subtotal) AS total
FROM dbo.vw_ventas_detalle
WHERE fecha_hora >= DATEADD(DAY, -30, GETDATE())
GROUP BY producto, modalidad
ORDER BY arepas DESC;

/* 8. Clientes por rango y acumulado */
SELECT id_cliente, nombre, tipo_cliente, documento, telefono, numero_compras, total_compras, rango, ultima_compra
FROM dbo.clientes
WHERE activo = 1
ORDER BY total_compras DESC;

/* 9. Kardex: últimos movimientos de inventario */
SELECT TOP 50 m.fecha_hora, i.nombre AS insumo, m.tipo, m.cantidad, m.stock_resultante, m.referencia, u.nombre AS usuario
FROM dbo.movimientos_inventario AS m
JOIN dbo.insumos AS i ON i.id_insumo = m.id_insumo
LEFT JOIN dbo.usuarios AS u ON u.id_usuario = m.id_usuario
ORDER BY m.id_movimiento DESC;

/* 10. Mermas de los últimos 30 días por insumo */
SELECT i.nombre AS insumo, COUNT(*) AS registros, SUM(m.cantidad) AS cantidad, i.unidad_medida
FROM dbo.mermas AS m
JOIN dbo.insumos AS i ON i.id_insumo = m.id_insumo
WHERE m.fecha_hora >= DATEADD(DAY, -30, GETDATE())
GROUP BY i.nombre, i.unidad_medida
ORDER BY cantidad DESC;

/* 11. Usuarios del sistema (sin mostrar el hash de la contraseña) */
SELECT id_usuario, nombre, correo, rol, activo, debe_cambiar_password, ultimo_acceso,
       CASE WHEN bloqueado_hasta > GETDATE() THEN 'Bloqueado' ELSE 'Disponible' END AS acceso
FROM dbo.usuarios;
GO

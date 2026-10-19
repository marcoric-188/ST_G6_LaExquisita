USE la_exquisita_db;
GO
SELECT * FROM dbo.insumos;

USE la_exquisita_db;
GO
SELECT * FROM dbo.productos;


USE la_exquisita_db;
GO
SELECT TOP 10 * FROM dbo.ventas 
ORDER BY id_venta DESC; ---

USE la_exquisita_db;
GO
SELECT TOP 20 
    v.id_venta, 
    p.nombre AS producto, 
    d.cantidad, 
    d.subtotal 
FROM dbo.detalle_ventas d
JOIN dbo.ventas v ON d.id_venta = v.id_venta
JOIN dbo.productos p ON d.id_producto = p.id_producto
ORDER BY v.id_venta DESC;




USE la_exquisita_db;
GO

-- Limpiar los productos viejos
DELETE FROM dbo.productos;

-- Insertar los paquetes reales por 10 unidades y adición
INSERT INTO dbo.productos (nombre, precio, categoria) VALUES
('Paquete Arepa Grande (x10)', 23000.00, 'Paquetes'),
('Paquete Arepa Pequeña (x10)', 22000.00, 'Paquetes'),
('Queso Extra (Adición)', 3000.00, 'Adiciones');
GO



USE la_exquisita_db;
GO
ALTER TABLE dbo.ventas ADD fecha DATETIME DEFAULT GETDATE();
GO


USE la_exquisita_db;
GO
ALTER TABLE dbo.ventas ADD CONSTRAINT DF_ventas_usuario DEFAULT 1 FOR id_usuario;
GO




USE la_exquisita_db;
GO

-- 1. Permitir que metodo_pago acepte nulos o ponerle 'Efectivo' por defecto
ALTER TABLE dbo.ventas ALTER COLUMN metodo_pago VARCHAR(50) NULL;
GO
ALTER TABLE dbo.ventas ADD CONSTRAINT DF_ventas_metodo_pago DEFAULT 'Efectivo' FOR metodo_pago;
GO

-- 2. Asegurar que la fecha_hora también se ponga sola si el backend no la envía
IF NOT EXISTS (
    SELECT * FROM sys.default_constraints 
    WHERE parent_object_id = OBJECT_ID('dbo.ventas') 
    AND name LIKE '%fecha_hora%'
)
BEGIN
    ALTER TABLE dbo.ventas ADD CONSTRAINT DF_ventas_fecha_hora DEFAULT GETDATE() FOR fecha_hora;
END
GO



USE la_exquisita_db;
GO

ALTER TABLE dbo.ventas ALTER COLUMN metodo_pago VARCHAR(50) NULL;
GO
/* ==========================================================================
   LA EXQUISITA · DATOS INICIALES (seed)
   --------------------------------------------------------------------------
   Script IDEMPOTENTE: solo inserta lo que falta; NO duplica ni borra datos.
   Ejecutar DESPUÉS de schema.sql (el backend lo hace solo al arrancar).

   Usuarios iniciales (contraseña temporal: LaExquisita2026*)
     marcori@gmail.com  -> administrador
     fawi@gmail.com     -> cajero
   El sistema obliga a cambiar la contraseña en el primer inicio de sesión.
   ========================================================================== */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;  -- requerido por el índice filtrado de clientes
GO
USE la_exquisita_db;
GO

/* ---------- Usuarios ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = 'marcori@gmail.com')
    INSERT INTO dbo.usuarios (nombre, correo, rol) VALUES ('Marco Rico', 'marcori@gmail.com', 'administrador');
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = 'fawi@gmail.com')
    INSERT INTO dbo.usuarios (nombre, correo, rol) VALUES ('Esteban Espitia', 'fawi@gmail.com', 'cajero');

-- Hash bcrypt de la contraseña temporal "LaExquisita2026*" (nunca se guarda la contraseña en texto plano)
UPDATE dbo.usuarios
SET password_hash = '$2b$10$J4ZSO3rvDyz3sYRJuVcvIOD1/QCNr7KHXMy9sn8XbfnKAZAOYywzi',
    debe_cambiar_password = 1
WHERE password_hash IS NULL;
GO

/* ---------- Insumos (materia prima) ---------- */
MERGE dbo.insumos AS destino
USING (VALUES
    ('Maíz Choclo',   'Kg',     50.000, 10.000),
    ('Queso Cuajada', 'Kg',     20.000,  5.000),
    ('Mantequilla',   'Kg',     10.000,  2.000),
    ('Aceite',        'Litros', 15.000,  3.000),
    ('Azúcar',        'Kg',     12.000,  3.000),
    ('Sal',           'Kg',      5.000,  1.000)
) AS origen (nombre, unidad_medida, stock_actual, stock_minimo)
ON destino.nombre = origen.nombre
WHEN NOT MATCHED THEN
    INSERT (nombre, unidad_medida, stock_actual, stock_minimo)
    VALUES (origen.nombre, origen.unidad_medida, origen.stock_actual, origen.stock_minimo);
GO

/* ---------- Productos: Paquete Arepa Grande y Paquete Arepa Pequeña ---------- */
-- Productos de la versión anterior que ya no se venden en el POS (se ocultan, no se borran
-- para no dañar el historial de ventas)
UPDATE dbo.productos
SET activo = 0
WHERE nombre IN ('Arepa de Choclo Tradicional', 'Arepa de Choclo con Extra Queso',
                 'Queso Extra (Adición)', 'Paquete Arepas Artesanales (x10)',
                 'Paquete Arepas Tradicionales (x10)');

IF NOT EXISTS (SELECT 1 FROM dbo.productos WHERE nombre = 'Paquete Arepa Grande (x10)')
    INSERT INTO dbo.productos (nombre, precio, categoria) VALUES ('Paquete Arepa Grande (x10)', 23000, 'Paquetes');
IF NOT EXISTS (SELECT 1 FROM dbo.productos WHERE nombre = 'Paquete Arepa Pequeña (x10)')
    INSERT INTO dbo.productos (nombre, precio, categoria) VALUES ('Paquete Arepa Pequeña (x10)', 22000, 'Paquetes');

-- Datos nuevos (no se pisan los precios que ya tengas configurados)
UPDATE dbo.productos
SET nombre_corto = 'Arepa Grande',
    tamano = 'grande',
    unidades_por_paquete = 10,
    precio_unidad = COALESCE(precio_unidad, 2300),
    descripcion = COALESCE(descripcion, 'Arepa de choclo grande, dorada a la plancha, con queso. Paquete de 10 unidades.'),
    imagen = 'assets/img/arepa-grande.jpg',
    orden = 1,
    activo = 1
WHERE nombre = 'Paquete Arepa Grande (x10)';

UPDATE dbo.productos
SET nombre_corto = 'Arepa Pequeña',
    tamano = 'pequena',
    unidades_por_paquete = 10,
    precio_unidad = COALESCE(precio_unidad, 2200),
    descripcion = COALESCE(descripcion, 'Arepa de choclo pequeña, ideal para desayunos y tiendas. Paquete de 10 unidades.'),
    imagen = 'assets/img/arepa-pequena.jpg',
    orden = 2,
    activo = 1
WHERE nombre = 'Paquete Arepa Pequeña (x10)';
GO

/* ---------- Recetas: insumo que gasta UNA arepa ---------- */
DECLARE @grande INT  = (SELECT TOP 1 id_producto FROM dbo.productos WHERE nombre = 'Paquete Arepa Grande (x10)');
DECLARE @pequena INT = (SELECT TOP 1 id_producto FROM dbo.productos WHERE nombre = 'Paquete Arepa Pequeña (x10)');

IF NOT EXISTS (SELECT 1 FROM dbo.recetas WHERE id_producto = @grande)
    INSERT INTO dbo.recetas (id_producto, id_insumo, cantidad_requerida)
    SELECT @grande, i.id_insumo, r.cantidad
    FROM (VALUES ('Maíz Choclo', 0.150), ('Queso Cuajada', 0.040), ('Mantequilla', 0.010),
                 ('Azúcar', 0.010), ('Sal', 0.002), ('Aceite', 0.005)) AS r (insumo, cantidad)
    JOIN dbo.insumos AS i ON i.nombre = r.insumo;

IF NOT EXISTS (SELECT 1 FROM dbo.recetas WHERE id_producto = @pequena)
    INSERT INTO dbo.recetas (id_producto, id_insumo, cantidad_requerida)
    SELECT @pequena, i.id_insumo, r.cantidad
    FROM (VALUES ('Maíz Choclo', 0.080), ('Queso Cuajada', 0.020), ('Mantequilla', 0.005),
                 ('Azúcar', 0.005), ('Sal', 0.001), ('Aceite', 0.003)) AS r (insumo, cantidad)
    JOIN dbo.insumos AS i ON i.nombre = r.insumo;
GO

/* ---------- Clientes de ejemplo (solo si la tabla está vacía) ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo.clientes)
    INSERT INTO dbo.clientes (nombre, documento, telefono, correo, direccion, tipo_cliente) VALUES
    ('Tienda Don Pepe',       '900123456', '3104567890', 'donpepe@correo.com', 'Cra 7 # 45-12',  'negocio'),
    ('María Fernanda López',  '1032456789', '3209876543', NULL,                'Calle 80 # 20-5', 'persona'),
    ('Cafetería El Buen Día', '901987654', '3001112233', 'buendia@correo.com', 'Av. 68 # 13-40', 'negocio');
GO

PRINT 'Datos iniciales cargados.';
GO

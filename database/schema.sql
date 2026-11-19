/* ==========================================================================
   LA EXQUISITA · ESQUEMA DE BASE DE DATOS (SQL Server 2019 o superior)
   --------------------------------------------------------------------------
   CAPA DE DATOS del sistema (ver docs/ARQUITECTURA.md).

   Script IDEMPOTENTE: se puede ejecutar todas las veces que se quiera.
     * Si la base de datos no existe, la crea.
     * Si una tabla no existe, la crea.
     * Si una tabla ya existe (versión anterior del proyecto) pero le faltan
       columnas, las agrega SIN borrar los datos que ya tienes.

   Dos formas de ejecutarlo:
     1) Automática: el backend lo corre al arrancar (DB_AUTO_MIGRATE=true).
     2) Manual: abrir en SSMS y presionar F5. Luego ejecutar seed.sql.

   Tablas:
     usuarios ............ personas que usan el sistema (login + rol)
     clientes ............ compradores (personas o negocios)
     insumos ............. materia prima (maíz, queso, mantequilla...)
     productos ........... arepas que se venden (paquete x10 o por unidad)
     recetas ............. cuánto insumo gasta 1 arepa de cada producto
     ventas .............. cabecera de cada venta del POS
     detalle_ventas ...... líneas (producto, modalidad, cantidad) de cada venta
     mermas .............. pérdidas de insumos
     movimientos_inventario  kardex: toda entrada/salida de insumos
     devoluciones ........ devolución de una venta (tipo y acción) + su detalle
     modelos_ia .......... red neuronal entrenada (pesos en JSON)
     predicciones_demanda  pronóstico de arepas por día y producto
   ========================================================================== */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;  -- requerido por el índice filtrado de clientes
GO

IF DB_ID(N'la_exquisita_db') IS NULL
    CREATE DATABASE la_exquisita_db;
GO

USE la_exquisita_db;
GO

/* --------------------------------------------------------------------------
   Utilidad interna: elimina los CHECK de una columna.
   Se usa solo para poder ampliar la precisión de columnas DECIMAL creadas
   con la versión anterior del esquema (SQL Server no deja alterarlas si
   tienen un CHECK encima). Luego el CHECK se vuelve a crear con nombre.
   -------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_eliminar_checks_columna
    @tabla   SYSNAME,
    @columna SYSNAME
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @sql NVARCHAR(MAX) = N'';

    SELECT @sql += N'ALTER TABLE dbo.' + QUOTENAME(@tabla) +
                   N' DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
    FROM sys.check_constraints AS cc
    LEFT JOIN sys.columns AS c
           ON c.object_id = cc.parent_object_id
          AND c.column_id = cc.parent_column_id
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.' + @tabla)
      AND (c.name = @columna
           OR (cc.parent_column_id = 0 AND cc.definition LIKE N'%[[]' + @columna + N']%'));

    IF @sql <> N'' EXEC sys.sp_executesql @sql;
END
GO

/* ==========================================================================
   1. USUARIOS  (seguridad: contraseña con hash bcrypt, bloqueo por intentos)
   ========================================================================== */
IF OBJECT_ID(N'dbo.usuarios', N'U') IS NULL
CREATE TABLE dbo.usuarios (
    id_usuario            INT IDENTITY(1,1) CONSTRAINT PK_usuarios PRIMARY KEY,
    nombre                VARCHAR(100) NOT NULL,
    correo                VARCHAR(100) NOT NULL CONSTRAINT UQ_usuarios_correo UNIQUE,
    rol                   VARCHAR(20)  NOT NULL CONSTRAINT DF_usuarios_rol DEFAULT 'cajero'
                          CONSTRAINT CK_usuarios_rol CHECK (rol IN ('administrador', 'cajero', 'cocina')),
    password_hash         VARCHAR(100) NULL,
    activo                BIT          NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT 1,
    debe_cambiar_password BIT          NOT NULL CONSTRAINT DF_usuarios_cambiar DEFAULT 1,
    intentos_fallidos     INT          NOT NULL CONSTRAINT DF_usuarios_intentos DEFAULT 0,
    bloqueado_hasta       DATETIME     NULL,
    ultimo_acceso         DATETIME     NULL,
    fecha_creacion        DATETIME     NOT NULL CONSTRAINT DF_usuarios_fecha DEFAULT GETDATE()
);
GO
IF COL_LENGTH('dbo.usuarios', 'password_hash') IS NULL
    ALTER TABLE dbo.usuarios ADD password_hash VARCHAR(100) NULL;
IF COL_LENGTH('dbo.usuarios', 'activo') IS NULL
    ALTER TABLE dbo.usuarios ADD activo BIT NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT 1;
IF COL_LENGTH('dbo.usuarios', 'debe_cambiar_password') IS NULL
    ALTER TABLE dbo.usuarios ADD debe_cambiar_password BIT NOT NULL CONSTRAINT DF_usuarios_cambiar DEFAULT 1;
IF COL_LENGTH('dbo.usuarios', 'intentos_fallidos') IS NULL
    ALTER TABLE dbo.usuarios ADD intentos_fallidos INT NOT NULL CONSTRAINT DF_usuarios_intentos DEFAULT 0;
IF COL_LENGTH('dbo.usuarios', 'bloqueado_hasta') IS NULL
    ALTER TABLE dbo.usuarios ADD bloqueado_hasta DATETIME NULL;
IF COL_LENGTH('dbo.usuarios', 'ultimo_acceso') IS NULL
    ALTER TABLE dbo.usuarios ADD ultimo_acceso DATETIME NULL;
GO

/* ==========================================================================
   2. CLIENTES  (nueva: antes el backend la usaba pero no existía)
   ========================================================================== */
IF OBJECT_ID(N'dbo.clientes', N'U') IS NULL
CREATE TABLE dbo.clientes (
    id_cliente      INT IDENTITY(1,1) CONSTRAINT PK_clientes PRIMARY KEY,
    nombre          VARCHAR(100)  NOT NULL,
    documento       VARCHAR(20)   NULL,          -- cédula o NIT (opcional, único)
    telefono        VARCHAR(20)   NULL,
    correo          VARCHAR(100)  NULL,
    direccion       VARCHAR(150)  NULL,
    tipo_cliente    VARCHAR(20)   NOT NULL CONSTRAINT DF_clientes_tipo DEFAULT 'persona',
    total_compras   DECIMAL(12,2) NOT NULL CONSTRAINT DF_clientes_total DEFAULT 0,
    numero_compras  INT           NOT NULL CONSTRAINT DF_clientes_num DEFAULT 0,
    rango           VARCHAR(20)   NOT NULL CONSTRAINT DF_clientes_rango DEFAULT 'Nuevo',
    ultima_compra   DATETIME      NULL,
    activo          BIT           NOT NULL CONSTRAINT DF_clientes_activo DEFAULT 1,
    fecha_registro  DATETIME      NOT NULL CONSTRAINT DF_clientes_fecha DEFAULT GETDATE()
);
GO
IF COL_LENGTH('dbo.clientes', 'documento') IS NULL      ALTER TABLE dbo.clientes ADD documento VARCHAR(20) NULL;
IF COL_LENGTH('dbo.clientes', 'telefono') IS NULL       ALTER TABLE dbo.clientes ADD telefono VARCHAR(20) NULL;
IF COL_LENGTH('dbo.clientes', 'correo') IS NULL         ALTER TABLE dbo.clientes ADD correo VARCHAR(100) NULL;
IF COL_LENGTH('dbo.clientes', 'direccion') IS NULL      ALTER TABLE dbo.clientes ADD direccion VARCHAR(150) NULL;
IF COL_LENGTH('dbo.clientes', 'tipo_cliente') IS NULL   ALTER TABLE dbo.clientes ADD tipo_cliente VARCHAR(20) NOT NULL CONSTRAINT DF_clientes_tipo DEFAULT 'persona';
IF COL_LENGTH('dbo.clientes', 'total_compras') IS NULL  ALTER TABLE dbo.clientes ADD total_compras DECIMAL(12,2) NOT NULL CONSTRAINT DF_clientes_total DEFAULT 0;
IF COL_LENGTH('dbo.clientes', 'numero_compras') IS NULL ALTER TABLE dbo.clientes ADD numero_compras INT NOT NULL CONSTRAINT DF_clientes_num DEFAULT 0;
IF COL_LENGTH('dbo.clientes', 'rango') IS NULL          ALTER TABLE dbo.clientes ADD rango VARCHAR(20) NOT NULL CONSTRAINT DF_clientes_rango DEFAULT 'Nuevo';
IF COL_LENGTH('dbo.clientes', 'ultima_compra') IS NULL  ALTER TABLE dbo.clientes ADD ultima_compra DATETIME NULL;
IF COL_LENGTH('dbo.clientes', 'activo') IS NULL         ALTER TABLE dbo.clientes ADD activo BIT NOT NULL CONSTRAINT DF_clientes_activo DEFAULT 1;
IF COL_LENGTH('dbo.clientes', 'fecha_registro') IS NULL ALTER TABLE dbo.clientes ADD fecha_registro DATETIME NOT NULL CONSTRAINT DF_clientes_fecha DEFAULT GETDATE();
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_clientes_tipo')
    ALTER TABLE dbo.clientes WITH NOCHECK
        ADD CONSTRAINT CK_clientes_tipo CHECK (tipo_cliente IN ('persona', 'negocio'));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_clientes_documento' AND object_id = OBJECT_ID('dbo.clientes'))
    CREATE UNIQUE INDEX UX_clientes_documento ON dbo.clientes(documento) WHERE documento IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clientes_nombre' AND object_id = OBJECT_ID('dbo.clientes'))
    CREATE INDEX IX_clientes_nombre ON dbo.clientes(nombre);
GO

/* ==========================================================================
   3. INSUMOS  (materia prima). Cantidades con 3 decimales (gramos exactos).
   ========================================================================== */
IF OBJECT_ID(N'dbo.insumos', N'U') IS NULL
CREATE TABLE dbo.insumos (
    id_insumo      INT IDENTITY(1,1) CONSTRAINT PK_insumos PRIMARY KEY,
    nombre         VARCHAR(100)  NOT NULL,
    unidad_medida  VARCHAR(20)   NOT NULL,
    stock_actual   DECIMAL(12,3) NOT NULL CONSTRAINT DF_insumos_stock DEFAULT 0
                   CONSTRAINT CK_insumos_stock CHECK (stock_actual >= 0),
    stock_minimo   DECIMAL(12,3) NOT NULL CONSTRAINT DF_insumos_minimo DEFAULT 0,
    activo         BIT           NOT NULL CONSTRAINT DF_insumos_activo DEFAULT 1
);
GO
IF COL_LENGTH('dbo.insumos', 'activo') IS NULL
    ALTER TABLE dbo.insumos ADD activo BIT NOT NULL CONSTRAINT DF_insumos_activo DEFAULT 1;
GO
-- Versión anterior: DECIMAL(10,2) -> se amplía a DECIMAL(12,3)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.insumos') AND name = 'stock_actual' AND scale < 3)
BEGIN
    EXEC dbo.usp_eliminar_checks_columna @tabla = 'insumos', @columna = 'stock_actual';
    ALTER TABLE dbo.insumos ALTER COLUMN stock_actual DECIMAL(12,3) NOT NULL;
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.insumos') AND name = 'stock_minimo' AND scale < 3)
    ALTER TABLE dbo.insumos ALTER COLUMN stock_minimo DECIMAL(12,3) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID('dbo.insumos') AND definition LIKE '%stock_actual%')
    ALTER TABLE dbo.insumos ADD CONSTRAINT CK_insumos_stock CHECK (stock_actual >= 0);
GO

/* ==========================================================================
   4. PRODUCTOS  (se venden por PAQUETE x10 o por UNIDAD)
   ========================================================================== */
IF OBJECT_ID(N'dbo.productos', N'U') IS NULL
CREATE TABLE dbo.productos (
    id_producto          INT IDENTITY(1,1) CONSTRAINT PK_productos PRIMARY KEY,
    nombre               VARCHAR(100)  NOT NULL,
    nombre_corto         VARCHAR(60)   NULL,          -- "Arepa Grande" (para venta por unidad)
    descripcion          VARCHAR(255)  NULL,
    categoria            VARCHAR(50)   NOT NULL,
    tamano               VARCHAR(20)   NULL,          -- grande | pequena
    precio               DECIMAL(10,2) NOT NULL CONSTRAINT CK_productos_precio CHECK (precio > 0), -- precio del PAQUETE
    precio_unidad        DECIMAL(10,2) NULL,          -- precio de 1 arepa suelta
    unidades_por_paquete INT           NOT NULL CONSTRAINT DF_productos_upp DEFAULT 10,
    imagen               VARCHAR(255)  NULL,
    activo               BIT           NOT NULL CONSTRAINT DF_productos_activo DEFAULT 1,
    orden                INT           NOT NULL CONSTRAINT DF_productos_orden DEFAULT 0
);
GO
IF COL_LENGTH('dbo.productos', 'nombre_corto') IS NULL         ALTER TABLE dbo.productos ADD nombre_corto VARCHAR(60) NULL;
IF COL_LENGTH('dbo.productos', 'descripcion') IS NULL          ALTER TABLE dbo.productos ADD descripcion VARCHAR(255) NULL;
IF COL_LENGTH('dbo.productos', 'tamano') IS NULL               ALTER TABLE dbo.productos ADD tamano VARCHAR(20) NULL;
IF COL_LENGTH('dbo.productos', 'precio_unidad') IS NULL        ALTER TABLE dbo.productos ADD precio_unidad DECIMAL(10,2) NULL;
IF COL_LENGTH('dbo.productos', 'unidades_por_paquete') IS NULL ALTER TABLE dbo.productos ADD unidades_por_paquete INT NOT NULL CONSTRAINT DF_productos_upp DEFAULT 10;
IF COL_LENGTH('dbo.productos', 'imagen') IS NULL               ALTER TABLE dbo.productos ADD imagen VARCHAR(255) NULL;
IF COL_LENGTH('dbo.productos', 'activo') IS NULL               ALTER TABLE dbo.productos ADD activo BIT NOT NULL CONSTRAINT DF_productos_activo DEFAULT 1;
IF COL_LENGTH('dbo.productos', 'orden') IS NULL                ALTER TABLE dbo.productos ADD orden INT NOT NULL CONSTRAINT DF_productos_orden DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_productos_upp')
    ALTER TABLE dbo.productos WITH NOCHECK ADD CONSTRAINT CK_productos_upp CHECK (unidades_por_paquete > 0);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_productos_precio_unidad')
    ALTER TABLE dbo.productos WITH NOCHECK ADD CONSTRAINT CK_productos_precio_unidad CHECK (precio_unidad IS NULL OR precio_unidad > 0);
GO

/* ==========================================================================
   5. RECETAS  (insumo que gasta UNA arepa del producto)
   ========================================================================== */
IF OBJECT_ID(N'dbo.recetas', N'U') IS NULL
CREATE TABLE dbo.recetas (
    id_receta          INT IDENTITY(1,1) CONSTRAINT PK_recetas PRIMARY KEY,
    id_producto        INT           NOT NULL,
    id_insumo          INT           NOT NULL,
    cantidad_requerida DECIMAL(10,4) NOT NULL CONSTRAINT CK_recetas_cantidad CHECK (cantidad_requerida > 0),
    CONSTRAINT FK_recetas_productos FOREIGN KEY (id_producto) REFERENCES dbo.productos(id_producto) ON DELETE CASCADE,
    CONSTRAINT FK_recetas_insumos   FOREIGN KEY (id_insumo)   REFERENCES dbo.insumos(id_insumo)
);
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.recetas') AND name = 'cantidad_requerida' AND scale < 4)
BEGIN
    EXEC dbo.usp_eliminar_checks_columna @tabla = 'recetas', @columna = 'cantidad_requerida';
    ALTER TABLE dbo.recetas ALTER COLUMN cantidad_requerida DECIMAL(10,4) NOT NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID('dbo.recetas') AND definition LIKE '%cantidad_requerida%')
    ALTER TABLE dbo.recetas ADD CONSTRAINT CK_recetas_cantidad CHECK (cantidad_requerida > 0);
GO

/* ==========================================================================
   6. VENTAS  (cabecera). Ahora guarda el CLIENTE y el USUARIO que vendió.
   ========================================================================== */
IF OBJECT_ID(N'dbo.ventas', N'U') IS NULL
CREATE TABLE dbo.ventas (
    id_venta     INT IDENTITY(1,1) CONSTRAINT PK_ventas PRIMARY KEY,
    fecha_hora   DATETIME      NOT NULL CONSTRAINT DF_ventas_fecha_hora DEFAULT GETDATE(),
    id_usuario   INT           NOT NULL,
    id_cliente   INT           NULL,
    total        DECIMAL(12,2) NOT NULL CONSTRAINT DF_ventas_total DEFAULT 0,
    metodo_pago  VARCHAR(20)   NOT NULL CONSTRAINT DF_ventas_metodo DEFAULT 'efectivo',
    CONSTRAINT FK_ventas_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario)
);
GO
IF COL_LENGTH('dbo.ventas', 'id_cliente') IS NULL
    ALTER TABLE dbo.ventas ADD id_cliente INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ventas_clientes')
    ALTER TABLE dbo.ventas ADD CONSTRAINT FK_ventas_clientes
        FOREIGN KEY (id_cliente) REFERENCES dbo.clientes(id_cliente);
GO
-- Método de pago: el negocio solo recibe EFECTIVO o TRANSFERENCIA (Nequi, Daviplata, bancos)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ventas_metodo_pago')
BEGIN
    EXEC dbo.usp_eliminar_checks_columna @tabla = 'ventas', @columna = 'metodo_pago';
    UPDATE dbo.ventas SET metodo_pago = LOWER(LTRIM(RTRIM(metodo_pago))) WHERE metodo_pago IS NOT NULL;
    UPDATE dbo.ventas SET metodo_pago = 'efectivo' WHERE metodo_pago IS NULL;
    UPDATE dbo.ventas SET metodo_pago = 'transferencia' WHERE metodo_pago NOT IN ('efectivo', 'transferencia');
    ALTER TABLE dbo.ventas WITH NOCHECK ADD CONSTRAINT CK_ventas_metodo_pago
        CHECK (metodo_pago IN ('efectivo', 'transferencia'));
END
GO
-- Versión 4: bases que ya tenían la lista larga (nequi, daviplata, tarjeta) pasan a transferencia
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ventas_metodo_pago' AND definition LIKE '%nequi%')
BEGIN
    ALTER TABLE dbo.ventas DROP CONSTRAINT CK_ventas_metodo_pago;
    UPDATE dbo.ventas SET metodo_pago = 'transferencia' WHERE metodo_pago NOT IN ('efectivo', 'transferencia');
    ALTER TABLE dbo.ventas WITH NOCHECK ADD CONSTRAINT CK_ventas_metodo_pago
        CHECK (metodo_pago IN ('efectivo', 'transferencia'));
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ventas_fecha' AND object_id = OBJECT_ID('dbo.ventas'))
    CREATE INDEX IX_ventas_fecha ON dbo.ventas(fecha_hora);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ventas_cliente' AND object_id = OBJECT_ID('dbo.ventas'))
    CREATE INDEX IX_ventas_cliente ON dbo.ventas(id_cliente);
GO

/* ==========================================================================
   7. DETALLE DE VENTAS  (modalidad: paquete | unidad)
   ========================================================================== */
IF OBJECT_ID(N'dbo.detalle_ventas', N'U') IS NULL
CREATE TABLE dbo.detalle_ventas (
    id_detalle      INT IDENTITY(1,1) CONSTRAINT PK_detalle_ventas PRIMARY KEY,
    id_venta        INT           NOT NULL,
    id_producto     INT           NOT NULL,
    modalidad       VARCHAR(10)   NOT NULL CONSTRAINT DF_detalle_modalidad DEFAULT 'paquete',
    cantidad        INT           NOT NULL CONSTRAINT CK_detalle_cantidad CHECK (cantidad > 0),
    unidades        INT           NULL,      -- arepas totales de la línea (cantidad x 10 si es paquete)
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal        DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_detalle_ventas_ventas    FOREIGN KEY (id_venta)    REFERENCES dbo.ventas(id_venta) ON DELETE CASCADE,
    CONSTRAINT FK_detalle_ventas_productos FOREIGN KEY (id_producto) REFERENCES dbo.productos(id_producto)
);
GO
IF COL_LENGTH('dbo.detalle_ventas', 'modalidad') IS NULL
    ALTER TABLE dbo.detalle_ventas ADD modalidad VARCHAR(10) NOT NULL CONSTRAINT DF_detalle_modalidad DEFAULT 'paquete';
IF COL_LENGTH('dbo.detalle_ventas', 'unidades') IS NULL
    ALTER TABLE dbo.detalle_ventas ADD unidades INT NULL;
-- Si quedó la columna vieja "nombre_producto" (código anterior), se vuelve opcional
IF COL_LENGTH('dbo.detalle_ventas', 'nombre_producto') IS NOT NULL
    ALTER TABLE dbo.detalle_ventas ALTER COLUMN nombre_producto VARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_detalle_modalidad')
    ALTER TABLE dbo.detalle_ventas WITH NOCHECK
        ADD CONSTRAINT CK_detalle_modalidad CHECK (modalidad IN ('paquete', 'unidad'));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_detalle_venta' AND object_id = OBJECT_ID('dbo.detalle_ventas'))
    CREATE INDEX IX_detalle_venta ON dbo.detalle_ventas(id_venta);
GO

/* ==========================================================================
   8. MERMAS  (pérdida de un insumo; descuenta el stock)
   ========================================================================== */
IF OBJECT_ID(N'dbo.mermas', N'U') IS NULL
CREATE TABLE dbo.mermas (
    id_merma    INT IDENTITY(1,1) CONSTRAINT PK_mermas PRIMARY KEY,
    id_insumo   INT           NOT NULL,
    cantidad    DECIMAL(12,3) NOT NULL CONSTRAINT CK_mermas_cantidad CHECK (cantidad > 0),
    motivo      VARCHAR(255)  NOT NULL,
    observacion VARCHAR(255)  NULL,
    fecha_hora  DATETIME      NOT NULL CONSTRAINT DF_mermas_fecha DEFAULT GETDATE(),
    id_usuario  INT           NOT NULL,
    CONSTRAINT FK_mermas_insumos  FOREIGN KEY (id_insumo)  REFERENCES dbo.insumos(id_insumo),
    CONSTRAINT FK_mermas_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario)
);
GO
IF COL_LENGTH('dbo.mermas', 'id_insumo') IS NULL   ALTER TABLE dbo.mermas ADD id_insumo INT NULL;
IF COL_LENGTH('dbo.mermas', 'id_usuario') IS NULL  ALTER TABLE dbo.mermas ADD id_usuario INT NULL;
IF COL_LENGTH('dbo.mermas', 'fecha_hora') IS NULL  ALTER TABLE dbo.mermas ADD fecha_hora DATETIME NOT NULL CONSTRAINT DF_mermas_fecha DEFAULT GETDATE();
IF COL_LENGTH('dbo.mermas', 'observacion') IS NULL ALTER TABLE dbo.mermas ADD observacion VARCHAR(255) NULL;
IF COL_LENGTH('dbo.mermas', 'motivo') IS NULL      ALTER TABLE dbo.mermas ADD motivo VARCHAR(255) NOT NULL CONSTRAINT DF_mermas_motivo DEFAULT 'Sin motivo';
-- Columnas del código anterior que ya no se usan: se vuelven opcionales
IF COL_LENGTH('dbo.mermas', 'descripcion') IS NOT NULL ALTER TABLE dbo.mermas ALTER COLUMN descripcion VARCHAR(255) NULL;
IF COL_LENGTH('dbo.mermas', 'fecha') IS NOT NULL       ALTER TABLE dbo.mermas ALTER COLUMN fecha DATETIME NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.mermas') AND name = 'cantidad' AND scale < 3)
BEGIN
    EXEC dbo.usp_eliminar_checks_columna @tabla = 'mermas', @columna = 'cantidad';
    ALTER TABLE dbo.mermas ALTER COLUMN cantidad DECIMAL(12,3) NOT NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID('dbo.mermas') AND definition LIKE '%cantidad%')
    ALTER TABLE dbo.mermas ADD CONSTRAINT CK_mermas_cantidad CHECK (cantidad > 0);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.mermas') AND referenced_object_id = OBJECT_ID('dbo.insumos'))
    ALTER TABLE dbo.mermas WITH NOCHECK ADD CONSTRAINT FK_mermas_insumos FOREIGN KEY (id_insumo) REFERENCES dbo.insumos(id_insumo);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.mermas') AND referenced_object_id = OBJECT_ID('dbo.usuarios'))
    ALTER TABLE dbo.mermas WITH NOCHECK ADD CONSTRAINT FK_mermas_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario);
GO

/* ==========================================================================
   9. MOVIMIENTOS DE INVENTARIO (kardex: trazabilidad de cada cambio de stock)
      cantidad > 0 = entra stock | cantidad < 0 = sale stock
   ========================================================================== */
IF OBJECT_ID(N'dbo.movimientos_inventario', N'U') IS NULL
CREATE TABLE dbo.movimientos_inventario (
    id_movimiento    INT IDENTITY(1,1) CONSTRAINT PK_movimientos PRIMARY KEY,
    id_insumo        INT           NOT NULL,
    tipo             VARCHAR(20)   NOT NULL
                     CONSTRAINT CK_movimientos_tipo CHECK (tipo IN ('entrada', 'venta', 'merma', 'ajuste', 'devolucion')),
    cantidad         DECIMAL(12,3) NOT NULL,
    stock_resultante DECIMAL(12,3) NOT NULL,
    referencia       VARCHAR(100)  NULL,
    id_usuario       INT           NULL,
    fecha_hora       DATETIME      NOT NULL CONSTRAINT DF_movimientos_fecha DEFAULT GETDATE(),
    CONSTRAINT FK_movimientos_insumos  FOREIGN KEY (id_insumo)  REFERENCES dbo.insumos(id_insumo),
    CONSTRAINT FK_movimientos_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_movimientos_insumo_fecha' AND object_id = OBJECT_ID('dbo.movimientos_inventario'))
    CREATE INDEX IX_movimientos_insumo_fecha ON dbo.movimientos_inventario(id_insumo, fecha_hora);
GO

-- Versión 3: se agrega el tipo 'devolucion' (reposición de producto dañado)
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id = OBJECT_ID('dbo.movimientos_inventario')
             AND definition LIKE '%tipo%' AND definition NOT LIKE '%devolucion%')
BEGIN
    EXEC dbo.usp_eliminar_checks_columna @tabla = 'movimientos_inventario', @columna = 'tipo';
    ALTER TABLE dbo.movimientos_inventario ADD CONSTRAINT CK_movimientos_tipo
        CHECK (tipo IN ('entrada', 'venta', 'merma', 'ajuste', 'devolucion'));
END
GO

/* ==========================================================================
   10. ESTADO DE LA VENTA (pendiente | completada | devuelta_parcial | devuelta)
       pendiente  = pedido apartado, aún sin pagar o sin entregar
       completada = pagada y entregada (cuenta en los totales)
       devuelta   = se reembolsó todo; devuelta_parcial = se reembolsó una parte
   ========================================================================== */
IF COL_LENGTH('dbo.ventas', 'estado') IS NULL
    ALTER TABLE dbo.ventas ADD estado VARCHAR(20) NOT NULL CONSTRAINT DF_ventas_estado DEFAULT 'completada';
IF COL_LENGTH('dbo.ventas', 'total_devuelto') IS NULL
    ALTER TABLE dbo.ventas ADD total_devuelto DECIMAL(12,2) NOT NULL CONSTRAINT DF_ventas_total_devuelto DEFAULT 0;
IF COL_LENGTH('dbo.ventas', 'fecha_completada') IS NULL
    ALTER TABLE dbo.ventas ADD fecha_completada DATETIME NULL;
IF COL_LENGTH('dbo.ventas', 'observacion') IS NULL
    ALTER TABLE dbo.ventas ADD observacion VARCHAR(255) NULL;
-- origen: 'pos' = venta real; 'demo' = historial de práctica para entrenar la red neuronal
IF COL_LENGTH('dbo.ventas', 'origen') IS NULL
    ALTER TABLE dbo.ventas ADD origen VARCHAR(10) NOT NULL CONSTRAINT DF_ventas_origen DEFAULT 'pos';
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ventas_estado')
    ALTER TABLE dbo.ventas ADD CONSTRAINT CK_ventas_estado
        CHECK (estado IN ('pendiente', 'completada', 'devuelta_parcial', 'devuelta'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ventas_total_devuelto')
    ALTER TABLE dbo.ventas ADD CONSTRAINT CK_ventas_total_devuelto
        CHECK (total_devuelto >= 0 AND total_devuelto <= total);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ventas_origen')
    ALTER TABLE dbo.ventas ADD CONSTRAINT CK_ventas_origen CHECK (origen IN ('pos', 'demo'));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ventas_estado' AND object_id = OBJECT_ID('dbo.ventas'))
    CREATE INDEX IX_ventas_estado ON dbo.ventas(estado, fecha_hora);
GO

/* ==========================================================================
   11. DEVOLUCIONES (por ejemplo, un producto que salió dañado)
       tipo   : producto_danado | producto_equivocado | cliente_insatisfecho | otro
       accion : reembolso  -> se devuelve el dinero (baja el total neto de la venta)
                reposicion -> se entrega un producto nuevo (se descuentan insumos otra vez)
   ========================================================================== */
IF OBJECT_ID(N'dbo.devoluciones', N'U') IS NULL
CREATE TABLE dbo.devoluciones (
    id_devolucion     INT IDENTITY(1,1) CONSTRAINT PK_devoluciones PRIMARY KEY,
    id_venta          INT           NOT NULL,
    fecha_hora        DATETIME      NOT NULL CONSTRAINT DF_devoluciones_fecha DEFAULT GETDATE(),
    tipo              VARCHAR(30)   NOT NULL
                      CONSTRAINT CK_devoluciones_tipo CHECK (tipo IN ('producto_danado', 'producto_equivocado', 'cliente_insatisfecho', 'otro')),
    accion            VARCHAR(20)   NOT NULL
                      CONSTRAINT CK_devoluciones_accion CHECK (accion IN ('reembolso', 'reposicion')),
    motivo            VARCHAR(255)  NULL,
    total_reembolsado DECIMAL(12,2) NOT NULL CONSTRAINT DF_devoluciones_total DEFAULT 0,
    id_usuario        INT           NOT NULL,
    CONSTRAINT FK_devoluciones_ventas   FOREIGN KEY (id_venta)   REFERENCES dbo.ventas(id_venta),
    CONSTRAINT FK_devoluciones_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario)
);
GO
IF OBJECT_ID(N'dbo.detalle_devoluciones', N'U') IS NULL
CREATE TABLE dbo.detalle_devoluciones (
    id_detalle_devolucion INT IDENTITY(1,1) CONSTRAINT PK_detalle_devoluciones PRIMARY KEY,
    id_devolucion         INT           NOT NULL,
    id_detalle            INT           NOT NULL,   -- línea de detalle_ventas que se devuelve
    cantidad              INT           NOT NULL CONSTRAINT CK_detalle_dev_cantidad CHECK (cantidad > 0),
    unidades              INT           NOT NULL,
    subtotal              DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_detalle_dev_devoluciones FOREIGN KEY (id_devolucion) REFERENCES dbo.devoluciones(id_devolucion) ON DELETE CASCADE,
    CONSTRAINT FK_detalle_dev_detalle      FOREIGN KEY (id_detalle)    REFERENCES dbo.detalle_ventas(id_detalle)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_devoluciones_venta' AND object_id = OBJECT_ID('dbo.devoluciones'))
    CREATE INDEX IX_devoluciones_venta ON dbo.devoluciones(id_venta);
GO

/* ==========================================================================
   12. INTELIGENCIA ARTIFICIAL (red neuronal de pronóstico de demanda)
       modelos_ia           : pesos y métricas del modelo entrenado (JSON)
       predicciones_demanda : arepas que el modelo pronostica por día y producto
   ========================================================================== */
IF OBJECT_ID(N'dbo.modelos_ia', N'U') IS NULL
CREATE TABLE dbo.modelos_ia (
    id_modelo           INT IDENTITY(1,1) CONSTRAINT PK_modelos_ia PRIMARY KEY,
    nombre              VARCHAR(60)   NOT NULL,
    arquitectura        VARCHAR(100)  NOT NULL,
    pesos               NVARCHAR(MAX) NOT NULL,
    metricas            NVARCHAR(MAX) NULL,
    muestras            INT           NOT NULL,
    fecha_entrenamiento DATETIME      NOT NULL CONSTRAINT DF_modelos_fecha DEFAULT GETDATE(),
    activo              BIT           NOT NULL CONSTRAINT DF_modelos_activo DEFAULT 1,
    id_usuario          INT           NULL,
    CONSTRAINT FK_modelos_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario)
);
GO
IF OBJECT_ID(N'dbo.predicciones_demanda', N'U') IS NULL
CREATE TABLE dbo.predicciones_demanda (
    id_prediccion      INT IDENTITY(1,1) CONSTRAINT PK_predicciones PRIMARY KEY,
    id_modelo          INT      NOT NULL,
    id_producto        INT      NOT NULL,
    fecha_objetivo     DATE     NOT NULL,
    unidades_predichas INT      NOT NULL CONSTRAINT CK_predicciones_unidades CHECK (unidades_predichas >= 0),
    fecha_generada     DATETIME NOT NULL CONSTRAINT DF_predicciones_fecha DEFAULT GETDATE(),
    CONSTRAINT FK_predicciones_modelos   FOREIGN KEY (id_modelo)   REFERENCES dbo.modelos_ia(id_modelo),
    CONSTRAINT FK_predicciones_productos FOREIGN KEY (id_producto) REFERENCES dbo.productos(id_producto),
    CONSTRAINT UQ_predicciones_dia_producto UNIQUE (fecha_objetivo, id_producto)
);
GO

/* ==========================================================================
   13. VISTAS (consultas reutilizables por el backend y por los reportes)
   ========================================================================== */
CREATE OR ALTER VIEW dbo.vw_insumos_estado AS
SELECT
    i.id_insumo,
    i.nombre,
    i.unidad_medida,
    i.stock_actual,
    i.stock_minimo,
    i.activo,
    CASE
        WHEN i.stock_actual <= 0                    THEN 'agotado'
        WHEN i.stock_actual <= i.stock_minimo * 0.5 THEN 'critico'
        WHEN i.stock_actual <= i.stock_minimo       THEN 'bajo'
        ELSE 'ok'
    END AS estado
FROM dbo.insumos AS i;
GO

CREATE OR ALTER VIEW dbo.vw_ventas_detalle AS
SELECT
    v.id_venta,
    v.fecha_hora,
    v.metodo_pago,
    v.total,
    v.estado,
    v.total_devuelto,
    v.id_cliente,
    c.nombre      AS cliente,
    v.id_usuario,
    u.nombre      AS vendedor,
    d.id_detalle,
    d.id_producto,
    p.nombre      AS producto,
    p.tamano,
    d.modalidad,
    d.cantidad,
    COALESCE(d.unidades,
             CASE WHEN d.modalidad = 'unidad' THEN d.cantidad
                  ELSE d.cantidad * p.unidades_por_paquete END) AS unidades,
    d.precio_unitario,
    d.subtotal
FROM dbo.ventas AS v
JOIN dbo.detalle_ventas AS d ON d.id_venta = v.id_venta
JOIN dbo.productos      AS p ON p.id_producto = d.id_producto
LEFT JOIN dbo.clientes  AS c ON c.id_cliente = v.id_cliente
LEFT JOIN dbo.usuarios  AS u ON u.id_usuario = v.id_usuario;
GO

PRINT 'Esquema de la_exquisita_db listo.';
GO

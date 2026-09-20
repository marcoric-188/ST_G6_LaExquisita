# La Exquisita - Sistema Transaccional & ERP

Repositorio oficial del proyecto **La Exquisita**, un sistema transaccional modular (ERP / POS) orientado a la gestión de ventas de mostrador, control de inventario de materia prima y seguimiento de producción de alimentos preparados.

---

## 📋 Información del Proyecto
* **Nombre del Sistema:** La Exquisita - Gestor de Ventas e Inventario de Alimentos
* **Alcance:** Arquitectura lógica, diseño transaccional, modelo de base de datos relacional y servidor backend API.


## 🎯 Propósito General
El objetivo de este sistema es controlar el flujo de caja y evitar la venta de productos agotados o descuadres de inventario en negocios de alimentos de rápida rotación (como arepas de choclo). 

Para responder a esta necesidad, el sistema contempla:
1. **Consistencia transaccional (Propiedades ACID)** en el registro de ventas.
2. **Validación de stock en tiempo real** previo a la confirmación de cada pedido.
3. **Descuento automático de materia prima** (maíz, queso, aceite, etc.) según recetas y formulaciones.
4. **Módulo de mermas** para el registro de pérdidas de insumos durante la producción.

---

## ⚙️ Elementos Principales de la Solución
El sistema está estructurado en los siguientes módulos operacionales:

* **Punto de Venta (POS):** Registro rápido de ventas en mostrador y gestión de clientes.
* **Gestión de Inventario e Insumos:** Control de existencias de materia prima y productos finales.
* **Órdenes de Producción y Mermas:** Registro del proceso de transformación de alimentos y control de desperdicios.
* **Historial y Reportes:** Consulta de transacciones realizadas y reportes de cierres de caja.

---

## 📁 Estructura del Proyecto

* `/database` : Scripts SQL Server para creación del modelo relacional (`schema.sql`) y datos de prueba (`seed.sql`).
* `/backend` : Estructura del servidor API (Node.js / Express / mssql).
* `index.html` : Prototipo inicial de la interfaz (Fase I).

---

## 🗄️ Base de Datos (Fase II)

El modelo relacional en **SQL Server** está diseñado para garantizar la consistencia transaccional, descuento automático de materia prima mediante recetas y control de mermas.

### Tablas Principales
* **`usuarios`**: Control de acceso y roles (Administrador, Cajero, Cocina).
* **`insumos`**: Inventario de materia prima (Maíz, queso, mantequilla, aceite).
* **`productos`**: Catálogo de productos terminados.
* **`recetas`**: Formulación y escandallos por producto.
* **`ventas` & `detalle_ventas`**: Registro transaccional del módulo POS.
* **`mermas`**: Registro de pérdidas y desperdicios de materia prima.

### Ejecución de la Base de Datos
1. Abrir **SQL Server Management Studio (SSMS)** o **Azure Data Studio**.
2. Ejecutar el script `database/schema.sql` para crear la base de datos `la_exquisita_db` y su esquema relacional.
3. Ejecutar el script `database/seed.sql` para poblar las tablas con los datos de prueba iniciales.

---

## 🚀 Backend (Fase II)

Estructura base del servidor API en **Node.js**, **Express** y **mssql**.

### Pasos para Ejecutar el Backend
1. Navegar a la carpeta del servidor:
   ```bash
   cd backend
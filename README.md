Parte 1: Cabecera y Descripción
Markdown
# La Exquisita - Sistema Transaccional & ERP (Fase II)

Repositorio oficial del proyecto **La Exquisita**, un sistema transaccional modular (ERP / POS) orientado a la gestión de ventas de mostrador, control de inventario de materia prima, seguimiento de producción de alimentos preparados y conexión con base de datos relacional.

## Información del Proyecto
* **Nombre del Sistema:** La Exquisita - Gestor de Ventas e Inventario de Alimentos
* **Alcance:** Arquitectura lógica, diseño transaccional, modelo de base de datos relacional en SQL Server, servidor backend en Node.js y consumo de API REST desde la interfaz web (POS).
* **Autor:** Marco (Ingeniería de Software - UMB)

---
Parte 2: Propósito y Módulos
Markdown
## Propósito General
El objetivo de este sistema es controlar el flujo de caja, evitar la venta de productos agotados y prevenir descuadres de inventario en negocios de alimentos de rápida rotación.

La arquitectura actual contempla:
* Consistencia transaccional en el registro de ventas.
* Validación de stock en tiempo real previo a la confirmación de cada pedido.
* Descuento automático de materia prima (maíz, queso, aceite, etc.) según recetas y formulaciones.
* Módulo de mermas para el registro de pérdidas de insumos durante la producción.

---

## Elementos Principales y Módulos
* **Punto de Venta (POS):** Interfaz web interactiva para el registro rápido de ventas en mostrador, carrito dinámico y envío de datos mediante peticiones `fetch` (POST/GET) al servidor.
* **Gestión de Inventario e Insumos:** Control de existencias de materia prima y productos terminados.
* **Órdenes de Producción y Mermas:** Registro del proceso de transformación de alimentos y control de desperdicios.
* **Historial y Consultas SQL:** Scripts estructurados para consultas avanzadas de ventas, detalle de transacciones y cierres de caja.

---
Parte 3: Estructura del Repositorio
Markdown
## Estructura del Repositorio

ST_G6_LaExquisita/
│
├── backend/
│   ├── config/
│   │   ├── db.js            # Configuración de conexión a SQL Server (mssql)
│   │   └── .env.example     # Plantilla pública de variables de entorno
│   ├── .env                 # Variables de entorno locales (privado, ignorado por git)
│   ├── package.json         # Dependencias del servidor Node.js (Express, mssql, cors)
│   └── server.js            # Servidor API REST y endpoints de ventas e inventario
│
├── database/
│   ├── schema.sql           # Creación de base de datos la_exquisita_db y esquema relacional
│   └── seed.sql             # Datos de prueba iniciales
│
├── index.html               # Interfaz gráfica principal del POS y pasarela de ventas
└── SQLQuery1.sql            # Consultas operativas y reportes SQL para validación de datos

---
Parte 4: Base de Datos y Backend
Markdown
## Configuración de la Base de Datos (SQL Server)
El modelo relacional está diseñado para garantizar la integridad referencial y el control estricto de insumos.

### Tablas Principales:
1. `usuarios`: Control de acceso y roles (Administrador, Cajero, Cocina).
2. `insumos`: Inventario de materia prima.
3. `productos`: Catálogo de productos terminados.
4. `recetas`: Formulación y escandallos por producto.
5. `ventas` & `detalle_ventas`: Registro transaccional del módulo POS.
6. `mermas`: Registro de pérdidas y desperdicios.

### Instrucciones de Ejecución:
1. Abrir **SQL Server Management Studio (SSMS)** o Azure Data Studio.
2. Ejecutar el script ubicado en `database/schema.sql` para crear la base de datos `la_exquisita_db`.
3. Ejecutar el script `database/seed.sql` para cargar los registros de prueba.
4. Validar consultas operativas utilizando el archivo `SqlQuery1.sql`.

---

## Puesta en Marcha del Backend

El servidor está desarrollado en **Node.js** con **Express** y se conecta a SQL Server mediante el paquete `mssql`.

### Pasos de Instalación:
1. Ubícate en la carpeta del servidor desde tu terminal:
   ```bash
   cd backend
Instala las dependencias necesarias:

Bash
npm install
Configura tus variables de entorno creando un archivo .env basado en la plantilla .env.example:

Fragmento de código
PORT=3000
DB_HOST=localhost
DB_INSTANCE=SQL2025
DB_NAME=la_exquisita_db
Inicia el servidor en modo de desarrollo:

Bash
node server.js
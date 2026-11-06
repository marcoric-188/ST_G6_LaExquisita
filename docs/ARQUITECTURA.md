# Arquitectura de La Exquisita · POS & ERP

Este documento explica **qué capas maneja el sistema**, tanto en el frontend como en el backend, y cómo se conectan con la base de datos SQL Server que ya existe.

El estilo es una **arquitectura en capas** (n-capas) sobre un esquema **cliente-servidor**:

```
┌──────────────────────────── NAVEGADOR (Frontend) ────────────────────────────┐
│  Presentación  →  Controladores de vista  →  Componentes  →  Servicios  →  Core │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │  HTTP + JSON (API REST /api/...)
                                        │  Sesión en cookie httpOnly (JWT)
┌───────────────────────────────────────▼──────── SERVIDOR (Backend Node.js) ──┐
│  Middlewares (seguridad) → Rutas → Controladores → Servicios → Repositorios   │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │  Consultas parametrizadas (mssql)
┌───────────────────────────────────────▼──────────── BASE DE DATOS ───────────┐
│  SQL Server · la_exquisita_db · tablas, vistas, restricciones, transacciones │
└──────────────────────────────────────────────────────────────────────────────┘
```

Regla de oro: **cada capa solo habla con la capa de abajo**. La interfaz nunca escribe SQL, y los repositorios nunca saben de HTML.

---

## 1. Capas del BACKEND (`backend/`)

| # | Capa | Carpeta | Responsabilidad | Ejemplo |
|---|------|---------|-----------------|---------|
| 0 | **Arranque** | `server.js`, `src/app.js` | Levanta Express, registra middlewares, sirve el frontend y conecta a SQL Server con reintentos. | Si SQL Server está apagado, el servidor **no se cae**: avisa y reintenta. |
| 1 | **Configuración** | `src/config/` | Lee `.env` (`env.js`) y crea el pool de conexiones (`database.js`). Soporta autenticación de Windows (msnodesqlv8 + ODBC, prueba los drivers 18/17/Native Client/SQL Server) o usuario SQL (tedious). | `DB_AUTH=windows`, `DB_INSTANCE=SQL2025` |
| 2 | **Middlewares (seguridad transversal)** | `src/middlewares/` | Cabeceras seguras y CSP (helmet), límite de peticiones, solo JSON, CORS restringido, sesión (`autenticar`), roles (`autorizar`) y manejo central de errores. | Un cajero no puede borrar insumos (403). |
| 3 | **Rutas (API REST)** | `src/routes/index.js` | Declara cada endpoint, su método HTTP y qué roles pueden usarlo. | `POST /api/ventas` → administrador, cajero |
| 4 | **Controladores** | `src/controllers/` | Traducen HTTP ↔ servicio: leen `req`, llaman al servicio y responden JSON. Sin reglas de negocio ni SQL. | `ventas.controller.registrar` |
| 5 | **Servicios (lógica de negocio)** | `src/services/` | Reglas del negocio, validación de datos y **transacciones**. | Precio desde la BD, venta por paquete/unidad, descuento por receta, rango del cliente. |
| 6 | **Repositorios (acceso a datos)** | `src/repositories/` | **Único lugar con SQL**. Siempre con parámetros (`@id`), lo que evita la inyección SQL. Convierten DECIMAL a número. | `insumosRepo.descontar(id, cantidad, tx)` |
| 7 | **Migración** | `src/database/migrator.js` | Ejecuta `database/schema.sql` y `seed.sql` al arrancar (son idempotentes). | Crea `clientes` si no existe, agrega columnas faltantes. |
| — | **Utilidades** | `src/utils/` | `AppError` (errores con código HTTP), `validator` (validación de entradas), `asyncHandler`. | — |

### Módulos (cada uno atraviesa las capas 3 → 6)

| Módulo | Endpoints | Servicio | Repositorio |
|--------|-----------|----------|-------------|
| Autenticación | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/cambiar-password` | `auth.service` | `usuarios.repository` |
| Panel de inicio | `GET /dashboard` | `dashboard.service` | ventas, clientes, mermas, insumos |
| Productos | `GET /productos` (con paquetes disponibles según stock) | `productos.service` | `productos.repository` |
| Clientes | `GET/POST /clientes`, `GET/PUT/DELETE /clientes/:id` | `clientes.service` | `clientes.repository` |
| Insumos y stock | `GET/POST /insumos`, `PUT/DELETE /insumos/:id`, `POST /insumos/:id/entradas`, `GET /insumos/movimientos` | `insumos.service` | `insumos.repository` |
| Mermas | `GET/POST /mermas` | `mermas.service` | `mermas.repository`, `insumos.repository` |
| Ventas (POS) | `GET/POST /ventas`, `GET /ventas/:id` | `ventas.service` | ventas, productos, insumos, clientes |
| Asistente IA | `POST /ia/chat` | `ia/ia.service` → `contexto.service` + `motorLocal` (+ OpenAI opcional) | todos (solo lectura) |
| Salud | `GET /health` (prueba en vivo la conexión) | — | `SELECT 1` |

### Flujo de una venta (todo en UNA transacción)

```
POS (navegador)                 Backend                                  SQL Server
──────────────                  ───────                                  ──────────
{id_cliente, metodo_pago,  ──►  ventas.controller
 items:[{id_producto,             └─ ventas.service.registrar
  modalidad, cantidad}]}             1. valida datos (validator)
                                     2. BEGIN TRANSACTION  ───────────────►  
                                     3. cliente existe y está activo  ───►  SELECT clientes
                                     4. precios oficiales de la BD   ────►  SELECT productos
                                     5. recetas → insumos necesarios ────►  SELECT recetas
                                     6. inserta venta + detalle      ────►  INSERT ventas / detalle_ventas
                                     7. descuenta stock SOLO si alcanza ─►  UPDATE insumos ... WHERE stock >= x
                                        (si no alcanza → ROLLBACK, 409)
                                     8. kardex                       ────►  INSERT movimientos_inventario
                                     9. acumulado y rango del cliente ───►  UPDATE clientes
                                    10. COMMIT  ──────────────────────────►
recibo  ◄──────────────────────── 201 {id_venta, total, items, insumos_descontados}
```

---

## 2. Capas del FRONTEND (`frontend/`)

Es una aplicación de una sola página (SPA) con **JavaScript nativo en módulos** (sin frameworks ni compilación). La sirve el mismo backend en `http://localhost:3000`.

| # | Capa | Carpeta | Responsabilidad |
|---|------|---------|-----------------|
| 1 | **Presentación** | `index.html`, `css/styles.css`, `assets/`, `vendor/` | Estructura de pantallas, formularios y modales; estilos y colorimetría. Sin lógica ni scripts en línea (lo exige la CSP). |
| 2 | **Controladores de vista** | `js/views/` | Una vista por pantalla: escucha eventos, pide datos a los servicios y pinta resultados. `inicio`, `pos`, `clientes`, `insumos`, `mermas`, `ventas`, `asistente`, `login`, `sesion`. |
| 3 | **Componentes** | `js/components/` | Piezas reutilizables: `ui.js` (toasts, modales, confirmación, contadores animados, esqueletos), `clientePicker.js` (buscar/seleccionar cliente en el POS), `clienteForm.js` (crear/editar cliente). |
| 4 | **Servicios** | `js/services/` | Una función por endpoint de la API. Es la única capa que conoce las URL del backend. |
| 5 | **Núcleo (core)** | `js/core/` | `config.js` (URL de la API), `http.js` (fetch + manejo de errores), `store.js` (usuario, permisos por rol, bus de eventos), `router.js` (rutas `#/inicio`, `#/pos`…). |
| 6 | **Utilidades** | `js/utils/` | `dom.js`: plantilla `html\`...\`` que **escapa todo automáticamente** (anti-XSS); `format.js`: pesos colombianos, números y fechas. |

### Navegación

- **Barra superior:** Inicio · Ventas · Asistente IA (y el menú del usuario).
- **Tarjetas de Inicio:** Venta Rápida POS · Clientes · Insumos y Stock · Control de Mermas.
  Estos módulos ya no se repiten en la barra superior.
- Cada vista se oculta automáticamente si el rol del usuario no tiene permiso (`data-roles`).

---

## 3. Capa de DATOS (`database/`)

| Archivo | Uso |
|---------|-----|
| `schema.sql` | Crea la base y las tablas si no existen; si ya existen (versión anterior), **agrega columnas faltantes sin borrar datos**. Incluye vistas `vw_insumos_estado` y `vw_ventas_detalle`. |
| `seed.sql` | Datos iniciales idempotentes: usuarios, insumos, productos Grande/Pequeña, recetas y clientes de ejemplo. |
| `consultas.sql` | Reportes de solo lectura (cierre de caja, kardex, ranking, etc.). |

### Modelo relacional

```
usuarios ──< ventas >── clientes            productos ──< recetas >── insumos
   │            │                                │                       │
   │            └──< detalle_ventas >────────────┘                       │
   ├──< mermas >─────────────────────────────────────────────────────────┤
   └──< movimientos_inventario (kardex) >────────────────────────────────┘
```

Cambios respecto a la versión anterior y por qué:

| Tabla | Cambio | Motivo |
|-------|--------|--------|
| `clientes` | **Nueva** | El backend la consultaba pero no existía → todo el módulo daba error. |
| `ventas` | + `id_cliente` | Cada venta queda asociada a su cliente. Método de pago normalizado (+ Daviplata, transferencia). |
| `detalle_ventas` | + `modalidad` (`paquete`/`unidad`), + `unidades` | Venta por paquete **y** por cantidad. El código anterior insertaba una columna `nombre_producto` que no existía. |
| `productos` | + `precio_unidad`, `tamano`, `nombre_corto`, `imagen`, `unidades_por_paquete`, `activo` | Paquete Arepa Grande / Pequeña, precio por unidad e imagen desde la BD. |
| `insumos` | precisión `DECIMAL(12,3)`, + `activo` | Gramos exactos (antes 0.005 Kg se redondeaba). |
| `recetas` | precisión `DECIMAL(10,4)` | Gasto exacto por arepa. |
| `mermas` | + `observacion` | El código anterior insertaba `descripcion`/`fecha`, que no existían en la tabla. |
| `usuarios` | + `password_hash`, `activo`, `debe_cambiar_password`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_acceso` | Inicio de sesión seguro. |
| `movimientos_inventario` | **Nueva** | Kardex: trazabilidad de cada entrada, venta y merma. |

---

## 4. Seguridad básica implementada

| Riesgo | Control | Dónde |
|--------|---------|-------|
| Acceso sin autorización | Inicio de sesión obligatorio; sesión JWT firmada en **cookie httpOnly + SameSite=Strict** (8 h) | `auth.service`, `middlewares/auth.js` |
| Permisos | Roles `administrador`, `cajero`, `cocina` validados **en el servidor** (el frontend solo oculta botones) | `routes/index.js` |
| Contraseñas | Hash **bcrypt**; política mínima (8+, letras y números); cambio obligatorio de la contraseña temporal | `auth.service` |
| Fuerza bruta | Bloqueo de la cuenta 15 min tras 5 intentos fallidos + límite de 10 intentos por IP | `usuarios.repository`, `security.js` |
| Inyección SQL | 100 % consultas parametrizadas | `repositories/` |
| XSS | Escape automático en todas las plantillas (`html\`\``) + **Content-Security-Policy** sin scripts externos ni en línea | `utils/dom.js`, `security.js` |
| CSRF | Cookie SameSite=Strict + la API solo acepta `application/json` | `security.js` |
| Manipulación de precios | El servidor calcula los precios desde la BD; ignora lo que mande el navegador | `ventas.service` |
| Datos inválidos | Validación de tipo, longitud, rango y listas permitidas en cada entrada | `utils/validator.js` |
| Fuga de información | Errores internos solo en consola; al navegador llegan mensajes genéricos. `.env` fuera de git | `errorHandler.js`, `.gitignore` |
| Abuso de la API | 300 peticiones/min por IP; 30 preguntas/min a la IA; cuerpo máximo 100 KB | `security.js`, `app.js` |
| Borrado accidental | Eliminación lógica (`activo = 0`) en clientes e insumos; historial intacto | repositorios |

---

## 5. Colorimetría (tomada del logo: arepa de choclo)

| Token | Hex | Inspiración | Uso |
|-------|-----|-------------|-----|
| `--tostado-900` | `#2B1B11` | Fondo oscuro de la foto | Encabezado, textos principales |
| `--tostado-600` | `#96551D` | Costra dorada de la arepa | Botón principal, precios, marca |
| `--dorado-400` | `#DF9A33` | Brillo del dorado | Íconos, acentos |
| `--maiz-400` | `#F5C442` | Aro amarillo del logo / granos | Navegación activa, "Nuevo cliente", insignias |
| `--crema-50` | `#FFFBF3` | Queso cuajada | Fondo de la aplicación |
| `--hoja-600` | `#62893A` | Hoja verde de la mazorca | Éxito, stock OK, confirmar venta, insumos |
| `--morado-600` | `#7B4F80` | Hoja morada de la mazorca | Asistente IA |
| `--brasa-600` | `#C4462B` | Fuego de la plancha | Alertas, mermas, eliminar |

Interfaz dinámica: contadores animados, gráfico de barras que crece, granos de maíz flotando, tarjetas que se elevan al pasar el mouse, selector paquete/unidad deslizante, avisos emergentes, esqueletos de carga y recibo animado. Se respeta `prefers-reduced-motion`.

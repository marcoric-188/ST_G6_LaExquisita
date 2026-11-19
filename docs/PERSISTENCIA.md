# Persistencia de datos

**Persistir** un dato es guardarlo de forma que **sobreviva** cuando se cierra el navegador, se reinicia el servidor o se apaga el computador. En La Exquisita todo lo que tiene valor para el negocio se persiste en **SQL Server** (`la_exquisita_db`). La memoria del navegador o del servidor solo se usa de paso.

## Qué se persiste y dónde

| Dato | Tabla | Cuándo se escribe |
|------|-------|-------------------|
| Usuarios, rol, contraseña cifrada (bcrypt), intentos fallidos | `usuarios` | Al crear el usuario, en cada inicio de sesión y al cambiar la contraseña |
| Clientes, acumulado de compras y rango | `clientes` | Al registrar o editar un cliente, al completar una venta y al reembolsar |
| Productos, precios por paquete y por unidad | `productos` | Datos iniciales (`seed.sql`) o ajuste por SQL |
| Recetas (insumo por arepa) | `recetas` | Datos iniciales |
| Stock de insumos | `insumos` | En cada venta, merma, entrada de stock y reposición |
| Ventas y su estado | `ventas`, `detalle_ventas` | Al confirmar en el POS; al completar una pendiente; al reembolsar |
| Devoluciones | `devoluciones`, `detalle_devoluciones` | Al registrar una devolución |
| Mermas | `mermas` | Al registrar una pérdida |
| Kardex (historial de cada cambio de stock) | `movimientos_inventario` | Automático en cada venta, merma, entrada o reposición |
| Red neuronal entrenada (pesos en JSON) y métricas | `modelos_ia` | Al entrenar (automático cada 24 h o con el botón *Reentrenar*) |
| Pronósticos por día y producto | `predicciones_demanda` | Cada vez que se consulta el pronóstico |

**Lo que NO se persiste a propósito:** el carrito del POS (vive en el navegador hasta confirmar la venta) y la sesión. La sesión es un *token* firmado dentro de una cookie: el servidor no necesita guardarla, solo verifica la firma.

## Cómo se garantiza que lo guardado es correcto

1. **Transacciones (ACID).** Una venta escribe en 5 tablas: venta, detalle, insumos, kardex y cliente. Todo ocurre dentro de `BEGIN TRANSACTION … COMMIT`. Si algo falla, por ejemplo porque no alcanza el maíz, se hace `ROLLBACK` y **no queda nada a medias**. Ver `withTransaction` en `backend/src/config/database.js`.
2. **Descuento atómico de stock.** `UPDATE insumos SET stock_actual = stock_actual - @x WHERE stock_actual >= @x`. Si dos cajeros venden al mismo tiempo, nunca queda stock negativo.
3. **Bloqueo de fila al cambiar el estado.** Completar o devolver una venta usa `WITH (UPDLOCK)`, para que dos personas no la modifiquen a la vez.
4. **Restricciones en la base:** llaves primarias y foráneas, `UNIQUE` (documento del cliente, correo del usuario) y `CHECK` (stock ≥ 0, cantidades > 0, estados permitidos, `total_devuelto ≤ total`).
5. **Eliminación lógica.** Clientes e insumos no se borran: se marcan `activo = 0`, así las ventas antiguas siguen apuntando a ellos.
6. **Migración idempotente.** `schema.sql` crea solo lo que falta y nunca borra datos. El backend lo ejecuta al arrancar.

## Ciclo de vida de un dato (ejemplo: una venta)

```
Navegador (carrito en memoria)
   │  POST /api/ventas  {cliente, productos, cantidades}
   ▼
Backend: valida → abre transacción → calcula precios y receta
   ▼
SQL Server: INSERT ventas, detalle_ventas · UPDATE insumos · INSERT kardex · UPDATE clientes
   ▼
COMMIT  →  el dato ya es PERSISTENTE (sobrevive a reinicios)
   ▼
Se lee después en: Historial de ventas, Inicio, Clientes, Asistente IA y red neuronal
```

---

# Pertinencia, persistencia y congruencia de los datos

Son tres cualidades que debe cumplir la información de un sistema transaccional. Con ejemplos de La Exquisita:

## Pertinencia

**Que se guarde lo que el negocio necesita, ni más ni menos, y que sirva para una decisión.**

- Se guardan la **modalidad** (paquete o unidad) y las **unidades** de cada línea, porque el negocio vende de las dos formas y la producción se planea en arepas.
- El **tipo de devolución** (producto dañado, equivocado, etc.) es pertinente porque permite saber por qué se pierde producto.
- La **receta por arepa** es pertinente porque con ella se descuenta el inventario y se calcula cuánto se puede producir.
- **No** se guardan datos personales innecesarios del cliente: el documento y el correo son opcionales. La IA externa solo recibe el top 10 de clientes, nunca la lista completa.

## Persistencia

**Que el dato quede guardado de forma durable y recuperable.**

- Todo se escribe en SQL Server dentro de transacciones confirmadas (`COMMIT`).
- El kardex conserva **cada** movimiento de inventario, así que el stock actual siempre se puede reconstruir y auditar.
- La red neuronal también persiste: el modelo entrenado y sus pronósticos se guardan en `modelos_ia` y `predicciones_demanda`.
- Si SQL Server se apaga, el servidor no se cae ni pierde lo ya guardado. Avisa en pantalla y se reconecta solo.

## Congruencia (consistencia)

**Que los datos no se contradigan entre sí, en ninguna tabla y en ningún momento.**

- Si una venta descuenta 1,5 Kg de maíz, el kardex registra exactamente −1,5 Kg y el stock resultante. Venta, kardex e inventario cuadran.
- El **total neto** de una venta es siempre `total − total_devuelto`, y la base de datos impide que se devuelva más de lo vendido (`CHECK` + validación en el servicio).
- El acumulado del cliente sube al **completar** la venta y baja al **reembolsar**. Una venta pendiente no lo modifica.
- Todos los reportes (Inicio, Historial, IA) usan las mismas reglas: excluyen las pendientes y usan el total neto. Por eso muestran las mismas cifras.
- El precio lo calcula el servidor desde la tabla `productos`. El navegador no puede enviar un precio distinto.

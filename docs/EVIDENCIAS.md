# Evidencias

Este documento reúne las evidencias de la entrega final:

1. [Evidencias de las pruebas realizadas](#1-evidencias-de-las-pruebas-realizadas)
2. [Evidencia del servicio de Inteligencia Artificial](#2-evidencia-del-servicio-de-inteligencia-artificial)

Todas las capturas están en [`evidencias/capturas/`](evidencias/capturas) y la salida completa de las pruebas en [`evidencias/pruebas/`](evidencias/pruebas). Se tomaron con el sistema corriendo contra SQL Server, con 90 días de ventas de práctica (`npm run historial-demo`) más las ventas registradas durante las pruebas.

---

## 1. Evidencias de las pruebas realizadas

Se hicieron tres tipos de prueba:

| Tipo | Qué se prueba | Cómo se ejecuta | Resultado |
|------|---------------|-----------------|-----------|
| Unitarias | Reglas de negocio sin base de datos: precios, recetas, devoluciones, validaciones, red neuronal | `npm test` | 19 de 19 aprobadas |
| Integración | Procesos completos contra la API y SQL Server | `npm run test:api` | 15 de 15 aprobadas |
| Funcionales (manuales) | Recorrido del usuario en el navegador, proceso por proceso | Capturas de esta sección | Sin errores |

El detalle de cada caso (entrada, resultado esperado y resultado obtenido) está en [`PRUEBAS.md`](PRUEBAS.md).

### 1.1 Pruebas unitarias

![Pruebas unitarias](evidencias/capturas/14-pruebas-unitarias.jpg)

Las 19 pruebas pasan. Verifican, entre otras cosas, que el precio sale de la base de datos y no del navegador, que no se puede devolver más de lo vendido, que la receta descuenta bien los insumos y que la red neuronal aprende (el error baja más de 100 veces).

### 1.2 Pruebas de integración

![Pruebas de integración](evidencias/capturas/14b-pruebas-integracion.jpg)

Las 15 pruebas usan la API real y escriben en SQL Server. Las más importantes:

- **PI-03:** una contraseña incorrecta se rechaza.
- **PI-07:** si no alcanza el stock, la venta se cancela completa (*rollback*) y no queda nada a medias.
- **PI-09:** una venta pendiente no se puede devolver; al completarla suma al cliente.
- **PI-10 y PI-11:** devolución por producto dañado, con reposición o con reembolso.
- **PI-14 y PI-15:** la IA responde con datos de la base y la red neuronal pronostica.

### 1.3 Pruebas funcionales (recorrido en el sistema)

**Inicio de sesión.** Solo entra un usuario registrado, con la contraseña cifrada con bcrypt. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.

![Login](evidencias/capturas/00-login.jpg)

**Panel de inicio.** Indicadores en vivo desde SQL Server: lo vendido hoy, los últimos 30 días, los clientes y los insumos en alerta.

![Inicio](evidencias/capturas/01-inicio.jpg)

**Venta pendiente en el POS.** Cliente existente, 2 paquetes grandes y 4 arepas pequeñas por unidad, estado *Pendiente* y nota del pedido.

![POS pendiente](evidencias/capturas/02-pos-pendiente.jpg)

**Recibo.** La venta queda guardada con su número consecutivo y se muestran los insumos descontados según la receta.

![Recibo](evidencias/capturas/03-recibo-pendiente.jpg)

**Filtrar pendientes.** En Ventas, el filtro muestra solo los pedidos por cobrar y el total pendiente.

![Ventas pendientes](evidencias/capturas/04-ventas-pendientes.jpg)

**Completar la venta.** Desde el detalle se marca como pagada, por efectivo o transferencia.

![Detalle pendiente](evidencias/capturas/05-detalle-pendiente.jpg)

**Devolución por producto dañado.** Se elige el tipo (*Producto dañado*) y la acción (*Reponer producto*). Al reponer, se descuentan los insumos otra vez.

![Devolución](evidencias/capturas/06-devolucion-reposicion.jpg)

**Estados de la venta.** Después de un reembolso, la venta pasa a *Devolución parcial* y el total neto baja. La numeración es consecutiva (#0491, #0492, …).

![Ventas con estados](evidencias/capturas/07-ventas-estados.jpg)

**Detalle con devoluciones.** Se ve cada devolución con su tipo, acción, motivo y valor reembolsado.

![Detalle con devoluciones](evidencias/capturas/08-detalle-con-devoluciones.jpg)

**Clientes.** La frecuencia (frecuente, ocasional, nuevo) y el acumulado se calculan desde las ventas.

![Clientes](evidencias/capturas/09-clientes.jpg)

**Insumos y stock.** Existencias de cada insumo con su mínimo y alertas.

![Insumos](evidencias/capturas/10-insumos.jpg)

**Mermas.** Registro de pérdidas, que descuenta el inventario.

![Mermas](evidencias/capturas/11-mermas.jpg)

**Kardex.** Cada movimiento de inventario (venta, merma, entrada, reposición) queda registrado.

![Kardex](evidencias/capturas/12-kardex.jpg)

**Vista en celular.** La interfaz se adapta a pantallas pequeñas sin desbordarse.

![Móvil](evidencias/capturas/13-movil.jpg)

---

## 2. Evidencia del servicio de Inteligencia Artificial

El sistema tiene dos componentes de IA conectados a SQL Server: una **red neuronal** que pronostica la demanda y un **asistente** que responde preguntas en español. La explicación técnica completa está en [`IA.md`](IA.md).

### 2.1 Red neuronal: producción sugerida para mañana

![Red neuronal en el inicio](evidencias/capturas/15-ia-red-neuronal.jpg)

Qué se ve en la tarjeta:

- **Pronóstico para mañana (viernes):** 77 arepas grandes (8 paquetes) y 59 pequeñas (6 paquetes).
- **Gráfica de 7 días:** la red aprendió el patrón semanal: sábado y domingo altos, lunes bajo.
- **Modelo:** perceptrón multicapa 14-8-1 (tanh, optimizador Adam), programado desde cero en JavaScript.
- **Error medio en validación:** ±10 arepas por producto y día, medido en 14 días que la red no vio al entrenar.
- **Frente a un promedio simple:** 38 % menos error que el promedio de los últimos 7 días.
- **Entrenado con** 178 ejemplos de 90 días con ventas. El botón *Reentrenar* lo vuelve a entrenar con los datos actuales.

### 2.2 Resultado que genera el servicio (API)

![Respuesta de la API](evidencias/capturas/19-ia-api-pronostico.jpg)

`GET /api/ia/pronostico` devuelve el pronóstico por producto, los insumos necesarios para mañana (con la receta) y si alcanzan con el stock actual, junto con las métricas del modelo. Este mismo resultado lo usan el Inicio, el asistente y las alertas.

### 2.3 Asistente: pronóstico e insumos

![Asistente: pronóstico](evidencias/capturas/16-ia-asistente-pronostico.jpg)

A "¿Cuántas arepas preparo mañana?" responde con el pronóstico de la red neuronal y revisa si el inventario alcanza. A "¿Qué debo comprar?" compara cada insumo con su mínimo.

### 2.4 Asistente: ventas y preguntas de seguimiento

![Asistente: ventas](evidencias/capturas/17-ia-asistente-ventas.jpg)

Responde cantidades exactas de la base (paquetes y unidades sueltas) y entiende el seguimiento: "¿y ayer?" usa la misma pregunta anterior con otro periodo.

### 2.5 Asistente: inventario y devoluciones

![Asistente: inventario](evidencias/capturas/18-ia-asistente-inventario.jpg)

Calcula para cuántos días alcanza un insumo según el consumo real y cuántas arepas se pueden producir con él. También resume las devoluciones del mes por tipo.

### 2.6 Las 5 preguntas del servicio de IA

| Pregunta | Respuesta | Evidencia |
|----------|-----------|-----------|
| ¿Qué problema resuelve? | Decidir cuántas arepas preparar cada día para no perder masa y queso (mermas) ni ventas | 15, 16 |
| ¿Cómo se integra? | Servicio del backend → API `/api/ia/pronostico` y `/api/ia/chat` → Inicio y asistente | 15, 19 |
| ¿Qué información procesa? | Ventas por día y producto (120 días), día de la semana, recetas y stock, todo desde SQL Server | 17, 18 |
| ¿Qué resultado genera? | Arepas y paquetes por producto para 7 días, insumos necesarios y alertas | 15, 19 |
| ¿Cómo lo usa el sistema? | Tarjeta "Producción sugerida", respuestas del asistente y aviso de insumos que faltan | 15, 16 |

Las pruebas automáticas de la IA son: 6 unitarias en `backend/test/ia.test.js` y PI-14 / PI-15 en `backend/pruebas/api.flujo.js` (ver 1.1 y 1.2).

# Guía de la demostración final

Orden sugerido para la socialización (unos 15 minutos). Cada bloque indica el criterio de la ficha de auditoría final al que responde.

## Antes de empezar (una sola vez)

```bash
cd backend
npm install
npm start
```

La red neuronal ya funciona con 2 días de ventas. Si se quiere mostrar la semana completa con un historial más largo, en otra terminal:

```bash
npm run historial-demo
```

Abrir `http://localhost:3000`. Tener abiertos en VS Code `ventas.service.js`, `pronostico.service.js`, `redNeuronal.js` y `schema.sql`.

---

## 1. Prototipo · procesos transaccionales (criterio 1: funcionamiento)

1. **Inicio de sesión** con roles. Mostrar que una contraseña mala se rechaza.
2. **Inicio:** indicadores en vivo y la tarjeta de la red neuronal.
3. **POS · venta completada:** buscar un cliente existente, agregar 2 paquetes grandes y 5 arepas pequeñas por unidad, pagar por transferencia y mostrar el recibo con los insumos descontados.
4. **POS · venta pendiente:** registrar un pedido "Pendiente" con nota ("recoge a las 5 p. m.").
5. **Ventas:** filtrar *Pendientes*, abrir la venta y **marcarla como completada**.
6. **Devolución por producto dañado:** en esa venta, *Registrar devolución* → tipo *Producto dañado* → *Reponer producto*. Explicar que vuelve a descontar insumos.
7. **Reembolso:** otra devolución con *Devolver dinero*. La venta pasa a *Devuelta parcial* y baja el total neto.
8. **Insumos → Kardex:** mostrar los movimientos de venta y de reposición.
9. **Clientes:** el acumulado y la frecuencia (frecuente, ocasional, nuevo) se calculan con sus ventas.

## 2. Pruebas (criterio 3: calidad técnica)

En la terminal:

```bash
npm test          # 19 pruebas unitarias
npm run test:api  # 15 pruebas de integración contra SQL Server
```

Explicar 3 casos: **PI-07** (stock insuficiente → rollback, no queda venta a medias), **PI-09** (no se puede completar dos veces) y **PI-11** (no se puede devolver más de lo vendido). La tabla completa está en [`PRUEBAS.md`](PRUEBAS.md).

## 3. Servicio de IA

Seguir las 5 preguntas de [`IA.md`](IA.md):

| Pregunta | Qué mostrar |
|----------|-------------|
| ¿Qué problema resuelve? | Cuántas arepas preparar mañana (evitar mermas y ventas perdidas) |
| ¿Cómo se integra? | Servicio del backend → API `/api/ia/pronostico` → panel y asistente |
| ¿Qué información procesa? | 120 días de ventas por producto, día de la semana, recetas y stock |
| ¿Qué resultado genera? | Arepas y paquetes por producto para 7 días, insumos necesarios y alertas |
| ¿Cómo lo usa el sistema? | Tarjeta "Producción sugerida", respuesta del asistente y alertas de compra |

En vivo:
- En Inicio, presionar **Reentrenar** y leer las métricas que muestra la tarjeta: error medio en arepas y cuánto mejora frente a un promedio simple.
- En el Asistente: "¿Cuántas arepas preparo mañana?", "¿Qué debo comprar?" y "Devoluciones del mes".
- En código: `redNeuronal.js`. Explicar la propagación hacia adelante, el error MSE, la retropropagación con la regla de la cadena y Adam.

## 4. Repositorio y código (criterio 2)

- Estructura por capas: [`ARQUITECTURA.md`](ARQUITECTURA.md).
- Persistencia, pertinencia y congruencia: [`PERSISTENCIA.md`](PERSISTENCIA.md).
- Evidencias de las pruebas y de la IA, con capturas: [`EVIDENCIAS.md`](EVIDENCIAS.md).

## Preguntas que pueden hacer

- **¿Por qué la venta pendiente descuenta stock?** Porque las arepas ya se prepararon y apartaron. Lo que no hace es contar como dinero vendido hasta que se cobra.
- **¿Qué pasa con un producto dañado?** Se registra la devolución con su tipo. Si se repone, se descuentan insumos otra vez. Si se reembolsa, baja el total neto y el acumulado del cliente.
- **¿Por qué una red neuronal y no un promedio?** Porque aprende el patrón por día de la semana. La tarjeta del Inicio muestra cuánto menos se equivoca que el promedio de 7 días.
- **¿Qué pasa con pocos días de ventas?** Desde 2 días ya aprende; hasta los 14 días combina su resultado con el promedio reciente para no dar cifras sin sentido.
- **¿Dónde queda el modelo?** En la tabla `modelos_ia` (pesos en JSON). Se reentrena cada 24 horas.
- **¿Qué pasa si se cae SQL Server?** El servidor no se cae: muestra un aviso, reintenta y se reconecta solo.

# Servicio de Inteligencia Artificial

La Exquisita integra **dos componentes de IA** que trabajan sobre la misma base de datos:

| Componente | Tipo | Qué hace |
|------------|------|----------|
| **Red neuronal de pronóstico de demanda** | Aprendizaje automático supervisado (perceptrón multicapa) | Aprende del historial de ventas y pronostica cuántas arepas de cada tamaño se venderán en los próximos 7 días. |
| **Asistente conversacional** | Procesamiento de lenguaje natural (reglas e intenciones; OpenAI opcional) | Responde preguntas en español con cifras reales de SQL Server, incluido el pronóstico de la red neuronal. |

---

## 1. Qué problema resuelve

Un negocio de arepas de choclo prepara su producto el mismo día. Si prepara **de más**, la masa y el queso sobrantes se pierden (mermas); si prepara **de menos**, pierde ventas y clientes. Hasta ahora la cantidad se decidía "a ojo".

La IA responde con datos tres preguntas diarias:

- ¿Cuántas arepas grandes y pequeñas preparo mañana?
- ¿Me alcanzan los insumos para eso?
- ¿Qué debo comprar?

## 2. Cómo se integra

```
SQL Server ──► ventas.repository.demandaDiaria()      historial: arepas por día y producto
     │
     ▼
pronostico.service.js ──► construye las variables de entrada
     │                    entrena redNeuronal.js (o carga el modelo guardado)
     │                    pronostica los próximos 7 días
     ▼
SQL Server ◄── ia.repository: guarda el modelo (modelos_ia) y el pronóstico (predicciones_demanda)
     │
     ▼
API REST:  GET /api/ia/pronostico   ·   POST /api/ia/entrenar (administrador)
     │
     ├──► Panel de Inicio: tarjeta "Producción sugerida para mañana"
     ├──► Asistente IA: "¿Cuántas arepas preparo mañana?"
     └──► Alertas de insumos que no alcanzan
```

- Es un **servicio interno del backend** (capa de negocio), igual que ventas o clientes. No depende de internet ni de servicios pagos.
- La red neuronal está programada **desde cero en JavaScript** (`backend/src/services/ia/redNeuronal.js`), sin librerías, para poder explicar cada paso.
- Se **reentrena sola** cada 24 horas o cuando cambian los productos, y el administrador puede reentrenarla con el botón *Reentrenar*.

## 3. Qué información procesa

**Datos de entrada** (desde SQL Server, últimos 120 días):

| Fuente | Dato |
|--------|------|
| `ventas` + `detalle_ventas` | Arepas vendidas por día y producto (paquetes x10 se convierten a unidades; se descuentan los reembolsos) |
| `productos` + `recetas` | Productos activos y cuánto insumo gasta una arepa |
| `insumos` | Stock actual de cada insumo |

**Variables de la red** (14 entradas por cada día y producto):

| # | Variable | Por qué |
|---|----------|---------|
| 1-7 | Día de la semana (codificación *one-hot*) | Los fines de semana se vende más |
| 8 | Ventas de ayer | Tendencia inmediata |
| 9 | Ventas del mismo día la semana pasada | Patrón semanal |
| 10 | Promedio de los últimos 7 días | Nivel reciente |
| 11 | Promedio de los últimos 28 días | Nivel de fondo |
| 12 | Promedio del mismo día de la semana (últimas 4 semanas) | Patrón semanal estable |
| 13-14 | Producto (grande / pequeña, *one-hot*) | Cada producto tiene su propia demanda |

Todas se normalizan (se dividen entre una escala) para que queden entre 0 y 1.

## 4. Qué resultado genera

```json
{
  "manana": {
    "fecha": "2026-11-20", "dia_semana": "viernes",
    "productos": [
      { "nombre": "Paquete Arepa Grande (x10)",  "unidades": 67, "paquetes": 7 },
      { "nombre": "Paquete Arepa Pequeña (x10)", "unidades": 50, "paquetes": 5 }
    ],
    "total_arepas": 117
  },
  "proximos_dias": [ "...7 días..." ],
  "insumos_manana": [ { "insumo": "Maíz Choclo", "necesita": 14.05, "stock": 50, "alcanza": true } ],
  "alertas": [],
  "modelo": { "arquitectura": "MLP 14-8-1 (tanh, Adam)", "metricas": { "mae_unidades": 4.57, "mejora_vs_promedio": 67.6 } }
}
```

## 5. Cómo utiliza el sistema ese resultado

1. **Panel de Inicio:** muestra cuántas arepas y paquetes preparar mañana por producto, una gráfica de los próximos 7 días y la calidad del modelo.
2. **Inventario:** con la receta, convierte el pronóstico en insumos necesarios y alerta si alguno no alcanza ("Para mañana faltan 2,5 Kg de Queso Cuajada").
3. **Asistente IA:** responde "¿cuántas arepas preparo mañana?" con el pronóstico de la red.
4. **Persistencia y control:** cada pronóstico se guarda en `predicciones_demanda`. Al día siguiente se puede comparar con lo vendido de verdad (`ia.repository.precisionReciente`).

---

## La red neuronal por dentro

**Arquitectura:** perceptrón multicapa **14 → 8 → 1**

- Capa de entrada: 14 variables.
- Capa oculta: 8 neuronas con activación **tanh**.
- Capa de salida: 1 neurona lineal (las arepas pronosticadas, normalizadas).

**Entrenamiento** (`redNeuronal.entrenar`):

1. **Inicialización de Xavier:** pesos aleatorios pequeños, con una semilla fija para que el resultado sea reproducible.
2. **Propagación hacia adelante:** cada neurona calcula `z = Σ(peso × entrada) + sesgo` y aplica `tanh(z)`.
3. **Función de pérdida:** error cuadrático medio (MSE) entre lo pronosticado y lo vendido.
4. **Retropropagación:** con la regla de la cadena se calcula el gradiente de cada peso. La derivada de `tanh` es `1 − a²`.
5. **Optimizador Adam:** actualiza cada peso según sus gradientes (tasa 0,01; β1 = 0,9; β2 = 0,999), en lotes de 16 ejemplos durante 300 épocas.

**Validación:** antes de guardar el modelo, se entrena sin los últimos 14 días y se mide el error en esos días que la red no vio. Se compara contra un método simple (el promedio de los últimos 7 días).

Resultado con un historial de práctica de 90 días, el mismo de las capturas de [`EVIDENCIAS.md`](EVIDENCIAS.md) (las cifras cambian según los datos; las actuales se ven en la tarjeta del Inicio):

| Métrica | Red neuronal | Promedio de 7 días |
|---------|--------------|--------------------|
| Error medio absoluto (MAE) | **±10,2 arepas** por producto y día | ±16,4 arepas |
| Mejora | **38,2 % menos error** | — |
| Precisión aproximada | **84 %** | — |

La red supera al promedio porque aprende el patrón semanal: sábado y domingo altos, lunes bajo.

**Persistencia del modelo:** los pesos, la escala y la lista de productos se guardan como JSON en la tabla `modelos_ia`, junto con sus métricas y la curva de error. Al reiniciar el servidor no hay que volver a entrenar.

**Requisito de datos:** empieza a aprender con ventas de **2 días** anteriores a hoy. Mientras tenga menos de 14 días, el pronóstico combina la red con el promedio reciente (el peso de la red sube con cada día, y desde 14 días decide sola). Así no da cifras sin sentido para días de la semana que aún no ha visto. La semana completa se muestra desde 7 días con ventas. Para tener un historial más largo en la demostración:

```bash
npm run historial-demo            # 90 días de ventas de práctica (origen = 'demo')
npm run historial-demo -- --borrar   # elimina solo las ventas de práctica
```

---

## El asistente conversacional

`backend/src/services/ia/motorLocal.js` funciona sin internet:

1. **Normaliza** la pregunta: minúsculas y sin tildes.
2. **Detecta la intención** con patrones: pronóstico, stock, ventas, capacidad, clientes, mermas, devoluciones, pendientes, precios, pagos, ranking o resumen.
3. **Extrae entidades:** periodo (hoy, ayer, semana, mes), tamaño (grande o pequeña), insumo y cliente mencionado.
4. **Responde con cifras exactas** del contexto que arma `contexto.service.js` en cada pregunta, en vivo desde SQL Server. Si la pregunta es de seguimiento ("¿y ayer?"), usa la intención de la pregunta anterior.

Si se configura `OPENAI_API_KEY`, el mismo contexto se envía a un modelo de lenguaje externo. Si falla, responde el motor local. La IA es de **solo lectura**: nunca modifica datos.

Pruebas de la IA: `backend/test/ia.test.js` (red neuronal y pronóstico) y PI-14 / PI-15 en `backend/pruebas/api.flujo.js`.

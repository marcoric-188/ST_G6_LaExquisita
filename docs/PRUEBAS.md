# Plan y resultados de pruebas

Se aplican tres niveles de prueba sobre los procesos principales del sistema transaccional:

| Nivel | Qué prueba | Herramienta | Comando | Resultado |
|-------|------------|-------------|---------|-----------|
| **Unitarias** | Reglas de negocio aisladas (sin base de datos) | `node:test` | `npm test` | **19 de 19** aprobadas |
| **Integración** | Procesos completos contra la API real y SQL Server | `node:test` + `fetch` | `npm run test:api` | **15 de 15** aprobadas |
| **Extremo a extremo** | Recorrido del usuario en un navegador real | Playwright (opcional) | `node pruebas/e2e.recorrido.js` | 7 de 7 pasos, sin errores en consola |

Los resultados completos están en [`evidencias/pruebas/`](evidencias/pruebas) y las capturas en [`evidencias/capturas/`](evidencias/capturas).

## Cómo ejecutarlas

```bash
cd backend
npm test
```

Para las de integración, el backend debe estar corriendo (`npm start`) y en `backend/.env` deben estar `PRUEBA_CORREO` y `PRUEBA_PASSWORD`. Luego, en otra terminal:

```bash
npm run test:api
```

> Las pruebas de integración crean un cliente "Prueba automática …" y algunas ventas de prueba en la base.

---

## Casos de prueba de integración (procesos transaccionales)

| ID | Proceso | Entrada | Resultado esperado | Obtenido |
|----|---------|---------|--------------------|----------|
| PI-01 | Conexión | `GET /api/health` | 200 y `conectada: true` | Aprobado |
| PI-02 | Seguridad | Consultar ventas sin iniciar sesión | 401 | Aprobado |
| PI-03 | Seguridad | Contraseña incorrecta | 401 | Aprobado |
| PI-04 | Inicio de sesión | Credenciales correctas | 200 y cookie `lx_session` httpOnly | Aprobado |
| PI-05 | Clientes | Registrar cliente; repetir su documento | 201; luego 409 (duplicado) | Aprobado |
| PI-06 | Venta | 1 paquete grande enviando `precio: 1` | Total = precio de la BD; el maíz baja 10 × 0,15 Kg | Aprobado |
| PI-07 | Venta (rollback) | 1.000 paquetes | 409 "Stock insuficiente" y no se crea ninguna venta | Aprobado |
| PI-08 | Estado pendiente | Venta con `estado: pendiente` | Se registra pendiente; el cliente no suma la compra | Aprobado |
| PI-09 | Completar | Devolver una pendiente; completarla; completarla otra vez | 409; 200 y el cliente suma; 409 | Aprobado |
| PI-10 | Devolución por producto dañado | Reposición de 1 paquete | Reembolso $0; insumos descontados otra vez | Aprobado |
| PI-11 | Devolución con reembolso | Reembolsar 1 unidad; intentar devolver 99 | Estado `devuelta_parcial`, neto = total − precio; luego 409 | Aprobado |
| PI-12 | Merma | 0,01 Kg de sal; luego más del stock | Stock baja 0,01; luego 409 | Aprobado |
| PI-13 | Validación | Nombre de 1 letra y teléfono "abc" | 400 con el error de cada campo | Aprobado |
| PI-14 | Asistente IA | "¿Cuánto vendimos hoy?" | Respuesta con las ventas de hoy desde la BD | Aprobado |
| PI-15 | Red neuronal | `GET /api/ia/pronostico` | Arepas enteras ≥ 0 por producto y métricas del modelo | Aprobado |

## Pruebas unitarias

| Archivo | Qué cubre |
|---------|-----------|
| `test/negocio.test.js` | Validación de entradas, precios y receta de una venta, unión de líneas repetidas, capacidad de producción, política de contraseñas, respuestas del asistente y preguntas de seguimiento |
| `test/devoluciones.test.js` | Reembolso parcial y total, reposición, no devolver más de lo vendido, estados permitidos al registrar, insumos de una reposición |
| `test/ia.test.js` | La red neuronal aprende (el error baja más de 100 veces), se guarda y carga en JSON sin cambios, es reproducible con semilla; construcción de la serie diaria y de las variables del pronóstico |

## Recorrido de extremo a extremo

`pruebas/e2e.recorrido.js` abre un navegador y hace como usuario:

1. Inicia sesión y revisa el pronóstico en Inicio.
2. Registra una venta **pendiente** con un paquete grande y 4 unidades pequeñas.
3. Filtra las pendientes y la **completa** con transferencia.
4. Registra una **devolución por producto dañado** con reposición.
5. Registra un **reembolso**.
6. Le pregunta al asistente IA por el pronóstico y las devoluciones.
7. Revisa la vista en celular (sin desplazamiento horizontal).

Además, durante el desarrollo se verificó:
- La migración sobre la base anterior del proyecto, con datos reales, se puede ejecutar dos veces sin errores.
- La migración sobre una base vacía funciona.
- El servidor se mantiene en pie y se reconecta solo cuando SQL Server se apaga.
- La conexión funciona con el driver ODBC 18 de Windows (`msnodesqlv8`).

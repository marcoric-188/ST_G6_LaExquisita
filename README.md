La Exquisita - Sistema Transaccional & ERP

Repositorio oficial del proyecto **La Exquisita**, un sistema transaccional modular (ERP / POS) orientado a la gestión de ventas de mostrador, control de inventario de materia prima y seguimiento de producción de alimentos preparados

---

## Información del Proyecto
* **Nombre del Sistema:** La Exquisita - Gestor de Ventas e Inventario de Alimentos
* **Alcance:** Arquitectura lógica, diseño transaccional y prototipo visual de interfaz para módulo POS e inventario de insumos.

---

## Propósito General
El objetivo de este sistema es controlar el flujo de caja y evitar la venta de productos agotados o descuadres de inventario en negocios de alimentos de rápida rotación (como arepas de choclo). 

Para responder a esta necesidad, el sistema contempla:
1. **Consistencia transaccional (Propiedades ACID)** en el registro de ventas.
2. **Validación de stock en tiempo real** previo a la confirmación de cada pedido.
3. **Descuento automático de materia prima** (maíz, queso, aceite, etc.) según recetas y formulaciones.
4. **Módulo de mermas** para el registro de pérdidas de insumos durante la producción.

---

## Elementos Principales de la Solución
El sistema está estructurado en los siguientes módulos operacionales:

* **Punto de Venta (POS):** Registro rápido de ventas en mostrador y gestión de clientes.
* **Gestión de Inventario e Insumos:** Control de existencias de materia prima y productos finales.
* **Órdenes de Producción y Mermas:** Registro del proceso de transformación de alimentos y control de desperdicios.
* **Historial y Reportes:** Consulta de transacciones realizadas y reportes de cierres de caja.

---

## Propuesta Visual e Interacción (Primera Interfaz)
Para esta primera entrega se desarrolló la propuesta visual de la interfaz (*Frontend*), la cual incluye:

* **Navegación principal:** Menú superior para alternar entre las secciones de POS, Inventario, Producción y Reportes.
* **Panel de control:** Tarjetas de acceso directo a las acciones principales (Apertura de caja, consulta de stock y registro de producción).
* **Vista POS:** Módulo visual para selección de productos y verificación de disponibilidad.

---

## Tecnologías Utilizadas
* **HTML5 / CSS3:** Maquetación y estilos de la interfaz inicial.
* **Git / GitHub:** Control de versiones y repositorio de código.

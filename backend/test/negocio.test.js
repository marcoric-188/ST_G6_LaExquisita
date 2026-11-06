/**
 * Pruebas unitarias de reglas de negocio (no necesitan SQL Server).
 * Ejecutar:  npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { validar } = require('../src/utils/validator');
const { prepararLineas, validarVenta } = require('../src/services/ventas.service');
const { calcularCapacidad } = require('../src/services/productos.service');
const { validarPolitica } = require('../src/services/auth.service');
const motor = require('../src/services/ia/motorLocal');

const PRODUCTOS = [
    { id_producto: 1, nombre: 'Paquete Arepa Grande (x10)', nombre_corto: 'Arepa Grande', tamano: 'grande', precio: 23000, precio_unidad: 2300, unidades_por_paquete: 10, activo: true },
    { id_producto: 2, nombre: 'Paquete Arepa Pequeña (x10)', nombre_corto: 'Arepa Pequeña', tamano: 'pequena', precio: 22000, precio_unidad: 2200, unidades_por_paquete: 10, activo: true }
];
const RECETAS = [
    { id_producto: 1, id_insumo: 10, insumo: 'Maíz Choclo', unidad_medida: 'Kg', cantidad_requerida: 0.15, stock_actual: 50 },
    { id_producto: 1, id_insumo: 11, insumo: 'Queso Cuajada', unidad_medida: 'Kg', cantidad_requerida: 0.04, stock_actual: 20 },
    { id_producto: 2, id_insumo: 10, insumo: 'Maíz Choclo', unidad_medida: 'Kg', cantidad_requerida: 0.08, stock_actual: 50 }
];

test('validador: limpia texto, convierte números y rechaza datos inválidos', () => {
    const datos = validar({ nombre: '  Tienda   Don Pepe ', cantidad: '2,5' }, {
        nombre: { tipo: 'texto', requerido: true, max: 100 },
        cantidad: { tipo: 'numero', min: 0 }
    });
    assert.equal(datos.nombre, 'Tienda Don Pepe');
    assert.equal(datos.cantidad, 2.5);
    assert.throws(() => validar({ correo: 'no-es-correo' }, { correo: { tipo: 'correo' } }), /formato válido/);
    assert.throws(() => validar({}, { nombre: { tipo: 'texto', requerido: true, etiqueta: 'El nombre' } }), /El nombre es obligatorio/);
});

test('venta: precios salen de la BD (paquete y unidad) y se descuentan insumos por receta', () => {
    const items = [
        { id_producto: 1, modalidad: 'paquete', cantidad: 2, precio: 1 }, // el "precio" del navegador se ignora
        { id_producto: 2, modalidad: 'unidad', cantidad: 5 }
    ];
    const { lineas, consumo, total } = prepararLineas(items, PRODUCTOS, RECETAS);
    assert.equal(total, 2 * 23000 + 5 * 2200);
    assert.equal(lineas[0].unidades, 20);
    assert.equal(lineas[1].nombre, 'Arepa Pequeña (unidad)');
    const maiz = consumo.find(c => c.id_insumo === 10);
    assert.equal(maiz.cantidad, 20 * 0.15 + 5 * 0.08); // 3.4 Kg
});

test('venta: une líneas repetidas y exige cliente y productos', () => {
    const datos = validarVenta({ id_cliente: 3, items: [
        { id_producto: 1, cantidad: 1 }, { id_producto: 1, cantidad: 2 }, { id_producto: 1, modalidad: 'unidad', cantidad: 4 }
    ] });
    assert.equal(datos.items.length, 2);
    assert.equal(datos.items.find(i => i.modalidad === 'paquete').cantidad, 3);
    assert.throws(() => validarVenta({ items: [{ id_producto: 1, cantidad: 1 }] }), /cliente/i);
    assert.throws(() => validarVenta({ id_cliente: 1, items: [] }), /al menos un producto/);
});

test('capacidad: el insumo que menos alcanza limita la producción', () => {
    const cap = calcularCapacidad(PRODUCTOS[0], RECETAS.filter(r => r.id_producto === 1));
    assert.equal(cap.unidades_disponibles, 333); // 50 / 0.15
    assert.equal(cap.paquetes_disponibles, 33);
    assert.equal(cap.insumo_limitante, 'Maíz Choclo');
});

test('contraseñas: política mínima', () => {
    assert.throws(() => validarPolitica('corta1'), /mínimo 8/);
    assert.throws(() => validarPolitica('soloLetras'), /letras y números/);
    assert.throws(() => validarPolitica('LaExquisita2026*'), /temporal/);
    assert.doesNotThrow(() => validarPolitica('Arepas2026'));
});

const CONTEXTO = {
    fecha_local: 'hoy',
    productos: [{ ...PRODUCTOS[0], receta: [{ id_insumo: 10, cantidad_por_unidad: 0.15 }], unidades_disponibles: 333, paquetes_disponibles: 33, insumo_limitante: 'Maíz Choclo' }],
    insumos: [
        { id_insumo: 10, nombre: 'Maíz Choclo', unidad_medida: 'Kg', stock_actual: 50, stock_minimo: 10, estado: 'ok', consumo_7_dias: 7, dias_cobertura: 50 },
        { id_insumo: 11, nombre: 'Queso Cuajada', unidad_medida: 'Kg', stock_actual: 3, stock_minimo: 5, estado: 'bajo', consumo_7_dias: 1, dias_cobertura: 21 }
    ],
    ventas: Object.fromEntries(['hoy', 'ayer', 'semana', 'mes', 'total'].map(p => [p, {
        ventas: p === 'ayer' ? 0 : 2, total: p === 'ayer' ? 0 : 57500, ticket_promedio: 28750,
        por_producto: p === 'ayer' ? [] : [{ id_producto: 1, nombre: 'Paquete Arepa Grande (x10)', tamano: 'grande', paquetes: 2, unidades_sueltas: 5, arepas: 25, total: 57500 }],
        metodos_pago: [{ metodo_pago: 'nequi', ventas: 2, total: 57500 }]
    }])),
    clientes: { estadisticas: { total: 1, nuevos_30_dias: 1, vip: 0, frecuentes: 0, regulares: 1, nuevos: 0 },
        lista: [{ id_cliente: 1, nombre: 'Tienda Don Pepe', tipo_cliente: 'negocio', rango: 'Regular', total_compras: 57500, numero_compras: 2, ultima_compra: null }] },
    mermas: { resumen_30_dias: [], recientes: [] }
};

test('IA local: responde cantidades exactas de la BD', () => {
    assert.match(motor.responder('¿Cuánto maíz hay?', CONTEXTO), /Maíz Choclo: hay 50 Kg/);
    assert.match(motor.responder('hola, ¿cuánto vendimos hoy?', CONTEXTO), /Ventas de hoy: 2 ventas por \$57\.500/);
    assert.match(motor.responder('¿cuántos paquetes grandes puedo hacer?', CONTEXTO), /33 paquetes/);
    assert.match(motor.responder('¿qué insumos están bajos?', CONTEXTO), /Queso Cuajada/);
    assert.match(motor.responder('¿cuánto ha comprado Tienda Don Pepe?', CONTEXTO), /Total comprado: \$57\.500/);
    assert.match(motor.responder('¿cuál es el producto más vendido?', CONTEXTO), /Productos más vendidos/);
});

test('IA local: entiende preguntas de seguimiento ("¿y ayer?")', () => {
    const historial = [{ role: 'user', content: '¿cuánto vendimos hoy?' }];
    assert.match(motor.responder('¿y ayer?', CONTEXTO, historial), /No hay ventas registradas ayer/);
});

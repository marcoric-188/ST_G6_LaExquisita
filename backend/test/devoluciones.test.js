/**
 * Pruebas unitarias de ESTADOS DE VENTA y DEVOLUCIONES (no necesitan SQL Server).
 * Ejecutar:  npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararDevolucion, validarVenta, calcularConsumo } = require('../src/services/ventas.service');

const LINEAS = [
    { id_detalle: 10, id_producto: 1, producto: 'Paquete Arepa Grande (x10)', cantidad: 2, unidades: 20, precio_unitario: 23000, cantidad_devuelta: 0 },
    { id_detalle: 11, id_producto: 2, producto: 'Arepa Pequeña (unidad)', cantidad: 4, unidades: 4, precio_unitario: 2200, cantidad_devuelta: 0 }
];

test('devolución con reembolso: calcula el dinero y deja la venta parcialmente devuelta', () => {
    const r = prepararDevolucion(LINEAS, [{ id_detalle: 11, cantidad: 2 }], 'reembolso');
    assert.equal(r.reembolso, 4400);
    assert.equal(r.devueltoTodo, false);
    assert.equal(r.lineas[0].unidades, 2);
});

test('devolución con reposición: no devuelve dinero', () => {
    const r = prepararDevolucion(LINEAS, [{ id_detalle: 10, cantidad: 1 }], 'reposicion');
    assert.equal(r.reembolso, 0);
    assert.equal(r.lineas[0].unidades, 10, 'un paquete = 10 arepas a reponer');
});

test('devolución total: si se reembolsa todo, la venta queda devuelta', () => {
    const r = prepararDevolucion(LINEAS, [{ id_detalle: 10, cantidad: 2 }, { id_detalle: 11, cantidad: 4 }], 'reembolso');
    assert.equal(r.devueltoTodo, true);
    assert.equal(r.reembolso, 2 * 23000 + 4 * 2200);
});

test('devolución: no deja devolver más de lo vendido (ni de otra venta)', () => {
    assert.throws(() => prepararDevolucion(LINEAS, [{ id_detalle: 10, cantidad: 3 }], 'reembolso'), /solo se pueden devolver 2/);
    const yaDevuelto = LINEAS.map(l => (l.id_detalle === 11 ? { ...l, cantidad_devuelta: 3 } : l));
    assert.throws(() => prepararDevolucion(yaDevuelto, [{ id_detalle: 11, cantidad: 2 }], 'reembolso'), /solo se pueden devolver 1/);
    assert.throws(() => prepararDevolucion(LINEAS, [{ id_detalle: 99, cantidad: 1 }], 'reembolso'), /no pertenece/);
});

test('estado de la venta: solo se acepta pendiente o completada al registrar', () => {
    assert.equal(validarVenta({ id_cliente: 1, items: [{ id_producto: 1, cantidad: 1 }] }).estado, 'completada');
    assert.equal(validarVenta({ id_cliente: 1, estado: 'pendiente', items: [{ id_producto: 1, cantidad: 1 }] }).estado, 'pendiente');
    assert.throws(() => validarVenta({ id_cliente: 1, estado: 'devuelta', items: [{ id_producto: 1, cantidad: 1 }] }), /estado/);
});

test('reposición: calcula los insumos de las arepas nuevas según la receta', () => {
    const recetas = [{ id_producto: 1, id_insumo: 5, insumo: 'Maíz Choclo', unidad_medida: 'Kg', cantidad_requerida: 0.15 }];
    const consumo = calcularConsumo([{ id_producto: 1, unidades: 10 }], recetas);
    assert.deepEqual(consumo, [{ id_insumo: 5, insumo: 'Maíz Choclo', unidad: 'Kg', cantidad: 1.5 }]);
});

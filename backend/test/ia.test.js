/**
 * Pruebas unitarias de la INTELIGENCIA ARTIFICIAL (no necesitan SQL Server).
 * Ejecutar:  npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { RedNeuronal } = require('../src/services/ia/redNeuronal');
const { construirSeries, armarEjemplos, variables, sumarDias } = require('../src/services/ia/pronostico.service');

test('red neuronal: aprende una función (el error baja más de 100 veces)', () => {
    const X = [];
    const Y = [];
    for (let i = 0; i < 60; i++) {
        const x = -3 + (6 * i) / 59;
        X.push([x / 3]);
        Y.push(Math.sin(x));
    }
    const red = new RedNeuronal({ entradas: 1, ocultas: [10, 6] });
    const r = red.entrenar(X, Y, { epocas: 600, tasa: 0.01 });
    assert.ok(r.errorFinal < r.errorInicial / 100, `error ${r.errorInicial} -> ${r.errorFinal}`);
    assert.ok(Math.abs(red.predecir([0.5]) - Math.sin(1.5)) < 0.1);
});

test('red neuronal: el modelo guardado en JSON predice exactamente igual', () => {
    const red = new RedNeuronal({ entradas: 3, ocultas: [4] });
    red.entrenar([[0, 0, 1], [1, 0, 0], [0, 1, 0]], [0.2, 0.5, 0.9], { epocas: 50 });
    const copia = RedNeuronal.desdeJSON(JSON.parse(JSON.stringify(red.aJSON())));
    assert.equal(copia.predecir([1, 1, 0]), red.predecir([1, 1, 0]));
    assert.equal(red.arquitectura, '3-4-1');
});

test('red neuronal: con la misma semilla da siempre el mismo resultado', () => {
    const a = new RedNeuronal({ entradas: 2, ocultas: [3], semilla: 9 });
    const b = new RedNeuronal({ entradas: 2, ocultas: [3], semilla: 9 });
    assert.deepEqual(a.aJSON(), b.aJSON());
});

test('pronóstico: los días sin ventas cuentan como 0 y la serie es continua', () => {
    const hasta = '2026-11-18';
    const filas = [
        { fecha: '2026-11-18', id_producto: 1, unidades: 30 },
        { fecha: '2026-11-16', id_producto: 1, unidades: 10 }
    ];
    const { fechas, series } = construirSeries(filas, [1, 2], hasta);
    assert.equal(fechas.length, 120);
    assert.equal(fechas[fechas.length - 1], hasta);
    assert.deepEqual(series.get(1).slice(-3), [10, 0, 30]);
    assert.ok(series.get(2).every(v => v === 0));
});

test('pronóstico: variables de entrada (día de la semana, rezagos, promedios, producto)', () => {
    const valores = Array.from({ length: 35 }, (_, i) => i);
    const x = variables(valores, 35, '2026-11-21', 1, 2, 100); // sábado, producto 2 de 2
    assert.equal(x.length, 7 + 5 + 2);
    assert.equal(x[6], 1, 'sábado marcado');
    assert.equal(x[7], 0.34, 'ventas de ayer / escala');
    assert.equal(x[8], 0.28, 'ventas de hace 7 días / escala');
    assert.deepEqual(x.slice(-2), [0, 1], 'producto en one-hot');
});

test('pronóstico: arma ejemplos solo cuando hay 28 días de historia', () => {
    const fechas = Array.from({ length: 40 }, (_, i) => sumarDias('2026-01-01', i));
    const series = new Map([[1, fechas.map((_, i) => i % 7)]]);
    const ejemplos = armarEjemplos(series, fechas, [1], 10);
    assert.equal(ejemplos.length, 40 - 28);
    assert.equal(ejemplos[0].fecha, fechas[28]);
});

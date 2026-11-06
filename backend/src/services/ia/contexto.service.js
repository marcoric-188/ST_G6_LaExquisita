/**
 * ============================================================================
 *  CAPA DE NEGOCIO · IA · Contexto del negocio
 * ----------------------------------------------------------------------------
 *  Reúne EN VIVO desde SQL Server todo lo que la IA necesita para responder
 *  con cantidades reales: inventario, recetas, capacidad de producción,
 *  ventas por periodo/producto/modalidad, métodos de pago, clientes y mermas.
 *  Se consulta en cada pregunta, así que siempre está actualizado.
 * ============================================================================
 */
const ventasRepo = require('../../repositories/ventas.repository');
const clientesRepo = require('../../repositories/clientes.repository');
const mermasRepo = require('../../repositories/mermas.repository');
const insumosService = require('../insumos.service');
const productosService = require('../productos.service');
const { agruparPorProducto } = require('../dashboard.service');

const PERIODOS = ['hoy', 'ayer', 'semana', 'mes', 'total'];

async function construirContexto() {
    const [productos, insumos, periodos, porProducto, metodos, serie, estadisticasClientes,
        clientes, mermasResumen, mermasRecientes] = await Promise.all([
        productosService.listarConDisponibilidad(),
        insumosService.listar(),
        ventasRepo.resumenPorPeriodo(),
        ventasRepo.productosPorPeriodo(),
        ventasRepo.metodosPorPeriodo(),
        ventasRepo.serieDiaria(7),
        clientesRepo.estadisticas(),
        clientesRepo.listar({ limite: 500 }),
        mermasRepo.resumenPorInsumo(30),
        mermasRepo.listar({ limite: 5 })
    ]);

    const ventas = {};
    for (const p of PERIODOS) {
        const base = periodos[p] || { ventas: 0, total: 0 };
        ventas[p] = {
            ...base,
            ticket_promedio: base.ventas ? Math.round(base.total / base.ventas) : 0,
            por_producto: agruparPorProducto(porProducto, p),
            metodos_pago: metodos.filter(m => m.periodo === p).map(({ metodo_pago, ventas: n, total }) => ({ metodo_pago, ventas: n, total }))
        };
    }

    const ahora = new Date();
    return {
        generado: ahora.toISOString(),
        fecha_local: ahora.toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' }),
        notas: [
            'semana = últimos 7 días incluyendo hoy; mes = últimos 30 días incluyendo hoy.',
            'Cada paquete trae 10 arepas. Las recetas indican el gasto de insumo por UNA arepa.',
            'paquetes_disponibles = paquetes que se pueden preparar con el stock actual de insumos.'
        ],
        productos,
        insumos,
        ventas,
        serie_7_dias: serie,
        clientes: { estadisticas: estadisticasClientes, lista: clientes },
        mermas: { resumen_30_dias: mermasResumen, recientes: mermasRecientes }
    };
}

/** Versión reducida para enviar a un modelo externo (sin datos personales masivos). */
function contextoParaModelo(contexto, clienteMencionado) {
    const { clientes, ...resto } = contexto;
    return {
        ...resto,
        clientes: {
            estadisticas: clientes.estadisticas,
            top_10: clientes.lista.slice(0, 10).map(c => ({
                nombre: c.nombre, rango: c.rango, total_compras: c.total_compras,
                numero_compras: c.numero_compras, ultima_compra: c.ultima_compra
            })),
            cliente_mencionado: clienteMencionado || null
        }
    };
}

module.exports = { construirContexto, contextoParaModelo };

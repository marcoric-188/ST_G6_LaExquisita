/**
 * CAPA DE NEGOCIO · Servicio del PANEL DE INICIO (indicadores en vivo)
 */
const ventasRepo = require('../repositories/ventas.repository');
const clientesRepo = require('../repositories/clientes.repository');
const mermasRepo = require('../repositories/mermas.repository');
const insumosService = require('./insumos.service');
const productosService = require('./productos.service');

/** Suma paquetes, unidades sueltas y arepas por producto para un periodo. */
function agruparPorProducto(filas, periodo) {
    const mapa = new Map();
    for (const f of filas.filter(x => x.periodo === periodo)) {
        const p = mapa.get(f.id_producto) || {
            id_producto: f.id_producto, nombre: f.nombre, nombre_corto: f.nombre_corto, tamano: f.tamano,
            paquetes: 0, unidades_sueltas: 0, arepas: 0, total: 0
        };
        if (f.modalidad === 'unidad') p.unidades_sueltas += f.cantidad;
        else p.paquetes += f.cantidad;
        p.arepas += f.unidades;
        p.total += f.total;
        mapa.set(f.id_producto, p);
    }
    return [...mapa.values()].sort((a, b) => b.arepas - a.arepas);
}

async function resumen() {
    const [periodos, serie, porProducto, insumos, clientes, ultimas, mermas, productos] = await Promise.all([
        ventasRepo.resumenPorPeriodo(),
        ventasRepo.serieDiaria(7),
        ventasRepo.productosPorPeriodo(),
        insumosService.listar(),
        clientesRepo.estadisticas(),
        ventasRepo.listar({ limite: 6 }),
        mermasRepo.resumenPorInsumo(30),
        productosService.listarConDisponibilidad()
    ]);

    const hoy = periodos.hoy || { ventas: 0, total: 0 };
    const mes = periodos.mes || { ventas: 0, total: 0 };
    const alertas = insumos.filter(i => i.estado !== 'ok');

    return {
        kpis: {
            ventas_hoy: hoy.ventas,
            total_hoy: hoy.total,
            ventas_mes: mes.ventas,
            total_mes: mes.total,
            ticket_promedio_mes: mes.ventas ? Math.round(mes.total / mes.ventas) : 0,
            clientes: clientes.total,
            clientes_nuevos_30_dias: clientes.nuevos_30_dias,
            insumos_en_alerta: alertas.length,
            mermas_30_dias: mermas.reduce((acc, m) => acc + m.registros, 0)
        },
        serie_7_dias: serie,
        productos_hoy: agruparPorProducto(porProducto, 'hoy'),
        productos_mes: agruparPorProducto(porProducto, 'mes'),
        insumos_alerta: alertas,
        ultimas_ventas: ultimas,
        disponibilidad: productos.map(p => ({
            id_producto: p.id_producto, nombre: p.nombre, paquetes_disponibles: p.paquetes_disponibles,
            unidades_disponibles: p.unidades_disponibles, insumo_limitante: p.insumo_limitante
        }))
    };
}

module.exports = { resumen, agruparPorProducto };

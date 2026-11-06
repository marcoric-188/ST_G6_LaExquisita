/**
 * ============================================================================
 *  VISTA · Terminal de Venta POS
 * ----------------------------------------------------------------------------
 *  1. Cliente: se busca y selecciona uno existente, o se registra uno nuevo.
 *  2. Productos: Paquete Arepa Grande / Pequeña, por PAQUETE (x10) o por UNIDAD,
 *     con cantidad. Los productos y precios vienen de SQL Server.
 *  3. Orden: se ajustan cantidades, se elige el método de pago y se confirma.
 *  Antes de enviar se valida que los insumos alcancen (según la receta);
 *  el servidor vuelve a validar todo dentro de una transacción.
 * ============================================================================
 */
import { $, html, on } from '../utils/dom.js';
import { dinero, numero, fechaHora, METODOS_PAGO } from '../utils/format.js';
import { estado } from '../core/store.js';
import { productosService } from '../services/productos.service.js';
import { ventasService } from '../services/ventas.service.js';
import { crearClientePicker } from '../components/clientePicker.js';
import { toast, abrirModal, cargando, rebotar, animarNumero, bloquesEsqueleto, vacio } from '../components/ui.js';

let productos = [];
const opciones = new Map();          // id_producto -> { modo, cantidad }
let carrito = [];                    // { clave, id_producto, modalidad, cantidad }
let metodoPago = 'efectivo';
let picker = null;
let ultimaClaveAgregada = null;

const MAX_CANTIDAD = 1000;
const producto = (id) => productos.find(p => p.id_producto === id);
const precioDe = (p, modo) => (modo === 'unidad' ? p.precio_unidad : p.precio);
const nombreLinea = (p, modo) => (modo === 'unidad' ? `${p.nombre_corto} (unidad)` : p.nombre);
const unidadesDe = (p, modo, cantidad) => (modo === 'unidad' ? cantidad : cantidad * p.unidades_por_paquete);
const limitar = (n) => Math.min(MAX_CANTIDAD, Math.max(1, Math.round(Number(n) || 1)));

/** Revisa con las recetas si los insumos alcanzan para todo el carrito. */
function insumoFaltante(lineas) {
    const consumo = new Map();
    for (const l of lineas) {
        const p = producto(l.id_producto);
        if (!p) continue;
        const arepas = unidadesDe(p, l.modalidad, l.cantidad);
        for (const r of p.receta) {
            const previo = consumo.get(r.id_insumo) || { ...r, necesita: 0 };
            previo.necesita += r.cantidad_por_unidad * arepas;
            consumo.set(r.id_insumo, previo);
        }
    }
    for (const c of consumo.values()) {
        if (c.necesita > c.stock_actual + 1e-9) return c;
    }
    return null;
}

/* ------------------------------ Catálogo ------------------------------ */
function textoDisponibilidad(p) {
    if (p.unidades_disponibles === null) return { clase: '', texto: 'Sin receta registrada' };
    if (p.unidades_disponibles === 0) return { clase: 'agotado', texto: 'Sin insumos suficientes' };
    return {
        clase: p.paquetes_disponibles < 5 ? 'bajo' : '',
        texto: `Alcanza para ${numero(p.paquetes_disponibles)} paq. · ${numero(p.unidades_disponibles)} und.`
    };
}

function tarjetaProducto(p) {
    const op = opciones.get(p.id_producto);
    const precio = precioDe(p, op.modo);
    const stock = textoDisponibilidad(p);
    const tamano = p.tamano === 'pequena' ? 'Pequeña' : p.tamano === 'grande' ? 'Grande' : p.categoria;
    return html`
    <article class="producto" data-id="${p.id_producto}">
        <div class="producto-img">
            <img src="${p.imagen || 'assets/img/arepa-grande.jpg'}" alt="${p.nombre}" loading="lazy">
            <span class="etiqueta-tamano">${tamano}</span>
            <span class="etiqueta-stock ${stock.clase}"><i class="fa-solid fa-fire-burner"></i> ${stock.texto}</span>
        </div>
        <div class="producto-cuerpo">
            <div>
                <h4>${p.nombre}</h4>
                <p>${p.descripcion || ''}</p>
            </div>
            <div class="segmentado" data-modo="${op.modo}" role="tablist" aria-label="Forma de venta">
                <span class="pildora"></span>
                <button type="button" data-modo-btn="paquete" class="${op.modo === 'paquete' ? 'activo' : ''}">Paquete x${p.unidades_por_paquete}</button>
                <button type="button" data-modo-btn="unidad" class="${op.modo === 'unidad' ? 'activo' : ''}" ${p.precio_unidad ? '' : 'disabled'}>Por unidad</button>
            </div>
            <div class="producto-pie">
                <div class="precio"><strong data-precio>${dinero(precio)}</strong><small data-precio-texto>${op.modo === 'unidad' ? 'por arepa' : `por paquete de ${p.unidades_por_paquete}`}</small></div>
                <div class="stepper">
                    <button type="button" data-paso="-1" aria-label="Quitar uno">−</button>
                    <input type="number" min="1" max="${MAX_CANTIDAD}" value="${op.cantidad}" data-cantidad aria-label="Cantidad">
                    <button type="button" data-paso="1" aria-label="Agregar uno">+</button>
                </div>
            </div>
            <button type="button" class="btn btn-primary btn-block" data-action="agregar" ${p.unidades_disponibles === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-cart-plus"></i> Agregar · <span data-subtotal>${dinero(precio * op.cantidad)}</span>
            </button>
        </div>
    </article>`;
}

function actualizarTarjeta(id) {
    const p = producto(id);
    const op = opciones.get(id);
    const card = $(`.producto[data-id="${id}"]`);
    if (!p || !card) return;
    const precio = precioDe(p, op.modo);
    const seg = $('.segmentado', card);
    seg.dataset.modo = op.modo;
    seg.querySelectorAll('[data-modo-btn]').forEach(b => b.classList.toggle('activo', b.dataset.modoBtn === op.modo));
    $('[data-precio]', card).textContent = dinero(precio);
    $('[data-precio-texto]', card).textContent = op.modo === 'unidad' ? 'por arepa' : `por paquete de ${p.unidades_por_paquete}`;
    $('[data-cantidad]', card).value = op.cantidad;
    $('[data-subtotal]', card).textContent = dinero(precio * op.cantidad);
    const precioEl = $('.precio', card);
    precioEl.classList.remove('cambio');
    void precioEl.offsetWidth; // reinicia la animación del precio
    precioEl.classList.add('cambio');
}

async function cargarProductos() {
    const grid = $('#pos-productos');
    if (!productos.length) grid.innerHTML = bloquesEsqueleto(2);
    try {
        productos = await productosService.listar();
        productos.forEach(p => { if (!opciones.has(p.id_producto)) opciones.set(p.id_producto, { modo: 'paquete', cantidad: 1 }); });
        grid.innerHTML = productos.length
            ? html`${productos.map(tarjetaProducto)}`
            : vacio('fa-box-open', 'No hay productos activos en la base de datos.');
        carrito = carrito.filter(l => producto(l.id_producto));
        pintarCarrito();
    } catch (error) {
        grid.innerHTML = vacio('fa-plug-circle-xmark', error.message);
    }
}

function agregar(id) {
    const p = producto(id);
    const op = opciones.get(id);
    const clave = `${id}|${op.modo}`;
    const existente = carrito.find(l => l.clave === clave);
    const propuesta = existente
        ? carrito.map(l => (l.clave === clave ? { ...l, cantidad: limitar(l.cantidad + op.cantidad) } : l))
        : [...carrito, { clave, id_producto: id, modalidad: op.modo, cantidad: op.cantidad }];

    const falta = insumoFaltante(propuesta);
    if (falta) {
        toast(`No alcanza el ${falta.insumo}: se necesitan ${numero(falta.necesita)} ${falta.unidad_medida} y hay ${numero(falta.stock_actual)}.`, 'error');
        return;
    }
    carrito = propuesta;
    ultimaClaveAgregada = clave;
    pintarCarrito();
    const etiqueta = op.modo === 'unidad' ? `${op.cantidad} × ${p.nombre_corto}` : `${op.cantidad} × ${p.nombre}`;
    toast(`Agregado: ${etiqueta}`, 'exito', 1800);
    opciones.set(id, { ...op, cantidad: 1 });
    actualizarTarjeta(id);
}

/* ------------------------------ Carrito ------------------------------ */
function pintarCarrito() {
    const contenedor = $('#carrito-items');
    let total = 0;
    let arepas = 0;

    if (!carrito.length) {
        contenedor.innerHTML = html`<div class="carrito-vacio"><i class="fa-solid fa-basket-shopping"></i>Agrega paquetes o unidades para empezar la venta.</div>`;
    } else {
        contenedor.innerHTML = html`${carrito.map((l) => {
            const p = producto(l.id_producto);
            const precio = precioDe(p, l.modalidad);
            const unidades = unidadesDe(p, l.modalidad, l.cantidad);
            total += precio * l.cantidad;
            arepas += unidades;
            return html`
            <div class="linea-carrito ${l.clave === ultimaClaveAgregada ? 'nueva' : ''}" data-clave="${l.clave}">
                <div>
                    <strong>${nombreLinea(p, l.modalidad)}</strong>
                    <div class="modalidad">${l.modalidad === 'unidad' ? 'Por unidad' : `Paquete x${p.unidades_por_paquete}`} · ${dinero(precio)} c/u</div>
                </div>
                <div class="subtotal">${dinero(precio * l.cantidad)}</div>
                <div class="controles">
                    <div class="stepper stepper-sm">
                        <button type="button" data-linea-paso="-1" aria-label="Quitar uno">−</button>
                        <input type="number" min="1" max="${MAX_CANTIDAD}" value="${l.cantidad}" data-linea-cantidad aria-label="Cantidad">
                        <button type="button" data-linea-paso="1" aria-label="Agregar uno">+</button>
                    </div>
                    <small class="texto-suave">${numero(unidades)} arepas</small>
                    <button type="button" class="quitar" data-action="quitar" aria-label="Quitar de la orden"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
        })}`;
    }
    ultimaClaveAgregada = null;

    const contador = $('#carrito-contador');
    const lineas = carrito.reduce((a, l) => a + l.cantidad, 0);
    if (contador.textContent !== String(lineas)) rebotar(contador);
    contador.textContent = lineas;
    animarNumero($('#carrito-total'), total, dinero, 500);
    $('#carrito-arepas').textContent = numero(arepas);
    actualizarBotonConfirmar();
}

function cambiarCantidadLinea(clave, cantidad) {
    const propuesta = carrito.map(l => (l.clave === clave ? { ...l, cantidad: limitar(cantidad) } : l));
    const falta = insumoFaltante(propuesta);
    if (falta) {
        toast(`No alcanza el ${falta.insumo} para esa cantidad.`, 'error');
        pintarCarrito();
        return;
    }
    carrito = propuesta;
    pintarCarrito();
}

function actualizarBotonConfirmar() {
    const cliente = picker && picker.obtener();
    const aviso = $('#carrito-aviso');
    $('#btn-confirmar-venta').disabled = !cliente || !carrito.length;
    if (carrito.length && !cliente) {
        aviso.textContent = 'Selecciona o registra el cliente para confirmar la venta.';
        aviso.hidden = false;
    } else {
        aviso.hidden = true;
    }
}

/* ------------------------------ Confirmación ------------------------------ */
function mostrarRecibo(venta) {
    const pago = METODOS_PAGO[venta.metodo_pago] || METODOS_PAGO.efectivo;
    const arepas = venta.items.reduce((a, i) => a + i.unidades, 0);
    $('#recibo-cuerpo').innerHTML = html`
        <div class="recibo-check"><i class="fa-solid fa-check"></i></div>
        <h3>¡Venta registrada!</h3>
        <p class="texto-suave">Venta #V-${String(venta.id_venta).padStart(4, '0')} · ${fechaHora(venta.fecha_hora)}</p>
        <table class="recibo-tabla">
            ${venta.items.map(i => html`<tr><td>${i.cantidad} × ${i.nombre}<br><small class="texto-suave">${numero(i.unidades)} arepas · ${dinero(i.precio_unitario)} c/u</small></td><td>${dinero(i.subtotal)}</td></tr>`)}
        </table>
        <div class="recibo-total"><span>Total</span><strong>${dinero(venta.total)}</strong></div>
        <div class="recibo-meta">
            <div><small>Cliente</small>${venta.cliente.nombre}</div>
            <div><small>Pago</small><i class="fa-solid ${pago.icono}"></i> ${pago.etiqueta}</div>
            <div><small>Vendedor</small>${estado.usuario ? estado.usuario.nombre : ''}</div>
            <div><small>Arepas</small>${numero(arepas)}</div>
        </div>
        <p class="texto-suave" style="margin-top:12px;font-size:12px"><i class="fa-solid fa-boxes-stacked"></i> Inventario actualizado: ${venta.insumos_descontados.map(c => `${c.insumo} −${numero(c.cantidad)} ${c.unidad}`).join(' · ') || 'sin receta'}</p>`;
    abrirModal('modal-recibo');
}

async function confirmarVenta() {
    const cliente = picker.obtener();
    if (!cliente) {
        toast('Selecciona o registra el cliente de la venta.', 'error');
        $('#cliente-buscar').focus();
        return;
    }
    if (!carrito.length) return;
    const falta = insumoFaltante(carrito);
    if (falta) {
        toast(`No alcanza el ${falta.insumo} para esta orden.`, 'error');
        return;
    }

    const boton = $('#btn-confirmar-venta');
    cargando(boton, true);
    try {
        const venta = await ventasService.registrar({ id_cliente: cliente.id_cliente, metodo_pago: metodoPago, items: carrito });
        mostrarRecibo(venta);
        carrito = [];
        picker.limpiar();
        await cargarProductos();
    } catch (error) {
        toast(error.message, 'error', 6000);
        if (error.status === 409) await cargarProductos();
    } finally {
        cargando(boton, false);
        actualizarBotonConfirmar();
    }
}

/* ------------------------------ Vista ------------------------------ */
export const posVista = {
    iniciar() {
        picker = crearClientePicker({ onCambio: actualizarBotonConfirmar });
        const grid = $('#pos-productos');

        on(grid, 'click', '[data-modo-btn]', (e, b) => {
            const id = Number(b.closest('.producto').dataset.id);
            opciones.set(id, { ...opciones.get(id), modo: b.dataset.modoBtn });
            actualizarTarjeta(id);
        });
        on(grid, 'click', '[data-paso]', (e, b) => {
            const id = Number(b.closest('.producto').dataset.id);
            const op = opciones.get(id);
            opciones.set(id, { ...op, cantidad: limitar(op.cantidad + Number(b.dataset.paso)) });
            actualizarTarjeta(id);
        });
        on(grid, 'change', '[data-cantidad]', (e, input) => {
            const id = Number(input.closest('.producto').dataset.id);
            opciones.set(id, { ...opciones.get(id), cantidad: limitar(input.value) });
            actualizarTarjeta(id);
        });
        on(grid, 'click', '[data-action="agregar"]', (e, b) => agregar(Number(b.closest('.producto').dataset.id)));

        const items = $('#carrito-items');
        on(items, 'click', '[data-linea-paso]', (e, b) => {
            const clave = b.closest('.linea-carrito').dataset.clave;
            const linea = carrito.find(l => l.clave === clave);
            const nueva = linea.cantidad + Number(b.dataset.lineaPaso);
            if (nueva < 1) return;
            cambiarCantidadLinea(clave, nueva);
        });
        on(items, 'change', '[data-linea-cantidad]', (e, input) => cambiarCantidadLinea(input.closest('.linea-carrito').dataset.clave, input.value));
        on(items, 'click', '[data-action="quitar"]', (e, b) => {
            const fila = b.closest('.linea-carrito');
            fila.classList.add('saliendo');
            fila.addEventListener('animationend', () => {
                carrito = carrito.filter(l => l.clave !== fila.dataset.clave);
                pintarCarrito();
            }, { once: true });
        });

        on($('#metodos-pago'), 'click', '[data-metodo]', (e, chip) => {
            metodoPago = chip.dataset.metodo;
            document.querySelectorAll('#metodos-pago .chip').forEach(c => {
                c.classList.toggle('activo', c === chip);
                c.setAttribute('aria-checked', String(c === chip));
            });
        });

        $('[data-action="vaciar-carrito"]').addEventListener('click', () => {
            carrito = [];
            pintarCarrito();
        });
        $('#btn-confirmar-venta').addEventListener('click', confirmarVenta);
        $('[data-action="imprimir-recibo"]').addEventListener('click', () => window.print());
        $('#modal-recibo').addEventListener('cerrado', () => $('#cliente-buscar').focus());
    },

    async mostrar() {
        await cargarProductos();
        if (estado.clientePendiente) {
            picker.seleccionar(estado.clientePendiente);
            estado.clientePendiente = null;
        } else if (!picker.obtener()) {
            setTimeout(() => $('#cliente-buscar').focus(), 80);
        }
    }
};

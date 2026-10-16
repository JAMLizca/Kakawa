// Tienda del comprador: productos liberados con su precio y solicitud de compra.
// Solo aparecen productos liberados, de lotes no bloqueados y con existencia (lo filtra el servidor).
import { api } from '../api.js';
import { abrirDialogo } from '../componentes/dialogo.js';
import { aviso, campo, datosDe, el, formato, titulo, vaciar } from '../ui.js';

export default async function vistaTienda(contenedor) {
  titulo('Tienda');
  const lista = el('div', { class: 'tienda', 'aria-live': 'polite' }, el('p', { class: 'cargando' }, 'Cargando el cacao disponible…'));

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Cacao disponible'),
        el('p', {}, 'Productos liberados por la asociación, con su origen verificable. Elija uno y envíe su solicitud.')),
      el('div', { class: 'acciones acciones--compactas' },
        el('a', { class: 'boton boton--secundario', href: '#/mis-solicitudes' }, 'Mis solicitudes'))),
    lista);

  function solicitar(p) {
    const total = el('p', { class: 'solicitud-total', 'aria-live': 'polite' });
    const cantidad = campo({ etiqueta: `Cantidad (${p.unidad})`, nombre: 'cantidad', tipo: 'number', min: '0.001', step: '0.001',
      max: String(p.cantidad_disponible), inputmode: 'decimal', ayuda: `Disponible: ${formato.kg(p.cantidad_disponible, p.unidad)}.` });
    const entrada = cantidad.querySelector('input');
    entrada.addEventListener('input', () => {
      const n = Number(entrada.value);
      total.textContent = p.precio_venta && n > 0 ? `Valor estimado: ${formato.cop(n * p.precio_venta)}` : '';
    });

    abrirDialogo({
      titulo: `Solicitar ${p.nombre}`,

      descripcion: 'La asociación revisa la solicitud y le responde. Nada se cobra en este paso.',
      campos: [
        cantidad,
        total,
        campo({ etiqueta: 'Mensaje para la asociación', nombre: 'mensaje', tipo: 'textarea', opcional: true, maxlength: 500,
          ayuda: 'Por ejemplo, dónde lo necesita o la fecha deseada.' }),
      ],
      textoConfirmar: 'Enviar solicitud',
      alConfirmar: async (formulario) => {
        const r = await api('/solicitudes', { metodo: 'POST', datos: { producto_id: p.codigo, ...datosDe(formulario) } });
        aviso(r.mensaje, 'exito');
      },
    });
  }

  function tarjeta(p, i) {
    const tarjeta = el('article', { class: 'producto-tarjeta', 'aria-labelledby': `prod-${p.codigo}` },
      el('div', { class: 'producto-tarjeta__arte', 'aria-hidden': 'true' },
        el('span', { class: 'producto-tarjeta__grano' }), el('span', { class: 'producto-tarjeta__grano' }), el('span', { class: 'producto-tarjeta__grano' })),
      el('div', { class: 'producto-tarjeta__cuerpo' },
        el('p', { class: 'producto-tarjeta__codigo cifra' }, p.codigo),
        el('h2', { id: `prod-${p.codigo}` }, p.nombre),
        el('p', { class: 'producto-tarjeta__origen' }, `${p.origen}, ${p.departamento}`),
        el('ul', { class: 'producto-tarjeta__datos' },
          el('li', {}, el('strong', { class: 'cifra' }, formato.kg(p.cantidad_disponible, p.unidad)), ' disponibles'),
          el('li', {}, el('strong', {}, String(p.etapas)), p.etapas === 1 ? ' etapa registrada' : ' etapas registradas')),
        el('p', { class: 'producto-tarjeta__precio' },
          p.precio_venta ? [el('span', { class: 'cifra' }, formato.cop(p.precio_venta)), el('small', {}, ` por ${p.unidad}`)] : 'Precio a convenir'),
        el('div', { class: 'producto-tarjeta__acciones' },
          el('button', { class: 'boton', type: 'button', onClick: () => solicitar(p) }, 'Solicitar compra'),
          el('a', { class: 'boton boton--secundario', href: `ficha.html?codigo=${encodeURIComponent(p.codigo)}` }, 'Ver origen'))));
    tarjeta.style.animationDelay = `${Math.min(i, 8) * 70}ms`;

    return tarjeta;
  }

  try {
    const { productos } = await api('/tienda/catalogo');
    vaciar(lista, productos.length
      ? productos.map(tarjeta)
      : el('div', { class: 'vacio' },
        el('h2', {}, 'Por ahora no hay cacao disponible'),
        el('p', {}, 'Cuando la asociación libere un nuevo producto aparecerá aquí.')));
  } catch (error) {
    vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
  }
}

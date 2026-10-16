// Ficha pública de un producto (RF06): origen y recorrido de trazabilidad.
// Solo muestra lo que entrega /api/publico: nunca costos, precios, responsables, incidencias ni usuarios.
// El código QR apunta a esta misma página para imprimirlo en la etiqueta del producto.
import { api } from './api.js';
import { codigoQr } from './componentes/qr.js';
import { sesion } from './sesion.js';
import { montarCabecera } from './sitio-cabecera.js';
import { el, formato, insignia, vaciar } from './ui.js';

montarCabecera();
const contenedor = document.getElementById('ficha');

function urlDeFicha(codigo) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('codigo', codigo);
  return url.toString();
}

function formularioConsulta(valor = '') {
  const id = 'consulta-codigo';
  const formulario = el('form', { class: 'consulta', role: 'search', 'aria-label': 'Consultar un producto' },
    el('label', { for: id }, 'Código del producto'),
    el('div', { class: 'consulta__fila' },
      el('input', { id, name: 'codigo', value: valor, required: true, maxlength: 30, autocomplete: 'off',
        autocapitalize: 'characters', placeholder: 'Por ejemplo CAC001-P01', 'aria-describedby': `${id}-ayuda` }),
      el('button', { class: 'boton', type: 'submit' }, 'Consultar')),
    el('p', { class: 'campo__ayuda', id: `${id}-ayuda` }, 'Está impreso en la etiqueta, junto al código QR.'));

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const codigo = formulario.elements.namedItem('codigo').value.trim().toUpperCase();
    if (codigo) location.search = `?codigo=${encodeURIComponent(codigo)}`;
  });
  return formulario;
}

/** Llamado a comprar: el comprador con sesión va a su tienda; los demás, a crear su cuenta. */
function llamadoCompra(f) {
  if (!f.disponible_para_venta) return null;
  const esCliente = sesion.activa() && sesion.usuario()?.rol === 'cliente';
  return el('aside', { class: 'ficha-compra', 'aria-label': 'Comprar este producto' },
    el('div', {},
      el('h2', {}, '¿Le interesa este cacao?'),
      el('p', {}, esCliente
        ? 'Envíe su solicitud desde la tienda; la asociación le responderá.'
        : 'Cree su cuenta de comprador para ver el precio y enviar su solicitud.')),
    el('a', { class: 'boton boton--claro', href: esCliente ? 'index.html#/tienda' : 'inicio.html#registro' },
      esCliente ? 'Ir a la tienda' : 'Crear cuenta para comprar'));
}

function recorrido(f) {
  const u = f.origen.unidad ?? f.presentacion.unidad;
  const pasos = [
    el('li', { class: 'traza__paso traza__paso--origen' },
      el('span', { class: 'traza__nodo', 'aria-hidden': 'true' }),
      el('div', { class: 'traza__tarjeta' },
        el('p', { class: 'traza__fecha' }, formato.fecha(f.origen.fecha_recepcion)),
        el('h3', {}, 'Recepción del cacao'),
        el('p', {}, `Lote ${f.origen.lote} de ${f.origen.municipio}`,
          f.origen.cantidad_recibida != null ? [', ', el('strong', { class: 'cifra' }, formato.kg(f.origen.cantidad_recibida, u)), ' recibidos.'] : '.'))),
    ...f.recorrido.map((e) => {
      const propio = e.producto === f.codigo;
      const conCantidades = e.cantidad_entrada != null && e.cantidad_salida != null;
      return el('li', { class: `traza__paso${propio ? ' traza__paso--propio' : ''}` },
        el('span', { class: 'traza__nodo', 'aria-hidden': 'true' }),
        el('div', { class: 'traza__tarjeta' },
          el('p', { class: 'traza__fecha' }, formato.fecha(e.fecha), propio ? el('span', { class: 'traza__marca' }, 'Este producto') : null),
          el('h3', {}, e.etapa),
          conCantidades ? el('div', { class: 'traza__flujo' },
            el('span', { class: 'traza__cantidad' }, el('small', {}, e.desde ?? 'Entrada'), el('strong', { class: 'cifra' }, formato.kg(e.cantidad_entrada, e.unidad ?? u))),
            el('span', { class: 'traza__flecha', 'aria-hidden': 'true' }),
            el('span', { class: 'traza__cantidad' }, el('small', {}, e.producto ?? 'Salida'), el('strong', { class: 'cifra' }, formato.kg(e.cantidad_salida, e.unidad ?? u)))) : null,
          e.merma != null ? el('div', { class: 'traza__merma' },
            el('span', { class: 'traza__barra', 'aria-hidden': 'true' }, el('span', { class: 'traza__relleno', dataset: { pct: String(Math.max(0, 100 - e.merma)) } })),
            el('span', {}, `Merma ${formato.pct(e.merma)}`)) : null));
    }),
  ];
  return el('section', { class: 'ficha-bloque ficha-bloque--traza', 'aria-labelledby': 'titulo-traza' },
    el('h2', { id: 'titulo-traza' }, 'Recorrido de trazabilidad'),
    el('p', { class: 'texto-suave' }, 'Cada etapa registrada por la asociación, desde la recepción del lote. Los datos internos (costos, responsables e incidencias) no se publican.'),
    el('ol', { class: 'traza' }, pasos));
}

function pintarFicha(f) {
  document.title = `${f.nombre} | Kakawa`;
  const estadoClase = f.disponible_para_venta ? 'disponible' : f.estado;

  const qr = codigoQr(urlDeFicha(f.codigo), { etiqueta: `Código QR de la ficha ${f.codigo}` });
  qr.classList.add('etiqueta__qr');

  vaciar(contenedor,
    el('nav', { class: 'miga-sitio', 'aria-label': 'Ruta' },
      el('a', { href: 'inicio.html#catalogo' }, 'Catálogo'), el('span', { 'aria-hidden': 'true' }, '/'), el('span', { 'aria-current': 'page' }, f.codigo)),

    el('header', { class: 'ficha-portada' },
      el('div', { class: 'ficha-portada__texto' },
        el('p', { class: 'ficha-portada__codigo cifra' }, f.codigo),
        el('h1', {}, f.nombre),
        el('p', { class: 'ficha-portada__origen' }, `${f.origen.municipio}, ${f.origen.departamento}`)),
      el('div', { class: `ficha-estado ficha-estado--${estadoClase}`, role: 'status' },
        insignia(f.estado),
        el('p', {}, f.mensaje),
        f.disponible_para_venta
          ? el('p', { class: 'ficha-estado__cantidad cifra' }, `${formato.kg(f.presentacion.cantidad_disponible, f.presentacion.unidad)} disponibles`)
          : null)),

    llamadoCompra(f),

    el('div', { class: 'ficha-rejilla' },
      recorrido(f),
      el('div', { class: 'ficha-lateral' },
        el('section', { class: 'ficha-bloque', 'aria-labelledby': 'titulo-origen' },
          el('h2', { id: 'titulo-origen' }, 'Origen'),
          el('dl', { class: 'ficha-datos' },
            el('div', {}, el('dt', {}, 'Municipio'), el('dd', {}, `${f.origen.municipio}, ${f.origen.departamento}`)),
            el('div', {}, el('dt', {}, 'Lote'), el('dd', { class: 'cifra' }, f.origen.lote)),
            el('div', {}, el('dt', {}, 'Recibido en la asociación'), el('dd', {}, formato.fecha(f.origen.fecha_recepcion))),
            f.origen.descripcion ? el('div', {}, el('dt', {}, 'Materia prima'), el('dd', {}, f.origen.descripcion)) : null)),

        el('section', { class: 'ficha-bloque etiqueta', 'aria-labelledby': 'titulo-etiqueta' },
          el('h2', { id: 'titulo-etiqueta' }, 'Etiqueta'),
          el('div', { class: 'etiqueta__contenido' },
            qr,
            el('div', { class: 'etiqueta__texto' },
              el('p', { class: 'etiqueta__nombre' }, f.nombre),
              el('p', { class: 'cifra' }, f.codigo),
              el('p', {}, `${f.origen.municipio}, ${f.origen.departamento}`),
              el('button', { class: 'boton boton--secundario boton--pequeno solo-pantalla', type: 'button', onClick: () => window.print() },
                'Imprimir etiqueta')))))),

    el('p', { class: 'ficha-aviso' }, f.aviso),
    el('section', { class: 'ficha-otra solo-pantalla', 'aria-label': 'Consultar otro producto' }, formularioConsulta()));

  // Las barras de rendimiento crecen hasta su valor (el ancho se fija por CSSOM: lo permite la CSP)
  contenedor.querySelectorAll('.traza__relleno').forEach((n) => { n.style.width = `${n.dataset.pct}%`; });
}

function pintarVacio(titulo, texto, codigo = '') {
  vaciar(contenedor,
    el('div', { class: 'ficha-consulta' },
      el('p', { class: 'antetitulo' }, 'Trazabilidad'),
      el('h1', {}, titulo),
      el('p', {}, texto),
      formularioConsulta(codigo),
      el('p', { class: 'texto-suave' }, 'También puede explorar el ', el('a', { href: 'inicio.html#catalogo' }, 'catálogo de productos disponibles'), '.')));
}

async function iniciar() {
  const codigo = new URLSearchParams(location.search).get('codigo')?.trim().toUpperCase();

  if (!codigo) {
    document.title = 'Consultar un código | Kakawa';
    pintarVacio('Consulte el origen de su cacao', 'Escriba el código del producto o escanee el código QR de la etiqueta.');
    contenedor.querySelector('input')?.focus();
    return;
  }

  try {
    pintarFicha(await api(`/publico/productos/${encodeURIComponent(codigo)}`));
  } catch (error) {
    document.title = 'Producto no encontrado | Kakawa';
    pintarVacio(error.estado === 404 ? 'No encontramos ese producto' : 'No pudimos consultar la ficha',
      error.estado === 404 ? `Revise el código "${codigo}". Debe tener la forma CAC001-P01.` : error.message, codigo);
  }
}

iniciar();

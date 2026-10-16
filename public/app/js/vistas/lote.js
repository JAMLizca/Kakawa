import { api } from '../api.js';
import { bloqueEconomico, bloqueMerma, listaAlertas } from '../componentes/analisis.js';
import { abrirDialogo } from '../componentes/dialogo.js';
import { sesion } from '../sesion.js';
import { aviso, campo, datosDe, el, formato, insignia, titulo, vaciar } from '../ui.js';

const ACCIONES = {
  crear: 'Creó',
  transformar: 'Transformó',
  cambiar_estado: 'Cambió el estado',
  cambiar_precio: 'Cambió el precio',
  respaldar: 'Respaldó',
  restaurar: 'Restauró',
};

export default async function vistaLote(contenedor, loteId) {
  titulo(`Lote ${loteId}`);
  const esAdmin = sesion.esAdmin();

  async function cargar() {
    vaciar(contenedor, el('p', { class: 'cargando' }, `Cargando ${loteId}…`));
    let datos;
    try {
      datos = await api(`/lotes/${encodeURIComponent(loteId)}`);
    } catch (error) {
      vaciar(contenedor, el('div', { class: 'vacio' },
        el('h1', {}, `Lote ${loteId}`), el('p', {}, error.message),
        el('a', { class: 'boton boton--secundario', href: '#/lotes' }, 'Volver a lotes')));
      return;
    }
    pintar(datos);
  }

  function pintar({ lote, inventario, etapas, productos, afectacion }) {
    const bloqueado = lote.estado === 'bloqueado';
    const hayExistencia = inventario.disponible > 0 || productos.some((p) => p.disponible > 0 && p.estado !== 'bloqueado');

    const acciones = el('div', { class: 'acciones acciones--compactas' },
      !bloqueado && hayExistencia
        ? el('a', { class: 'boton', href: `#/transformar/${encodeURIComponent(lote.id)}` }, 'Registrar transformación') : null,
      esAdmin && !bloqueado ? botonEstado('lote', lote.id, 'bloqueado', 'Bloquear lote', 'boton--peligro') : null,
      esAdmin && lote.estado !== 'liberado' ? botonEstado('lote', lote.id, 'liberado', 'Liberar lote', 'boton--exito') : null);

    vaciar(contenedor,
      el('p', { class: 'miga' }, el('a', { href: '#/lotes' }, 'Lotes'), ` / ${lote.id}`),
      el('div', { class: 'encabezado-vista' },
        el('div', {},
          el('h1', { class: 'titulo-con-estado' }, `Lote ${lote.id}`, insignia(lote.estado)),
          el('p', {}, `${lote.descripcion || 'Cacao'} de ${lote.productor}, ${lote.origen}. Recibido el ${formato.fecha(lote.fecha_recepcion)}.`)),
        acciones),

      bloqueado ? el('div', { class: 'aviso-estado aviso-estado--bloqueado', role: 'status' },
        el('p', {}, el('strong', {}, 'Lote bloqueado. '), lote.motivo_estado ? `Motivo: ${lote.motivo_estado}` : ''),
        el('p', {}, `Cantidades afectadas: ${formato.kg(afectacion.productos_total, afectacion.unidad)} en productos `
          + `(${formato.kg(afectacion.productos_disponible, afectacion.unidad)} sin vender) y `
          + `${formato.kg(afectacion.disponible_en_lote, afectacion.unidad)} sin transformar.`)) : null,

      el('section', { class: 'panel', 'aria-labelledby': 'titulo-balance' },
        el('h2', { id: 'titulo-balance' }, 'Recorrido y balance de masa'),
        el('p', { class: 'texto-suave' }, 'Cada barra es la cantidad de cacao en esa etapa. La parte rayada es lo que se perdió.'),
        balanceDeMasa(lote, inventario, etapas)),

      etapas.length ? el('section', { class: 'seccion', 'aria-labelledby': 'titulo-etapas' },
        el('h2', { id: 'titulo-etapas' }, 'Etapas registradas'),
        el('ol', { class: 'etapas' }, etapas.map(tarjetaEtapa))) : null,

      productos.length ? el('section', { class: 'seccion', 'aria-labelledby': 'titulo-productos' },
        el('h2', { id: 'titulo-productos' }, 'Productos de este lote'),
        tablaProductos(productos, bloqueado)) : null,

      esAdmin ? seccionHistorial(lote.id) : null,
    );

    pintarBarras(contenedor);
  }

  
  function balanceDeMasa(lote, inventario, etapas) {
    const escala = Math.max(lote.cantidad_recibida, ...etapas.flatMap((e) => [e.cantidad_entrada, e.cantidad_salida]), 1);
    const u = lote.unidad;

    const filas = [
      el('li', { class: 'balance__fila' },
        el('div', { class: 'balance__etiqueta' },
          el('strong', {}, 'Recepción'),
          el('span', { class: 'texto-suave' }, `${lote.origen}, ${formato.fecha(lote.fecha_recepcion)}`)),
        el('div', { class: 'balance__pista' },
          barra(lote.cantidad_recibida / escala, 'balance__masa'),
          el('span', { class: 'balance__cifra cifra' }, formato.kg(lote.cantidad_recibida, u)))),
    ];

    for (const e of etapas) {
      const perdida = Math.max(0, e.cantidad_entrada - e.cantidad_salida);
      const alerta = e.alertas.some((a) => a.tipo === 'merma');
      filas.push(el('li', { class: `balance__fila${alerta ? ' balance__fila--alerta' : ''}` },
        el('div', { class: 'balance__etiqueta' },
          el('strong', {}, e.etapa),
          el('span', { class: 'texto-suave' }, `${e.entrada_desde} a ${e.producto_salida}`)),
        el('div', { class: 'balance__pista' },
          barra(e.cantidad_salida / escala, 'balance__masa'),
          perdida > 0 ? barra(perdida / escala, 'balance__perdida') : null,
          el('span', { class: 'balance__cifra cifra' },
            `${formato.kg(e.cantidad_entrada, u)} a ${formato.kg(e.cantidad_salida, u)}`,
            el('span', { class: alerta ? 'balance__merma balance__merma--alta' : 'balance__merma' },
              e.merma.aplica ? `merma ${formato.pct(e.merma.valor)}` : 'con insumos')))));
    }

    filas.push(el('li', { class: 'balance__fila balance__fila--resumen' },
      el('div', { class: 'balance__etiqueta' }, el('strong', {}, 'Sin transformar')),
      el('div', { class: 'balance__pista' },
        barra(inventario.disponible / escala, 'balance__masa balance__masa--disponible'),
        el('span', { class: 'balance__cifra cifra' }, formato.kg(inventario.disponible, u)))));

    return el('ol', { class: 'balance', 'aria-label': 'Balance de masa por etapa' }, filas);
  }

  function barra(proporcion, clase) {
    return el('span', { class: `balance__barra ${clase}`, dataset: { proporcion: String(Math.max(0, proporcion)) }, 'aria-hidden': 'true' });
  }

  function pintarBarras(raiz) {
    raiz.querySelectorAll('[data-proporcion]').forEach((n) => {
      n.style.width = `${Math.min(1, Number(n.dataset.proporcion)) * 100}%`;
    });
  }

  // Etapa
  function tarjetaEtapa(e) {
    return el('li', { class: 'etapa' },
      el('div', { class: 'etapa__encabezado' },
        el('h3', {}, e.etapa),
        el('span', { class: 'texto-suave' }, `${formato.fecha(e.fecha)}, responsable: ${e.responsable}`)),
      el('div', { class: 'etapa__cuerpo' },
        el('dl', { class: 'datos' },
          el('div', {}, el('dt', {}, 'Entrada'), el('dd', { class: 'cifra' }, `${formato.kg(e.cantidad_entrada, e.unidad)} de ${e.entrada_desde}`)),
          el('div', {}, el('dt', {}, 'Salida'), el('dd', { class: 'cifra' }, `${formato.kg(e.cantidad_salida, e.unidad)} en ${e.producto_salida}`)),
          e.insumos_agregados ? el('div', {}, el('dt', {}, 'Insumos agregados'), el('dd', {}, e.insumos_agregados)) : null,
          e.incidencias ? el('div', {}, el('dt', {}, 'Incidencias'), el('dd', {}, e.incidencias)) : null),
        bloqueMerma(e.merma)),
      listaAlertas(e.alertas),
      bloqueEconomico(e.economico));
  }

  // Productos
  function tablaProductos(productos, loteBloqueado) {
    const filas = productos.map((p) => el('tr', {},
      el('th', { scope: 'row', 'data-etiqueta': 'Producto' }, p.id),
      el('td', { 'data-etiqueta': 'Nombre' }, p.nombre),
      el('td', { class: 'numero', 'data-etiqueta': 'Cantidad' }, formato.kg(p.cantidad, p.unidad)),
      el('td', { class: 'numero', 'data-etiqueta': 'Disponible' }, formato.kg(p.disponible, p.unidad)),
      esAdmin ? el('td', { class: 'numero', 'data-etiqueta': 'Precio' },
        p.precio_venta === null ? 'Sin precio' : `${formato.cop(p.precio_venta)}/${p.unidad}`) : null,
      el('td', { 'data-etiqueta': 'Estado' }, insignia(p.estado)),
      el('td', { class: 'tabla__acciones', 'data-etiqueta': 'Acciones' },
        el('div', { class: 'acciones-fila' },
          el('a', { class: 'boton boton--secundario boton--pequeno', href: `ficha.html?codigo=${encodeURIComponent(p.id)}`,
            target: '_blank', rel: 'noopener' }, 'Ficha pública'),
          esAdmin ? botonPrecio(p) : null,
          esAdmin && p.estado !== 'liberado' && !loteBloqueado
            ? botonEstado('producto', p.id, 'liberado', 'Liberar', 'boton--exito boton--pequeno') : null,
          esAdmin && p.estado !== 'bloqueado'
            ? botonEstado('producto', p.id, 'bloqueado', 'Bloquear', 'boton--peligro boton--pequeno') : null))));

    return el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla tabla--apilable' },
      el('caption', { class: 'visualmente-oculto' }, 'Productos del lote'),
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, 'Producto'), el('th', { scope: 'col' }, 'Nombre'),
        el('th', { scope: 'col', class: 'numero' }, 'Cantidad'), el('th', { scope: 'col', class: 'numero' }, 'Disponible'),
        esAdmin ? el('th', { scope: 'col', class: 'numero' }, 'Precio') : null,
        el('th', { scope: 'col' }, 'Estado'),
        el('th', { scope: 'col' }, el('span', { class: 'visualmente-oculto' }, 'Acciones')))),
      el('tbody', {}, filas)));
  }

  // Acciones del administrador 
  function botonEstado(tipo, id, estado, texto, variante) {
    return el('button', { class: `boton ${variante}`, type: 'button', onClick: () => dialogoEstado(tipo, id, estado) }, texto);
  }

  function dialogoEstado(tipo, id, estado) {
    const bloquear = estado === 'bloqueado';
    const nombre = tipo === 'lote' ? `el lote ${id}` : `el producto ${id}`;

    abrirDialogo({
      titulo: `${bloquear ? 'Bloquear' : 'Liberar'} ${nombre}`,
      descripcion: bloquear
        ? (tipo === 'lote'
          ? 'Todos los productos del lote quedarán bloqueados y el comprador verá que no están disponibles. El historial se conserva.'
          : 'El comprador verá el producto como no disponible.')
        : 'El producto quedará disponible para la venta.',
      campos: [
        campo({ etiqueta: 'Motivo', nombre: 'motivo', tipo: 'textarea', minlength: 5, maxlength: 255,
          ayuda: 'Queda registrado en el historial. Mínimo 5 caracteres.' }),
      ],
      textoConfirmar: bloquear ? 'Bloquear' : 'Liberar',
      variante: bloquear ? 'boton--peligro' : 'boton--exito',
      alConfirmar: async (formulario) => {
        const ruta = tipo === 'lote' ? `/lotes/${encodeURIComponent(id)}/estado` : `/productos/${encodeURIComponent(id)}/estado`;
        const respuesta = await api(ruta, { metodo: 'POST', datos: { ...datosDe(formulario), estado } });
        aviso(respuesta.mensaje, 'exito');
        await cargar();
      },
    });
  }

  function botonPrecio(p) {
    return el('button', {
      class: 'boton boton--secundario boton--pequeno', type: 'button',
      onClick: () => abrirDialogo({
        titulo: `Precio de venta de ${p.id}`,
        descripcion: 'Precio hipotético por kilogramo. Se usa para calcular el margen sobre venta.',
        campos: [
          campo({ etiqueta: 'Precio (COP por kg)', nombre: 'precio_venta', tipo: 'number', min: '1', step: '1', inputmode: 'numeric',
            value: p.precio_venta ?? '' }),
          campo({ etiqueta: 'Motivo', nombre: 'motivo', opcional: true, maxlength: 255 }),
        ],
        textoConfirmar: 'Guardar precio',
        alConfirmar: async (formulario) => {
          const respuesta = await api(`/productos/${encodeURIComponent(p.id)}/precio`, { metodo: 'PATCH', datos: datosDe(formulario) });
          aviso(respuesta.mensaje, 'exito');
          await cargar();
        },
      }),
    }, p.precio_venta === null ? 'Fijar precio' : 'Cambiar precio');
  }

  // Historial (RF10)
  function seccionHistorial(id) {
    const cuerpo = el('div', {}, el('p', { class: 'cargando' }, 'Cargando historial…'));
    const fila = (h) => el('tr', {},
      el('td', { 'data-etiqueta': 'Fecha' }, formato.fechaHora(h.created_at)),
      el('td', { 'data-etiqueta': 'Usuario' }, h.usuario),
      el('td', { 'data-etiqueta': 'Acción' }, ACCIONES[h.accion] ?? h.accion),
      el('td', { 'data-etiqueta': 'Sobre' }, `${h.entidad_id}${h.campo ? `, ${h.campo.replaceAll('_', ' ')}` : ''}`),
      el('td', { class: 'numero', 'data-etiqueta': 'Antes' }, h.valor_anterior ?? '—'),
      el('td', { class: 'numero', 'data-etiqueta': 'Después' }, h.valor_nuevo ?? '—'),
      el('td', { 'data-etiqueta': 'Motivo' }, h.motivo ?? '—'));

    const tabla = (historial) => el('div', { class: 'tabla-contenedor' },
      el('table', { class: 'tabla tabla--apilable tabla--densa' },
        el('caption', { class: 'visualmente-oculto' }, 'Historial de cambios'),
        el('thead', {}, el('tr', {}, ['Fecha', 'Usuario', 'Acción', 'Sobre', 'Antes', 'Después', 'Motivo']
          .map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', {}, historial.map(fila))));

    api(`/lotes/${encodeURIComponent(id)}/historial`)
      .then(({ historial }) => vaciar(cuerpo, historial.length
        ? tabla(historial)
        : el('p', { class: 'texto-suave' }, 'Sin cambios registrados.')))
      .catch((error) => vaciar(cuerpo, el('p', { class: 'texto-suave' }, error.message)));

    return el('section', { class: 'seccion', 'aria-labelledby': 'titulo-historial' },
      el('h2', { id: 'titulo-historial' }, 'Historial de cambios'),
      el('p', { class: 'texto-suave' }, 'Registro de auditoría: quién cambió qué y cuándo. No se puede borrar.'),
      cuerpo);
  }

  await cargar();
}

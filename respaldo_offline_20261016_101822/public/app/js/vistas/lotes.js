import { api, descargar } from '../api.js';
import { sesion } from '../sesion.js';
import {
  aviso, campo, datosDe, el, formato, hoy, insignia, limpiarErrores, mostrarErrores, ocupado, titulo, vaciar,
} from '../ui.js';

const ESTADOS = [['', 'Todos los estados'], ['pendiente', 'Pendiente'], ['liberado', 'Liberado'], ['bloqueado', 'Bloqueado']];

export default async function vistaLotes(contenedor) {
  titulo('Lotes');
  const esAdmin = sesion.esAdmin();
  const filtros = { origen: '', estado: '' };
  let resaltar = null;

  // Encabezados
  const botonNuevo = el('button', { class: 'boton', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'panel-recepcion' },
    'Registrar recepción');
  const botonCsv = esAdmin ? el('button', { class: 'boton boton--secundario', type: 'button' }, 'Exportar CSV') : null;

  const encabezado = el('div', { class: 'encabezado-vista' },
    el('div', {},
      el('h1', {}, 'Lotes'),
      el('p', {}, 'Cacao recibido, lo que queda disponible para transformar y su estado.')),
    el('div', { class: 'acciones acciones--compactas' }, botonNuevo, botonCsv));

  // Formulario de recepción (RF01) 
  const listaOrigenes = el('datalist', { id: 'origenes-conocidos' });
  const botonGuardar = el('button', { class: 'boton boton--exito', type: 'submit' }, 'Guardar lote');
  const botonCancelar = el('button', { class: 'boton boton--secundario', type: 'button' }, 'Cancelar');


  const formulario = el('form', { class: 'formulario formulario--columnas', novalidate: true },
    el('h2', { class: 'campo--ancho' }, 'Registrar recepción'),
    campo({ etiqueta: 'Productor', nombre: 'productor', maxlength: 120, autocomplete: 'off' }),
    campo({ etiqueta: 'Origen', nombre: 'origen', maxlength: 120, list: 'origenes-conocidos', autocomplete: 'off',
      ayuda: 'Municipio o finca, por ejemplo Rivera.' }),
    campo({ etiqueta: 'Cantidad recibida (kg)', nombre: 'cantidad_recibida', tipo: 'number', min: '0.001', step: '0.001',
      inputmode: 'decimal', ayuda: 'Debe ser mayor que cero.' }),
    campo({ etiqueta: 'Fecha de recepción', nombre: 'fecha_recepcion', tipo: 'date', max: hoy(), value: hoy() }),
    campo({ etiqueta: 'Identificador del lote', nombre: 'id', opcional: true, maxlength: 20, autocapitalize: 'characters',
      ayuda: 'Si lo deja vacío, Kakawa asigna el siguiente número (CAC004, CAC005…).' }),
    campo({ etiqueta: 'Descripción', nombre: 'descripcion', opcional: true, maxlength: 500, value: 'cacao seco' }),
    el('input', { type: 'hidden', name: 'unidad', value: 'kg' }),
    el('div', { class: 'acciones campo--ancho' }, botonGuardar, botonCancelar),
    listaOrigenes,
  );

  const panelRecepcion = el('section', { class: 'panel', id: 'panel-recepcion', hidden: true, 'aria-label': 'Registrar recepción' }, formulario);

  function abrirFormulario(abrir) {
    panelRecepcion.hidden = !abrir;
    botonNuevo.setAttribute('aria-expanded', String(abrir));
    if (abrir) formulario.elements.namedItem('productor').focus();
    else {
      formulario.reset();
      limpiarErrores(formulario);
      botonNuevo.focus();
    }
  }

  botonNuevo.addEventListener('click', () => abrirFormulario(panelRecepcion.hidden));
  botonCancelar.addEventListener('click', () => abrirFormulario(false));


  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarErrores(formulario);
    await ocupado(botonGuardar, 'Guardando…', async () => {
      try {
        const respuesta = await api('/lotes', { metodo: 'POST', datos: datosDe(formulario) });
        aviso(respuesta.mensaje, 'exito');
        resaltar = respuesta.lote.id;
        abrirFormulario(false);
        await cargar();
      } catch (error) {
        mostrarErrores(formulario, error);
      }
    });
  });

  // Filtros (RF11)
  const selectOrigen = el('select', { id: 'filtro-origen', name: 'origen' }, el('option', { value: '' }, 'Todos los orígenes'));
  const selectEstado = el('select', { id: 'filtro-estado', name: 'estado' }, ESTADOS.map(([v, t]) => el('option', { value: v }, t)));

  const barraFiltros = el('form', { class: 'filtros', role: 'search', 'aria-label': 'Filtrar lotes' },
    el('div', { class: 'campo' }, el('label', { for: 'filtro-origen' }, 'Origen'), selectOrigen),
    el('div', { class: 'campo' }, el('label', { for: 'filtro-estado' }, 'Estado'), selectEstado));
  barraFiltros.addEventListener('submit', (e) => e.preventDefault());

  [selectOrigen, selectEstado].forEach((s) => s.addEventListener('change', () => {
    filtros.origen = selectOrigen.value;
    filtros.estado = selectEstado.value;
    cargar();
  }));

  if (botonCsv) {

    botonCsv.addEventListener('click', () => ocupado(botonCsv, 'Preparando…', async () => {
      try {
        const nombre = await descargar(`/exportar/lotes.csv?${parametros()}`, 'kakawa_lotes.csv');
        aviso(`Descargado: ${nombre}`, 'exito');
      } catch (error) {
        aviso(error.message, 'error');
      }
    }));
  }

  // Resultados
  const resumen = el('p', { class: 'resumen', 'aria-live': 'polite' });
  const resultados = el('div', { class: 'resultados' });

  contenedor.append(encabezado, panelRecepcion, barraFiltros, resumen, resultados);

  function parametros() {
    const p = new URLSearchParams();
    if (filtros.origen) p.set('origen', filtros.origen);
    if (filtros.estado) p.set('estado', filtros.estado);
    return p.toString();
  }

  function pintarOrigenes(origenes) {
    const actual = selectOrigen.value;
    vaciar(selectOrigen, el('option', { value: '' }, 'Todos los orígenes'), origenes.map((o) => el('option', { value: o }, o)));
    selectOrigen.value = origenes.includes(actual) ? actual : '';
    vaciar(listaOrigenes, origenes.map((o) => el('option', { value: o })));
  }

  async function cargar() {
    resultados.setAttribute('aria-busy', 'true');

    try {
      const datos = await api(`/lotes${parametros() ? `?${parametros()}` : ''}`);
      pintarOrigenes(datos.origenes ?? []);
      pintarResultados(datos.lotes);
    } catch (error) {
      vaciar(resultados, el('div', { class: 'vacio' }, el('p', {}, error.message)));
      vaciar(resumen);
    } finally {
      resultados.removeAttribute('aria-busy');
    }
  }

  function pintarResultados(lotes) {
    const filtrado = Boolean(filtros.origen || filtros.estado);

    if (lotes.length === 0) {
      vaciar(resumen);
      vaciar(resultados, el('div', { class: 'vacio' },
        el('p', {}, filtrado ? 'Ningún lote coincide con el filtro.' : 'Todavía no hay lotes registrados.'),
        filtrado ? null : el('p', {}, 'Use "Registrar recepción" para cargar el primero.')));
      return;
    }

    const recibido = lotes.reduce((s, l) => s + l.recibido, 0);
    const disponible = lotes.reduce((s, l) => s + l.disponible, 0);
    vaciar(resumen,
      `${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}: `,
      el('strong', { class: 'cifra' }, formato.kg(recibido)), ' recibidos, ',
      el('strong', { class: 'cifra' }, formato.kg(disponible)), ' disponibles para transformar.');

    const filas = lotes.map((l) => {
      const proporcion = l.recibido > 0 ? Math.max(0, Math.min(1, l.disponible / l.recibido)) : 0;

      const puedeTransformar = l.disponible > 0 && l.estado !== 'bloqueado';

      return el('tr', { class: l.id === resaltar ? 'fila-nueva' : null },
        el('th', { scope: 'row', 'data-etiqueta': 'Lote' }, el('a', { href: `#/lotes/${encodeURIComponent(l.id)}` }, l.id)),
        el('td', { 'data-etiqueta': 'Origen' }, l.origen),
        el('td', { 'data-etiqueta': 'Productor' }, l.productor),
        el('td', { 'data-etiqueta': 'Recepción' }, formato.fecha(l.fecha_recepcion)),
        el('td', { class: 'numero', 'data-etiqueta': 'Recibido' }, formato.kg(l.recibido, l.unidad)),
        el('td', { class: 'numero', 'data-etiqueta': 'Disponible' },
          el('span', { class: 'inventario' },
            el('span', { class: 'inventario__cifra' }, formato.kg(l.disponible, l.unidad)),
            el('span', { class: 'inventario__barra', role: 'img',
              'aria-label': `${Math.round(proporcion * 100)} % de lo recibido sigue disponible` },
              el('span', { class: 'inventario__relleno', dataset: { proporcion: String(proporcion) } })))),
        el('td', { 'data-etiqueta': 'Estado' }, insignia(l.estado)),
        el('td', { class: 'tabla__acciones', 'data-etiqueta': 'Acciones' },
          puedeTransformar
            ? el('a', { class: 'boton boton--secundario boton--pequeno', href: `#/transformar/${encodeURIComponent(l.id)}`,
              'aria-label': `Transformar ${l.id}` }, 'Transformar')
            : (l.estado === 'bloqueado' ? null : el('span', { class: 'texto-suave' }, 'Sin existencia'))),
      );
    });

    const tabla = el('table', { class: 'tabla tabla--apilable' },
      el('caption', { class: 'visualmente-oculto' }, 'Lotes registrados'),
      el('thead', {}, el('tr', {},
        ['Lote', 'Origen', 'Productor', 'Recepción', 'Recibido', 'Disponible', 'Estado', ''].map((t, i) =>
          el('th', { scope: 'col', class: i === 4 || i === 5 ? 'numero' : null }, t || el('span', { class: 'visualmente-oculto' }, 'Acciones'))))),
      el('tbody', {}, filas));

    vaciar(resultados, el('div', { class: 'tabla-contenedor' }, tabla));



    resultados.querySelectorAll('.inventario__relleno').forEach((n) => {
      n.style.width = `${Number(n.dataset.proporcion) * 100}%`;
    });

    if (resaltar) {
      resultados.querySelector('.fila-nueva a')?.focus();
      resaltar = null;
    }
  }

  await cargar();
}

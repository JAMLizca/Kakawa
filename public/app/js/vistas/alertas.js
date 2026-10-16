import { api } from '../api.js';
import { el, formato, ocupado, titulo, vaciar } from '../ui.js';

// Prioridad: primero lo que afecta la calidad, después el dinero y al final los datos.
// Cada prioridad usa un tono de rojo o vinotinto: alta rojo intenso, media vinotinto, baja vino claro.
const TIPOS = {
  merma: { nombre: 'Merma alta', detalle: 'Pérdida mayor al umbral', icono: 'gota', prioridad: 'alta' },
  costo: { nombre: 'Costo sobre precio', detalle: 'Se vende por debajo del costo', icono: 'moneda', prioridad: 'media' },
  registro_incompleto: { nombre: 'Registro incompleto', detalle: 'Faltan datos para calcular', icono: 'lista', prioridad: 'baja' },
};
const ORDEN = Object.keys(TIPOS);

// Íconos dibujados con SVG (sin archivos externos y sin innerHTML).
const TRAZOS = {
  gota: ['M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z', 'M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5'],
  moneda: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5', 'M12 6.5v1.5M12 16v1.5'],
  lista: ['M9 4h6v3H9z', 'M7 5.5H5.5v15h13v-15H17', 'M8.5 11.5h7M8.5 15h4.5'],
  bien: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12.5l2.7 2.7L16 10'],
};
function icono(nombre) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icono');
  for (const d of TRAZOS[nombre]) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);

  }
  return svg;
}

export default async function vistaAlertas(contenedor) {
  titulo('Alertas');
  let filas = [];
  const activos = new Set();
  let busqueda = '';

  const botonActualizar = el('button', { class: 'boton boton--secundario', type: 'button' }, 'Actualizar');
  const total = el('p', { class: 'alertas-total', 'aria-live': 'polite' });
  const tarjetas = el('div', { class: 'alertas-resumen', role: 'group', 'aria-label': 'Filtrar por tipo de alerta' });
  const buscador = el('input', { id: 'buscar-alerta', type: 'search', placeholder: 'Buscar lote o producto',
    autocomplete: 'off', autocapitalize: 'characters' });
  const lista = el('div', { class: 'alertas-lista', 'aria-live': 'polite' });

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Alertas'),
        el('p', {}, 'Etapas que necesitan revisión. Cada alerta dice qué pasó y qué regla la activó.')),
      el('div', { class: 'acciones acciones--compactas' }, botonActualizar)),
    total,
    tarjetas,
    el('div', { class: 'alertas-buscador' },
      el('label', { for: 'buscar-alerta', class: 'visualmente-oculto' }, 'Buscar lote o producto'),
      buscador),
    lista);

  buscador.addEventListener('input', () => { busqueda = buscador.value.trim().toUpperCase(); pintarLista(); });
  botonActualizar.addEventListener('click', () => ocupado(botonActualizar, 'Actualizando…', cargar));


  function conteos() {
    const c = Object.fromEntries(ORDEN.map((t) => [t, 0]));
    filas.forEach((f) => f.alertas.forEach((a) => { c[a.tipo] = (c[a.tipo] ?? 0) + 1; }));
    return c;
  }

  function pintarResumen() {
    const c = conteos();
    const suma = Object.values(c).reduce((a, b) => a + b, 0);
    total.textContent = suma
      ? `${suma} ${suma === 1 ? 'alerta' : 'alertas'} en ${filas.length} ${filas.length === 1 ? 'etapa' : 'etapas'}`
      : '';

    vaciar(tarjetas, ORDEN.map((tipo) => {
      const t = TIPOS[tipo];
      const boton = el('button', {
        class: `alerta-tarjeta alerta-tarjeta--${tipo}${activos.has(tipo) ? ' alerta-tarjeta--activa' : ''}`,
        type: 'button', 'aria-pressed': String(activos.has(tipo)), disabled: c[tipo] === 0,
      },
        el('span', { class: 'alerta-tarjeta__icono' }, icono(t.icono)),
        el('span', { class: 'alerta-tarjeta__texto' },
          el('span', { class: `prioridad prioridad--${t.prioridad}` }, `Prioridad ${t.prioridad}`),
          el('span', { class: 'alerta-tarjeta__nombre' }, t.nombre),
          el('span', { class: 'alerta-tarjeta__detalle' }, t.detalle)),
        el('span', { class: 'alerta-tarjeta__cifra' }, String(c[tipo])));
      boton.addEventListener('click', () => {
        if (activos.has(tipo)) activos.delete(tipo); else activos.add(tipo);
        pintarResumen();
        pintarLista();
      });
      return boton;
    }));

  }

  function tarjetaAlerta(f, a, i) {
    const t = TIPOS[a.tipo] ?? { nombre: a.tipo, icono: 'lista', prioridad: 'baja' };
    return el('li', { class: `alerta-item alerta-item--${a.tipo}`, dataset: { orden: String(i) } },
      el('span', { class: 'alerta-item__icono' }, icono(t.icono)),
      el('div', { class: 'alerta-item__cuerpo' },
        el('div', { class: 'alerta-item__meta' },
          el('span', { class: `prioridad prioridad--${t.prioridad}` }, `Prioridad ${t.prioridad}`),
          el('span', { class: `alerta-chip alerta-chip--${a.tipo}` }, t.nombre),
          el('span', {}, `Etapa ${f.etapa}`),
          el('span', {}, formato.fecha(f.fecha))),
        el('p', { class: 'alerta-item__causa' }, a.causa),
        el('p', { class: 'alerta-item__regla' }, el('strong', {}, 'Regla: '), a.regla),
        el('div', { class: 'alerta-item__pie' },
          el('span', { class: 'alerta-item__producto' }, `Producto ${f.producto_id}`),
          el('a', { class: 'alerta-item__enlace', href: `#/lotes/${encodeURIComponent(f.lote_id)}` }, 'Revisar lote'))));
  }

  function pintarLista() {
    const visibles = filas
      .filter((f) => !busqueda || f.lote_id.includes(busqueda) || f.producto_id.includes(busqueda))
      .map((f) => ({ ...f, alertas: f.alertas.filter((a) => activos.size === 0 || activos.has(a.tipo)) }))
      .filter((f) => f.alertas.length > 0);

    if (filas.length === 0) {
      vaciar(lista, el('div', { class: 'alertas-vacio' },
        el('span', { class: 'alertas-vacio__icono' }, icono('bien')),
        el('h2', {}, 'Todo en orden'),
        el('p', {}, 'Ninguna etapa supera el umbral de merma ni tiene datos o costos pendientes.')));
      return;
    }
    if (visibles.length === 0) {

      vaciar(lista, el('div', { class: 'alertas-vacio alertas-vacio--filtro' },
        el('p', {}, 'Ninguna alerta coincide con el filtro.'),
        el('button', { class: 'boton boton--secundario boton--pequeno', type: 'button', onClick: () => {
          activos.clear(); busqueda = ''; buscador.value = ''; pintarResumen(); pintarLista();
        } }, 'Quitar filtros')));
      return;
    }

    // Agrupa por lote y ordena cada grupo por gravedad.
    const porLote = new Map();
    for (const f of visibles) {
      for (const a of f.alertas) {
        if (!porLote.has(f.lote_id)) porLote.set(f.lote_id, []);
        porLote.get(f.lote_id).push([f, a]);
      }
    }
    let i = 0;
    vaciar(lista, [...porLote.entries()].map(([loteId, items]) => {
      items.sort((x, y) => ORDEN.indexOf(x[1].tipo) - ORDEN.indexOf(y[1].tipo));
      return el('section', { class: 'alertas-grupo', 'aria-labelledby': `grupo-${loteId}` },
        el('header', { class: 'alertas-grupo__encabezado' },
          el('h2', { id: `grupo-${loteId}` }, el('a', { href: `#/lotes/${encodeURIComponent(loteId)}` }, `Lote ${loteId}`)),
          el('span', { class: 'alertas-grupo__cuenta' }, `${items.length} ${items.length === 1 ? 'alerta' : 'alertas'}`)),
        el('ul', { class: 'alertas-grupo__items' }, items.map(([f, a]) => tarjetaAlerta(f, a, i++))));
    }));
    // Entrada escalonada: cada tarjeta aparece un poco después de la anterior.
    lista.querySelectorAll('.alerta-item').forEach((n) => {
      n.style.animationDelay = `${Math.min(Number(n.dataset.orden), 10) * 50}ms`;
    });
  }

  async function cargar() {

    try {
      filas = (await api('/alertas')).transformaciones_con_alerta;
      pintarResumen();
      pintarLista();
    } catch (error) {
      vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
    }
  }

  vaciar(lista, el('p', { class: 'cargando' }, 'Cargando alertas…'));
  await cargar();
}

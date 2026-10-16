// Sincronización: lo que se registró sin conexión, lo que falta enviar, lo que el servidor rechazó
// (con el motivo) y lo ya enviado con su identificador real. Disponible para todos los roles.
import { cambiosLocales, descartar, reintentar, sincronizar, sincronizando } from '../offline/cola.js';
import { el, formato, ocupado, titulo, vaciar } from '../ui.js';

const kg = (v) => formato.kg(Number(v));

/** Descripción legible de cada cambio guardado. */
function describir(f) {
  const d = f.datos;
  const objetivo = f.id ?? d.id ?? '';
  switch (`${f.entidad}.${f.accion}`) {
    case 'lote.CREATE':
      return ['Recepción de lote', `${d.productor}, ${d.origen}: ${kg(d.cantidad_recibida)} recibidos el ${formato.fecha(d.fecha_recepcion)}`];
    case 'transformacion.CREATE':
      return [`Transformación: ${d.etapa}`, `${d.entrada_producto_id || d.lote_id}: ${kg(d.cantidad_entrada)} a ${kg(d.cantidad_salida)}, ${formato.fecha(d.fecha)}`];
    case 'lote.UPDATE':
    case 'producto.UPDATE':
      if (d.precio_venta !== undefined) return [`Precio de ${objetivo}`, `${formato.cop(Number(d.precio_venta))} por kg${d.motivo ? `. ${d.motivo}` : ''}`];
      return [`${d.estado === 'bloqueado' ? 'Bloquear' : 'Liberar'} ${f.entidad} ${objetivo}`, `Motivo: ${d.motivo}`];
    case 'solicitud.CREATE':
      return [`Solicitud de compra: ${d.producto_id}`, `${kg(d.cantidad)}${d.mensaje ? `. ${d.mensaje}` : ''}`];
    case 'solicitud.UPDATE':
      return [`${d.estado === 'aceptada' ? 'Aceptar' : 'Rechazar'} la solicitud ${objetivo}`, d.respuesta ?? ''];
    default:
      return [`${f.entidad} ${f.accion}`, ''];
  }
}

const ICONO = { pendiente: '…', rechazada: '!', aplicada: '✓' };

export default async function vistaSincronizacion(contenedor) {
  titulo('Sincronización');

  const botonSincronizar = el('button', { class: 'boton', type: 'button' }, 'Sincronizar ahora');
  const estado = el('p', { class: 'texto-suave', 'aria-live': 'polite' });
  const cifras = el('dl', { class: 'sync-cifras' });
  const cuerpo = el('div', {});

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Sincronización'),
        el('p', {}, 'Lo que registró sin conexión se guarda en este equipo y se envía al servidor cuando vuelve la conexión.')),
      el('div', { class: 'acciones acciones--compactas' }, botonSincronizar)),
    el('div', { class: 'sync-estado' }, estado),
    cifras,
    cuerpo);

  botonSincronizar.addEventListener('click', () => ocupado(botonSincronizar, 'Sincronizando…', async () => {
    await sincronizar();
    await pintar();
  }));

  function item(f) {
    const [tituloItem, detalle] = describir(f);
    const tipo = f.sincronizado ? 'aplicada' : (f.estado_sync === 'rechazada' ? 'rechazada' : 'pendiente');
    const acciones = [];

    if (tipo === 'rechazada') {
      acciones.push(el('button', { class: 'boton boton--secundario boton--pequeno', type: 'button',
        onClick: async (e) => { await ocupado(e.currentTarget, 'Enviando…', () => reintentar(f.tabla, f.clave)); } }, 'Reintentar'));
    }
    if (tipo !== 'aplicada') {
      acciones.push(el('button', { class: 'boton boton--peligro boton--pequeno', type: 'button',
        onClick: async () => {
          // Descartar es un borrado local: el cambio nunca llegó al servidor.
          if (window.confirm(`¿Descartar "${tituloItem}"? Este cambio no se enviará al servidor.`)) await descartar(f.tabla, f.clave);
        } }, 'Descartar'));
    }

    return el('li', { class: `sync-item sync-item--${tipo}` },
      el('span', { class: 'sync-item__icono', 'aria-hidden': 'true' }, ICONO[tipo]),
      el('div', {},
        el('p', { class: 'sync-item__titulo' }, tituloItem),
        el('p', { class: 'sync-item__detalle' }, detalle),
        el('p', { class: 'sync-item__detalle cifra' },
          tipo === 'aplicada'
            ? `${f.id_temporal} → ${f.id ?? 'aplicado'}${f.repetida ? ' (ya estaba registrado)' : ''}, ${formato.fechaHora(f.sincronizado_en)}`
            : `${f.id_temporal}, guardado ${formato.fechaHora(f.creado_en)}`),
        f.error ? el('p', { class: 'sync-item__error' }, f.error.mensaje) : null),
      acciones.length ? el('div', { class: 'sync-item__acciones' }, acciones) : null);
  }

  function seccion(tituloSeccion, filas, vacio) {
    return el('section', { class: 'seccion' },
      el('h2', {}, tituloSeccion),
      filas.length ? el('ol', { class: 'sync-lista' }, filas.map(item)) : el('p', { class: 'texto-suave' }, vacio));
  }

  async function pintar() {
    const filas = await cambiosLocales();
    const pendientes = filas.filter((f) => !f.sincronizado && f.estado_sync !== 'rechazada');
    const rechazadas = filas.filter((f) => !f.sincronizado && f.estado_sync === 'rechazada');
    const enviadas = filas.filter((f) => f.sincronizado).reverse().slice(0, 15);

    estado.textContent = navigator.onLine
      ? (sincronizando() ? 'Sincronizando…' : 'Con conexión.')
      : 'Sin conexión: los cambios quedan guardados en este equipo.';
    botonSincronizar.disabled = !navigator.onLine || pendientes.length === 0;

    vaciar(cifras,
      el('div', {}, el('dt', {}, 'Por enviar'), el('dd', { class: 'cifra' }, String(pendientes.length))),
      el('div', { class: 'sync-cifras--rechazo' }, el('dt', {}, 'Rechazados'), el('dd', { class: 'cifra' }, String(rechazadas.length))),
      el('div', {}, el('dt', {}, 'Enviados recientemente'), el('dd', { class: 'cifra' }, String(enviadas.length))));

    vaciar(cuerpo,
      rechazadas.length ? seccion('No se pudieron sincronizar', rechazadas, '') : null,
      seccion('Por enviar', pendientes, 'No hay cambios pendientes.'),
      seccion('Enviados recientemente', enviadas, 'Todavía no se ha sincronizado nada desde este equipo.'));
  }

  const repintar = () => { pintar(); };
  ['kakawa:cola', 'kakawa:sincronizado', 'kakawa:sincronizando', 'online', 'offline'].forEach((e) => window.addEventListener(e, repintar));
  await pintar();

  // Limpieza al salir de la vista.
  return () => ['kakawa:cola', 'kakawa:sincronizado', 'kakawa:sincronizando', 'online', 'offline']
    .forEach((e) => window.removeEventListener(e, repintar));
}

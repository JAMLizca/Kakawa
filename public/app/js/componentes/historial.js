import { el, formato } from '../ui.js';

export const ACCIONES = {
  crear: 'Creó',
  transformar: 'Transformó',
  cambiar_estado: 'Cambió el estado',
  cambiar_precio: 'Cambió el precio',
  respaldar: 'Respaldó',
  restaurar: 'Restauró',
};

function enlaceEntidad(h) {
  const loteId = h.entidad === 'lote' ? h.entidad_id : h.entidad === 'producto' ? h.entidad_id.split('-')[0] : null;
  return loteId ? el('a', { href: `#/lotes/${encodeURIComponent(loteId)}` }, h.entidad_id) : h.entidad_id;
}

export function tablaHistorial(registros, { titulo = 'Historial de cambios' } = {}) {
  return el('div', { class: 'tabla-contenedor' },
    el('table', { class: 'tabla tabla--apilable tabla--densa' },
      el('caption', { class: 'visualmente-oculto' }, titulo),
      el('thead', {}, el('tr', {}, ['Fecha', 'Usuario', 'Acción', 'Sobre', 'Campo', 'Antes', 'Después', 'Motivo']
        .map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, registros.map((h) => el('tr', {},
        el('td', { 'data-etiqueta': 'Fecha' }, formato.fechaHora(h.created_at)),
        el('td', { 'data-etiqueta': 'Usuario' }, h.usuario),
        el('td', { 'data-etiqueta': 'Acción' }, ACCIONES[h.accion] ?? h.accion),
        el('td', { 'data-etiqueta': 'Sobre' }, enlaceEntidad(h)),
        el('td', { 'data-etiqueta': 'Campo' }, h.campo ? h.campo.replaceAll('_', ' ') : '—'),
        el('td', { class: 'numero', 'data-etiqueta': 'Antes' }, h.valor_anterior ?? '—'),
        el('td', { class: 'numero', 'data-etiqueta': 'Después' }, h.valor_nuevo ?? '—'),
        el('td', { 'data-etiqueta': 'Motivo' }, h.motivo ?? '—'))))));
}
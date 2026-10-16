// Solicitudes de compra del comprador, con la respuesta de la asociación.
import { api } from '../api.js';
import { el, formato, titulo, vaciar } from '../ui.js';

export const ESTADOS_SOLICITUD = {
  pendiente: 'En revisión',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

export function chipSolicitud(estado) {
  return el('span', { class: `chip-solicitud chip-solicitud--${estado}` }, ESTADOS_SOLICITUD[estado] ?? estado);
}

export default async function vistaMisSolicitudes(contenedor) {
  titulo('Mis solicitudes');
  const lista = el('div', { class: 'solicitudes', 'aria-live': 'polite' }, el('p', { class: 'cargando' }, 'Cargando sus solicitudes…'));

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Mis solicitudes'),
        el('p', {}, 'El estado de cada solicitud y la respuesta de la asociación.')),
      el('div', { class: 'acciones acciones--compactas' }, el('a', { class: 'boton', href: '#/tienda' }, 'Ir a la tienda'))),
    lista);

  try {
    const { solicitudes } = await api('/mis-solicitudes');
    if (!solicitudes.length) {
      vaciar(lista, el('div', { class: 'vacio' },
        el('h2', {}, 'Aún no ha enviado solicitudes'),

        el('p', {}, 'Elija un producto en la tienda y envíe su primera solicitud.'),
        el('a', { class: 'boton', href: '#/tienda' }, 'Ver productos')));
      return;
    }
    vaciar(lista, solicitudes.map((s, i) => {
      const nodo = el('article', { class: `solicitud solicitud--${s.estado}` },
        el('header', { class: 'solicitud__encabezado' },
          el('div', {},
            el('h2', {}, s.producto ?? s.producto_id),
            el('p', { class: 'texto-suave cifra' }, `${s.producto_id}, solicitud ${s.id}, ${formato.fechaHora(s.creada)}`)),
          chipSolicitud(s.estado)),
        el('p', { class: 'solicitud__cantidad' }, el('strong', { class: 'cifra' }, formato.kg(s.cantidad, s.unidad)), ' solicitados'),
        s.mensaje ? el('p', { class: 'solicitud__mensaje' }, s.mensaje) : null,
        s.respuesta
          ? el('div', { class: 'solicitud__respuesta' }, el('strong', {}, 'Respuesta de la asociación'), el('p', {}, s.respuesta))
          : s.estado === 'pendiente' ? el('p', { class: 'texto-suave' }, 'La asociación aún no responde.') : null);
      nodo.style.animationDelay = `${Math.min(i, 8) * 60}ms`;
      return nodo;
    }));
  } catch (error) {
    vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
  }
}

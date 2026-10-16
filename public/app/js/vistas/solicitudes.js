// Bandeja del administrador: solicitudes de compra con datos de contacto, para aceptar o rechazar.
// Aceptar vuelve a validar en el servidor que el producto siga liberado (escenario de la hora 12).
import { api } from '../api.js';
import { abrirDialogo } from '../componentes/dialogo.js';
import { aviso, campo, datosDe, el, formato, ocupado, titulo, vaciar } from '../ui.js';
import { ESTADOS_SOLICITUD, chipSolicitud } from './mis-solicitudes.js';

const FILTROS = [['', 'Todas'], ['pendiente', 'En revisión'], ['aceptada', 'Aceptadas'], ['rechazada', 'Rechazadas']];

export default async function vistaSolicitudes(contenedor) {
  titulo('Solicitudes');
  let todas = [];
  let filtro = 'pendiente';

  const filtros = el('div', { class: 'filtro-chips', role: 'group', 'aria-label': 'Filtrar por estado' });
  const lista = el('div', { class: 'solicitudes', 'aria-live': 'polite' }, el('p', { class: 'cargando' }, 'Cargando solicitudes…'));
  const actualizar = el('button', { class: 'boton boton--secundario', type: 'button' }, 'Actualizar');
  actualizar.addEventListener('click', () => ocupado(actualizar, 'Actualizando…', cargar));

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Solicitudes de compra'),
        el('p', {}, 'Pedidos de los compradores registrados. Un producto bloqueado no se puede aceptar.')),
      el('div', { class: 'acciones acciones--compactas' }, actualizar)),
    filtros, lista);

  function responder(s, estado) {
    const aceptar = estado === 'aceptada';
    abrirDialogo({
      titulo: aceptar ? `Aceptar la solicitud ${s.id}` : `Rechazar la solicitud ${s.id}`,

      descripcion: `${s.cliente.nombre} pide ${formato.kg(s.cantidad, s.unidad)} de ${s.producto_id}.`,
      campos: [campo({ etiqueta: aceptar ? 'Mensaje para el comprador' : 'Motivo del rechazo', nombre: 'respuesta', tipo: 'textarea',
        opcional: aceptar, maxlength: 500, ayuda: aceptar ? 'Por ejemplo, cómo y cuándo se entrega.' : 'El comprador verá este motivo.' })],
      textoConfirmar: aceptar ? 'Aceptar' : 'Rechazar',
      variante: aceptar ? 'boton--exito' : 'boton--peligro',
      alConfirmar: async (formulario) => {
        const r = await api(`/solicitudes/${s.id}/respuesta`, { metodo: 'POST', datos: { estado, ...datosDe(formulario) } });
        aviso(r.mensaje, aceptar ? 'exito' : 'info');
        await cargar();
      },
    });
  }

  function pintar() {
    vaciar(filtros, FILTROS.map(([valor, texto]) => {
      const n = valor ? todas.filter((s) => s.estado === valor).length : todas.length;
      return el('button', { class: 'filtro-chip', type: 'button', 'aria-pressed': String(filtro === valor),
        onClick: () => { filtro = valor; pintar(); } }, texto, el('span', { class: 'filtro-chip__n cifra' }, String(n)));
    }));

    const visibles = filtro ? todas.filter((s) => s.estado === filtro) : todas;
    if (!visibles.length) {
      vaciar(lista, el('div', { class: 'vacio' }, el('p', {},
        filtro === 'pendiente' ? 'No hay solicitudes por revisar.' : `No hay solicitudes ${(ESTADOS_SOLICITUD[filtro] ?? '').toLowerCase()}.`)));
      return;
    }
    vaciar(lista, visibles.map((s, i) => {
      const nodo = el('article', { class: `solicitud solicitud--${s.estado}` },
        el('header', { class: 'solicitud__encabezado' },
          el('div', {},
            el('h2', {}, `${s.producto ?? s.producto_id}`),
            el('p', { class: 'texto-suave cifra' }, `${s.producto_id}, solicitud ${s.id}, ${formato.fechaHora(s.creada)}`)),

          chipSolicitud(s.estado)),
        el('div', { class: 'solicitud__detalle' },
          el('p', { class: 'solicitud__cantidad' }, el('strong', { class: 'cifra' }, formato.kg(s.cantidad, s.unidad))),
          el('div', { class: 'solicitud__cliente' },
            el('strong', {}, s.cliente.nombre),
            s.cliente.correo ? el('a', { href: `mailto:${s.cliente.correo}` }, s.cliente.correo) : null,
            s.cliente.telefono ? el('a', { href: `tel:${s.cliente.telefono.replace(/[^0-9+]/g, '')}` }, s.cliente.telefono) : null)),
        s.mensaje ? el('p', { class: 'solicitud__mensaje' }, s.mensaje) : null,
        s.respuesta ? el('div', { class: 'solicitud__respuesta' }, el('strong', {}, 'Respuesta enviada'), el('p', {}, s.respuesta)) : null,
        s.estado === 'pendiente'
          ? el('div', { class: 'acciones' },
            el('button', { class: 'boton boton--exito', type: 'button', onClick: () => responder(s, 'aceptada') }, 'Aceptar'),
            el('button', { class: 'boton boton--secundario', type: 'button', onClick: () => responder(s, 'rechazada') }, 'Rechazar'))
          : null);
      nodo.style.animationDelay = `${Math.min(i, 8) * 60}ms`;
      return nodo;
    }));
  }

  async function cargar() {
    try {
      todas = (await api('/solicitudes')).solicitudes;
      pintar();
    } catch (error) {
      vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
    }
  }

  await cargar();
}

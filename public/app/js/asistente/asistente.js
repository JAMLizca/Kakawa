// Asistente de Kakawa (solo en inicio.html). Botón flotante con el logo y una ventana de chat.
// Con conexión consulta el catálogo y las fichas en el servidor; sin conexión usa la copia
// guardada en el equipo (api.js + IndexedDB). Las respuestas se arman en el navegador (motor.js).
import { api } from '../api.js';
import { sesion } from '../sesion.js';
import { el } from '../ui.js';
import { responder, SUGERENCIAS_INICIALES } from './motor.js';

const CLAVE_HISTORIAL = 'kakawa.asistente';
const MAX_MENSAJES = 40;

const contexto = {
  catalogo: () => api('/publico/catalogo'),
  ficha: (codigo) => api(`/publico/productos/${encodeURIComponent(codigo)}`),
  usuario: () => (sesion.activa() ? sesion.usuario() : null),
  esperaCodigo: false,
};

// ---------- Historial de la pestaña (sessionStorage) ----------
function leerHistorial() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_HISTORIAL) ?? '[]');
  } catch {
    return [];
  }
}
function guardarHistorial(mensajes) {
  try {
    sessionStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(mensajes.slice(-MAX_MENSAJES)));
  } catch {
    /* sin almacenamiento: el chat dura mientras la página esté abierta */
  }
}

// ---------- Interfaz ----------
const boton = el('button', {
  class: 'asistente-boton', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'asistente',
  'aria-label': 'Abrir el asistente de Kakawa',
}, el('img', { src: 'img/Logo.svg', alt: '', width: 34, height: 34 }),
el('span', { class: 'asistente-boton__globo', 'aria-hidden': 'true' }, '¿Preguntas?'));

const estado = el('p', { class: 'asistente__estado' });
const registro = el('ol', { class: 'asistente__mensajes', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación' });
const entrada = el('input', { id: 'asistente-texto', class: 'asistente__entrada', type: 'text', maxlength: 200,
  autocomplete: 'off', placeholder: 'Escriba su pregunta o un código' });
const enviar = el('button', { class: 'asistente__enviar', type: 'submit', 'aria-label': 'Enviar' });
const formulario = el('form', { class: 'asistente__formulario' },
  el('label', { for: 'asistente-texto', class: 'visualmente-oculto' }, 'Pregunta para el asistente'), entrada, enviar);
const cerrar = el('button', { class: 'asistente__cerrar', type: 'button', 'aria-label': 'Cerrar el asistente' });
const reiniciar = el('button', { class: 'asistente__reiniciar', type: 'button' }, 'Nueva conversación');

const ventana = el('section', { class: 'asistente', id: 'asistente', role: 'dialog', 'aria-modal': 'false',
  'aria-labelledby': 'asistente-titulo', hidden: true },
el('header', { class: 'asistente__cabecera' },
  el('img', { class: 'asistente__logo', src: 'img/Logo.svg', alt: '', width: 36, height: 36 }),
  el('div', {}, el('h2', { id: 'asistente-titulo' }, 'Asistente Kakawa'), estado),
  cerrar),
registro,
el('div', { class: 'asistente__pie' }, formulario, reiniciar));

let mensajes = leerHistorial();

function pintarEstado() {
  const enLinea = navigator.onLine;
  estado.textContent = enLinea ? 'En línea' : 'Sin conexión · usa los datos guardados';
  estado.classList.toggle('asistente__estado--sin-red', !enLinea);
}

function accion(a) {
  if (a.tipo === 'enlace') return el('a', { class: 'asistente__accion', href: a.destino }, a.texto);
  const b = el('button', { class: 'asistente__accion', type: 'button' }, a.texto);
  b.addEventListener('click', () => {
    if (a.tipo === 'pregunta') preguntar(a.destino);
    if (a.tipo === 'ir') {
      location.hash = a.destino;
      if (matchMedia('(max-width: 40rem)').matches) abrir(false); // en el celular deja ver la sección
    }
  });
  return b;
}

function burbuja(m) {
  if (m.de === 'usuario') return el('li', { class: 'asistente__mensaje asistente__mensaje--usuario' }, el('p', {}, m.texto));
  const r = m.respuesta;
  return el('li', { class: 'asistente__mensaje asistente__mensaje--bot' },
    (r.texto ?? []).map((t) => el('p', {}, t)),
    r.lista?.length ? el('ul', { class: 'asistente__lista' }, r.lista.map((i) => el('li', {},
      i.href ? el('a', { href: i.href }, i.texto) : i.texto))) : null,
    r.nota ? el('p', { class: 'asistente__nota' }, r.nota) : null,
    r.acciones?.length ? el('div', { class: 'asistente__acciones' }, r.acciones.map(accion)) : null);
}

function pintarTodo() {
  registro.replaceChildren(...mensajes.map(burbuja));
  registro.scrollTop = registro.scrollHeight;
}

function agregar(m) {
  mensajes.push(m);
  guardarHistorial(mensajes);
  const nodo = burbuja(m);
  registro.append(nodo);
  nodo.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function bienvenida() {
  const u = contexto.usuario();
  agregar({ de: 'bot', respuesta: {
    texto: [u ? `¡Hola, ${u.nombre.split(' ')[0]}! Soy el asistente de Kakawa.` : '¡Hola! Soy el asistente de Kakawa.',
      'Le cuento qué cacao hay disponible, el recorrido de un producto por su código y cómo comprar. Funciono también sin internet.'],
    acciones: SUGERENCIAS_INICIALES,
  } });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function preguntar(texto) {
  const limpio = texto.trim();
  if (!limpio) return;
  agregar({ de: 'usuario', texto: limpio });
  entrada.value = '';
  enviar.disabled = true;

  const escribiendo = el('li', { class: 'asistente__mensaje asistente__mensaje--bot asistente__escribiendo', 'aria-label': 'Escribiendo' },
    el('span', {}), el('span', {}), el('span', {}));
  registro.append(escribiendo);
  registro.scrollTop = registro.scrollHeight;

  let respuesta;
  try {
    [respuesta] = await Promise.all([responder(limpio, contexto), esperar(450)]);
  } catch {
    respuesta = { texto: ['Tuve un problema al responder. Intente de nuevo.'] };
  }
  contexto.esperaCodigo = Boolean(respuesta.esperaCodigo);
  delete respuesta.esperaCodigo;

  escribiendo.remove();
  agregar({ de: 'bot', respuesta });
  enviar.disabled = false;
  entrada.focus({ preventScroll: true });
}

function abrir(mostrar) {
  ventana.hidden = !mostrar;
  boton.setAttribute('aria-expanded', String(mostrar));
  boton.setAttribute('aria-label', mostrar ? 'Cerrar el asistente de Kakawa' : 'Abrir el asistente de Kakawa');
  document.body.classList.toggle('asistente-abierto', mostrar);
  if (mostrar) {
    if (!mensajes.length) bienvenida();
    pintarEstado();
    registro.scrollTop = registro.scrollHeight;
    entrada.focus({ preventScroll: true });
  } else {
    boton.focus({ preventScroll: true });
  }
}

boton.addEventListener('click', () => abrir(ventana.hidden));
cerrar.addEventListener('click', () => abrir(false));
ventana.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });
formulario.addEventListener('submit', (e) => { e.preventDefault(); preguntar(entrada.value); });
reiniciar.addEventListener('click', () => {
  mensajes = [];
  guardarHistorial(mensajes);
  contexto.esperaCodigo = false;
  registro.replaceChildren();
  bienvenida();
  entrada.focus();
});
window.addEventListener('online', pintarEstado);
window.addEventListener('offline', pintarEstado);

document.body.append(ventana, boton);
pintarTodo();

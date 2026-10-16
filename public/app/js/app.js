// Enrutador de Kakawa. Cada ruta carga su vista desde js/vistas/<nombre>.js.
// Los roles aquí solo ordenan la interfaz; el servidor vuelve a validar cada permiso.
import { api } from './api.js';
import { resumenCola } from './offline/cola.js';
import { sesion } from './sesion.js';
import { aviso, el, titulo, vaciar } from './ui.js';

const AMBOS = ['operador', 'administrador'];
const ADMIN = ['administrador'];
const CLIENTE = ['cliente'];
const TODOS = [...AMBOS, ...CLIENTE];

const RUTAS = [
  { patron: /^#\/ingreso$/, vista: 'ingreso', publica: true },
  { patron: /^#\/lotes$/, vista: 'lotes', roles: AMBOS },
  { patron: /^#\/lotes\/([A-Za-z0-9-]+)$/, vista: 'lote', roles: AMBOS },
  { patron: /^#\/transformar(?:\/([A-Za-z0-9-]+))?$/, vista: 'transformar', roles: AMBOS },
  { patron: /^#\/alertas$/, vista: 'alertas', roles: ADMIN },
  { patron: /^#\/auditoria$/, vista: 'auditoria', roles: ADMIN },
  { patron: /^#\/respaldos$/, vista: 'respaldos', roles: ADMIN },
  { patron: /^#\/solicitudes$/, vista: 'solicitudes', roles: ADMIN },
  { patron: /^#\/tienda$/, vista: 'tienda', roles: CLIENTE },
  { patron: /^#\/mis-solicitudes$/, vista: 'mis-solicitudes', roles: CLIENTE },
  { patron: /^#\/sincronizacion$/, vista: 'sincronizacion', roles: TODOS },
];

const MENU = [
  { href: '#/lotes', texto: 'Lotes', roles: AMBOS },
  { href: '#/transformar', texto: 'Transformar', roles: AMBOS },
  { href: '#/alertas', texto: 'Alertas', roles: ADMIN },
  { href: '#/solicitudes', texto: 'Solicitudes', roles: ADMIN },
  { href: '#/auditoria', texto: 'Auditoría', roles: ADMIN },
  { href: '#/respaldos', texto: 'Respaldos', roles: ADMIN },
  { href: '#/tienda', texto: 'Tienda', roles: CLIENTE },
  { href: '#/mis-solicitudes', texto: 'Mis solicitudes', roles: CLIENTE },
  { href: '#/sincronizacion', texto: 'Sincronización', roles: TODOS },
];

const NOMBRE_ROL = { administrador: 'administración', operador: 'operación', cliente: 'comprador' };

/** Sección de entrada según el rol: el comprador va a la tienda; el personal, a lotes. */
export function inicioDe(rol) {
  return rol === 'cliente' ? '#/tienda' : '#/lotes';
}

const contenedor = document.getElementById('vista');
let limpiarVistaAnterior = null;

function pintarBarra() {
  const barra = document.getElementById('barra');
  const usuario = sesion.usuario();
  barra.hidden = !sesion.activa();
  if (!usuario) return;

  document.getElementById('usuario-actual').textContent = `${usuario.nombre} (${NOMBRE_ROL[usuario.rol] ?? usuario.rol})`;
  // El logo lleva al inicio que corresponde a cada rol.
  document.querySelectorAll('#barra a.marca, #barra a.logo-esquina').forEach((a) => a.setAttribute('href', inicioDe(usuario.rol)));

  vaciar(document.getElementById('menu'),
    MENU.filter((m) => m.roles.includes(usuario.rol)).map((m) => el('li', {}, el('a', { href: m.href }, m.texto))));
}

function marcarMenu(hash) {
  document.querySelectorAll('#menu a').forEach((a) => {
    const actual = hash === a.getAttribute('href') || hash.startsWith(`${a.getAttribute('href')}/`);
    if (actual) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function mensaje(tituloTexto, cuerpo, enlace) {
  titulo(tituloTexto);
  vaciar(contenedor, el('div', { class: 'vacio' },
    el('h1', {}, tituloTexto), el('p', {}, cuerpo),
    enlace ? el('a', { class: 'boton boton--secundario', href: enlace.href }, enlace.texto) : null));
}

async function navegar() {
  const rol = sesion.usuario()?.rol;
  // Sin sesión, el punto de entrada es el sitio de la asociación (inicio.html), que tiene el inicio de sesión único.
  if (!sesion.activa() && location.hash !== '#/ingreso') {
    location.replace('inicio.html#acceso');
    return;
  }
  const hash = location.hash || (sesion.activa() ? inicioDe(rol) : '#/ingreso');
  if (!location.hash) {
    history.replaceState(null, '', hash);
  }

  const ruta = RUTAS.find((r) => r.patron.test(hash));
  pintarBarra();
  document.body.classList.toggle('pantalla-ingreso', ruta?.publica === true);
  const inicio = { href: inicioDe(rol), texto: 'Ir al inicio' };

  if (!ruta) {
    mensaje('Página no encontrada', 'La dirección no corresponde a ninguna sección de Kakawa.', inicio);
    return;
  }
  if (!ruta.publica && !sesion.activa()) {
    location.hash = '#/ingreso';
    return;
  }
  if (ruta.publica && sesion.activa()) {
    location.hash = inicioDe(rol);
    return;
  }
  if (ruta.roles && !ruta.roles.includes(rol)) {
    // Un comprador que llega a una sección del personal vuelve a su tienda, sin mensajes internos.
    if (rol === 'cliente') {
      location.hash = inicioDe(rol);
      return;
    }
    mensaje('Sección restringida', 'Su usuario no tiene acceso a esta sección.', inicio);
    return;
  }

  marcarMenu(hash);
  limpiarVistaAnterior?.();
  limpiarVistaAnterior = null;

  const parametros = hash.match(ruta.patron).slice(1).map((p) => (p ? decodeURIComponent(p).toUpperCase() : p));

  let modulo;
  try {
    modulo = await import(`./vistas/${ruta.vista}.js`);
  } catch (error) {
    console.error(error);
    mensaje('Sección en construcción', 'Esta parte de Kakawa todavía no está disponible.', inicio);
    return;
  }

  vaciar(contenedor);
  const limpieza = await modulo.default(contenedor, ...parametros);
  limpiarVistaAnterior = typeof limpieza === 'function' ? limpieza : null;

  // Accesibilidad: al cambiar de sección el foco va al contenido, no se queda en el menú.
  contenedor.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

document.getElementById('salir').addEventListener('click', async () => {
  // Los cambios sin enviar se conservan en el equipo y se envían cuando este usuario vuelva a entrar.
  const { pendientes } = await resumenCola();
  if (pendientes && !window.confirm(`Tiene ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin sincronizar. `
    + 'Se conservarán en este equipo y se enviarán cuando vuelva a iniciar sesión con este usuario. ¿Cerrar sesión?')) return;
  try {
    if (navigator.onLine) await api('/auth/logout', { metodo: 'POST' });
  } catch {
    /* si el token ya venció o no hay conexión, igual se cierra la sesión local */
  }
  await sesion.cerrar();
  location.href = 'inicio.html';
});

// Al sincronizar, lo creado sin conexión recibe su id real: si la pantalla muestra un TMP-…, se cambia
// por el id real; si es una lista, se vuelve a pintar con los datos del servidor.
window.addEventListener('kakawa:sincronizado', ({ detail }) => {
  if (!detail.aplicadas) return;
  const temporal = location.hash.match(/TMP-[A-Z0-9]+/)?.[0];
  if (temporal && detail.mapa[temporal]) {
    location.replace(location.hash.replace(temporal, detail.mapa[temporal]));
  } else if (/^#\/(lotes|mis-solicitudes|solicitudes)$/.test(location.hash)) {
    navegar();
  }
});

window.addEventListener('kakawa:sesion-vencida', () => {
  // En el inicio de sesión interno un 401 es solo "clave incorrecta": no se sale de la página.
  if (location.hash !== '#/ingreso') location.href = 'inicio.html#acceso';
});

window.addEventListener('hashchange', navegar);

// Verificación de la sesión guardada: con conexión la confirma el servidor; sin conexión se entra
// directo con la sesión de este equipo (hasta 7 días sin confirmar).
const estadoSesion = await sesion.verificar();
if (estadoSesion === 'vencida') aviso('Su sesión venció. Inicie sesión de nuevo; los cambios guardados se conservan.', 'error');
if (estadoSesion === 'sin_conexion') aviso('Sin conexión: está trabajando con los datos guardados en este equipo.', 'info');
navegar();

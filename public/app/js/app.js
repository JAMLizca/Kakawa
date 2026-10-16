import { api } from './api.js';
import { sesion } from './sesion.js';
import { aviso, el, titulo, vaciar } from './ui.js';

const AMBOS = ['operador', 'administrador'];
const ADMIN = ['administrador'];

const RUTAS = [
  { patron: /^#\/ingreso$/, vista: 'ingreso', publica: true },
  { patron: /^#\/lotes$/, vista: 'lotes', roles: AMBOS },
  { patron: /^#\/lotes\/([A-Za-z0-9-]+)$/, vista: 'lote', roles: AMBOS },
  { patron: /^#\/transformar(?:\/([A-Za-z0-9-]+))?$/, vista: 'transformar', roles: AMBOS },
  { patron: /^#\/alertas$/, vista: 'alertas', roles: ADMIN },
  { patron: /^#\/auditoria$/, vista: 'auditoria', roles: ADMIN },
  { patron: /^#\/respaldos$/, vista: 'respaldos', roles: ADMIN },
];

const MENU = [
  { href: '#/lotes', texto: 'Lotes', roles: AMBOS },
  { href: '#/transformar', texto: 'Registrar transformación', roles: AMBOS },
  { href: '#/alertas', texto: 'Alertas', roles: ADMIN },
  { href: '#/auditoria', texto: 'Auditoría', roles: ADMIN },
  { href: '#/respaldos', texto: 'Respaldos', roles: ADMIN },
];

const contenedor = document.getElementById('vista');
let limpiarVistaAnterior = null;

function pintarBarra() {

  const barra = document.getElementById('barra');
  const usuario = sesion.usuario();
  barra.hidden = !sesion.activa();
  if (!usuario) return;

  document.getElementById('usuario-actual').textContent =
    `${usuario.nombre} (${usuario.rol === 'administrador' ? 'administración' : 'operación'})`;

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
  const hash = location.hash || (sesion.activa() ? '#/lotes' : '#/ingreso');
  if (!location.hash) {
    history.replaceState(null, '', hash);
  }


  const ruta = RUTAS.find((r) => r.patron.test(hash));
  pintarBarra();
  document.body.classList.toggle('pantalla-ingreso', ruta?.publica === true);

  if (!ruta) {
    mensaje('Página no encontrada', 'La dirección no corresponde a ninguna sección de Kakawa.', { href: '#/lotes', texto: 'Ir a lotes' });
    return;
  }
  if (!ruta.publica && !sesion.activa()) {
    location.hash = '#/ingreso';
    return;
  }
  if (ruta.publica && sesion.activa()) {
    location.hash = '#/lotes';
    return;
  }
  if (ruta.roles && !ruta.roles.includes(sesion.usuario().rol)) {
    mensaje('Sección del administrador', 'Su usuario de operación no tiene acceso a esta sección.', { href: '#/lotes', texto: 'Ir a lotes' });
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
    mensaje('Sección en construcción', 'Esta parte de Kakawa todavía no está disponible.', { href: '#/lotes', texto: 'Ir a lotes' });
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
  try {
    await api('/auth/logout', { metodo: 'POST' });
  } catch {
    /* si el token ya venció, se cierra la sesión local */
  }
  sesion.cerrar();
  aviso('Sesión cerrada.');
  location.hash = '#/ingreso';
});

window.addEventListener('kakawa:sesion-vencida', () => {
  aviso('Su sesión terminó. Inicie sesión de nuevo.', 'error');
  location.hash = '#/ingreso';
});

window.addEventListener('hashchange', navegar);
navegar();


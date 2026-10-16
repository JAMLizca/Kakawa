// PWA de Kakawa: registra el Service Worker, muestra el estado de la conexión y de la cola,
// y deja preparadas las consultas para trabajar sin conexión (precarga).
// Se carga en index.html, inicio.html y ficha.html.
import { api } from './api.js';
import { resumenCola, sincronizar, sincronizando } from './offline/cola.js';
import { sesion } from './sesion.js';
import { aviso, el } from './ui.js';

// ---------- Service Worker ----------
// Vive en la raíz (/sw.js) para controlar "/" y "/app/". Solo funciona en contexto seguro:
// https:// o http://localhost / 127.0.0.1. Por http://IP-de-la-red el navegador NO lo permite:
// la página no abre sin conexión después de cerrarla y las secciones no visitadas no cargan.
async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) {
    console.warn('[Kakawa] Sin Service Worker: abra el sitio por https:// o http://localhost para usarlo sin conexión.');
    try {
      if (!sessionStorage.getItem('kakawa.aviso-https')) {
        sessionStorage.setItem('kakawa.aviso-https', '1');
        aviso('Para usar Kakawa sin conexión después de cerrar el navegador, ábralo por https:// (o localhost en este equipo).', 'info');
      }
    } catch { /* sin sessionStorage */ }
    return;
  }
  try {
    // Quita el Service Worker anterior (/app/sw.js): la versión nueva controla todo el sitio desde la raíz.
    for (const r of await navigator.serviceWorker.getRegistrations()) {
      if (r.scope !== `${location.origin}/`) await r.unregister();
    }
    const registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // Solo se recarga cuando el usuario pide actualizar (la primera instalación no recarga la página).
    let actualizacionPedida = false;
    const ofrecerActualizacion = (trabajador) => {
      const boton = el('button', { class: 'estado-red__accion', type: 'button' }, 'Actualizar');
      boton.addEventListener('click', () => { actualizacionPedida = true; trabajador.postMessage('saltar-espera'); });
      mostrar('Hay una versión nueva de Kakawa.', 'actualizar', boton);
    };

    if (registro.waiting && navigator.serviceWorker.controller) ofrecerActualizacion(registro.waiting);
    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) ofrecerActualizacion(nuevo);
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (actualizacionPedida) location.reload();
    });
  } catch (error) {
    console.warn('No se pudo registrar el Service Worker:', error);
  }
}

// ---------- Indicador de conexión y cola ----------
const indicador = el('div', { class: 'estado-red', role: 'status', 'aria-live': 'polite', hidden: true });
let mensajeFijo = null; // aviso de actualización: tiene prioridad

function mostrar(texto, tipo, ...extra) {
  if (tipo === 'actualizar') mensajeFijo = { texto, extra };
  indicador.className = `estado-red estado-red--${tipo}`;
  indicador.replaceChildren(el('span', { class: 'estado-red__punto', 'aria-hidden': 'true' }), el('span', {}, texto), ...extra);
  indicador.hidden = false;
}

const enApp = () => Boolean(document.getElementById('vista'));

async function pintarIndicador() {
  if (mensajeFijo) return mostrar(mensajeFijo.texto, 'actualizar', ...mensajeFijo.extra);

  const { pendientes, rechazadas } = sesion.activa() ? await resumenCola() : { pendientes: 0, rechazadas: 0 };
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const enlace = enApp() && (pendientes || rechazadas)
    ? el('a', { class: 'estado-red__accion', href: '#/sincronizacion' }, 'Ver') : null;

  if (!navigator.onLine) {
    return mostrar(pendientes
      ? `Sin conexión · ${plural(pendientes, 'cambio guardado', 'cambios guardados')} en este equipo`
      : 'Sin conexión · trabajando con los datos guardados', 'sin-red', enlace);
  }
  if (sincronizando()) return mostrar('Sincronizando…', 'sincronizando');
  if (rechazadas) return mostrar(`${plural(rechazadas, 'cambio no se pudo', 'cambios no se pudieron')} sincronizar`, 'rechazo', enlace);
  if (pendientes) return mostrar(`${plural(pendientes, 'cambio', 'cambios')} por sincronizar`, 'pendiente', enlace);
  indicador.hidden = true;
}

// ---------- Precarga: deja guardado lo necesario para trabajar sin conexión ----------
const PRECARGA_MINUTOS = 5;
let ultimaPrecarga = 0;

const MAX_DETALLES = 60;

/** Pide una ruta para que api.js la guarde en IndexedDB; si falla, sigue con las demás. */
async function guardar(ruta) {
  if (!navigator.onLine) return null;
  try {
    return await api(ruta);
  } catch {
    return null;
  }
}

/**
 * Deja guardado en el equipo lo que cada sección necesita, aunque el usuario nunca la haya abierto:
 * catálogo y fichas públicas (para todos) y los datos de cada sección según el rol.
 */
async function precargar(forzar = false) {
  if (!navigator.onLine) return;
  if (!forzar && Date.now() - ultimaPrecarga < PRECARGA_MINUTOS * 60_000) return;
  ultimaPrecarga = Date.now();

  // Público: catálogo de inicio.html y la ficha de cada producto disponible.
  const catalogo = await guardar('/publico/catalogo');
  for (const p of (catalogo?.productos ?? []).slice(0, MAX_DETALLES)) {
    await guardar(`/publico/productos/${encodeURIComponent(p.codigo)}`);
  }

  if (!sesion.activa()) return;
  const rol = sesion.usuario()?.rol;

  if (rol === 'cliente') {
    await guardar('/tienda/catalogo');
    await guardar('/mis-solicitudes');
    return;
  }

  // Operador y administrador: lotes y el detalle de cada uno (permite transformar sin conexión).
  const lista = await guardar('/lotes');
  const lotes = (lista?.lotes ?? []).slice(0, MAX_DETALLES);
  for (const l of lotes) await guardar(`/lotes/${encodeURIComponent(l.id)}`);

  if (rol === 'administrador') {
    await guardar('/alertas');
    await guardar('/solicitudes');
    await guardar('/auditoria?limite=200');
    await guardar('/respaldos');
    await guardar('/usuarios');
    for (const l of lotes) await guardar(`/lotes/${encodeURIComponent(l.id)}/historial`);
  }
}

// ---------- Arranque ----------
function iniciar() {
  document.body.append(indicador);
  pintarIndicador();

  window.addEventListener('online', () => { aviso('Conexión restablecida. Enviando los cambios guardados…', 'info'); pintarIndicador(); });
  window.addEventListener('offline', () => { aviso('Sin conexión. Puede seguir trabajando: los cambios se guardan en este equipo.', 'info'); pintarIndicador(); });
  window.addEventListener('kakawa:cola', pintarIndicador);
  window.addEventListener('kakawa:sincronizando', pintarIndicador);
  window.addEventListener('kakawa:sincronizado', ({ detail }) => {
    pintarIndicador();
    if (detail.aplicadas) aviso(`${detail.aplicadas} ${detail.aplicadas === 1 ? 'cambio sincronizado' : 'cambios sincronizados'} con el servidor.`, 'exito');
    if (detail.rechazadas) aviso(`${detail.rechazadas} ${detail.rechazadas === 1 ? 'cambio fue rechazado' : 'cambios fueron rechazados'} por el servidor. Revise "Sincronización".`, 'error');
    if (detail.aplicadas) precargar(true);
  });

  registrarServiceWorker();
  if (enApp() && sesion.activa()) sincronizar();
  setTimeout(() => precargar(), 2000); // después de pintar la primera pantalla, en cualquier página
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();

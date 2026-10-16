// Service Worker de Kakawa (en la raíz del sitio: controla "/" y "/app/").
// - Al instalarse descarga TODA la interfaz (precaché): también las secciones que nunca se abrieron.
// - Cache First: responde desde la caché y solo va a la red si un archivo no está guardado.
// - "/" y "/app" redirigen a /app/inicio.html también sin conexión.
// - Los datos (/api/…) NO pasan por aquí: los maneja la app con IndexedDB (js/offline/).
//
// IMPORTANTE: al cambiar cualquier archivo de la interfaz, cambie VERSION para que el navegador
// descargue lo nuevo (la app ofrece "Actualizar"):
//   sed -i "s/^const VERSION = .*/const VERSION = 'kakawa-$(date +%Y%m%d%H%M%S)';/" public/sw.js
const VERSION = 'kakawa-20261016124022';

const INTERFAZ = [
  'index.html', 'inicio.html', 'ficha.html', 'manifest.json',
  'css/Kakawa.css', 'css/anterior.css',
  'css/organico/base.css', 'css/organico/estructura.css', 'css/organico/ingreso.css',
  'css/organico/tienda.css', 'css/organico/sitio.css', 'css/organico/offline.css', 'css/organico/asistente.css',
  'fonts/fraunces.woff2', 'img/Logo.svg', 'img/fondo.jpg',
  'vendor/dexie.mjs',
  'js/api.js', 'js/app.js', 'js/ficha.js', 'js/menu.js', 'js/pwa.js', 'js/sesion.js',
  'js/sitio.js', 'js/sitio-cabecera.js', 'js/ui.js',
  'js/offline/db.js', 'js/offline/cola.js', 'js/offline/lecturas.js',
  'js/asistente/asistente.js', 'js/asistente/motor.js',
  'js/componentes/analisis.js', 'js/componentes/dialogo.js', 'js/componentes/historial.js', 'js/componentes/qr.js',
  'js/vistas/alertas.js', 'js/vistas/auditoria.js', 'js/vistas/ingreso.js', 'js/vistas/lote.js',
  'js/vistas/lotes.js', 'js/vistas/mis-solicitudes.js', 'js/vistas/respaldos.js', 'js/vistas/sincronizacion.js',
  'js/vistas/solicitudes.js', 'js/vistas/personal.js', 'css/organico/personal.css', 'js/vistas/tienda.js', 'js/vistas/transformar.js',
].map((ruta) => `/app/${ruta}`);

const INICIO = '/app/inicio.html';

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Uno por uno: si falta un archivo, los demás igual quedan guardados.
    const resultados = await Promise.allSettled(INTERFAZ.map(async (ruta) => {
      const respuesta = await fetch(new Request(ruta, { cache: 'reload' }));
      if (!respuesta.ok) throw new Error(`${ruta}: HTTP ${respuesta.status}`);
      await cache.put(ruta, respuesta);
    }));
    resultados.filter((r) => r.status === 'rejected').forEach((r) => console.warn('[Kakawa SW] No se guardó', r.reason?.message));
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith('kakawa-') && nombre !== VERSION) await caches.delete(nombre);
    }
    await self.clients.claim();
  })());
});

// La app pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', (evento) => {
  if (evento.data === 'saltar-espera') self.skipWaiting();
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // La raíz del sitio abre la página de inicio, con o sin conexión.
  if (request.mode === 'navigate' && ['/', '/app', '/app/'].includes(url.pathname)) {
    evento.respondWith(Response.redirect(INICIO, 302));
    return;
  }
  if (!url.pathname.startsWith('/app/')) return; // /api/… y el resto de Laravel van directo a la red

  evento.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // ignoreSearch: ficha.html?codigo=CAC001-P01 usa la misma página guardada.
    const guardada = await cache.match(request, { ignoreSearch: true });
    if (guardada) return guardada;

    try {
      const respuesta = await fetch(request);
      if (respuesta.ok && respuesta.type === 'basic' && !respuesta.redirected) await cache.put(request, respuesta.clone());
      return respuesta;
    } catch (error) {
      // Página no guardada y sin conexión: se abre la app (su enrutador decide qué mostrar).
      if (request.mode === 'navigate') return (await cache.match('/app/index.html')) ?? Response.error();
      throw error;
    }
  })());
});

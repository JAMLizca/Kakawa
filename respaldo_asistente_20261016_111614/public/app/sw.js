// Service Worker de Kakawa: guarda la interfaz (HTML, CSS, JS, fuentes e imágenes) para abrirla sin conexión.
// Estrategia Cache First: responde desde la caché y solo va a la red si el archivo no está guardado.
// Los datos (/api/…) NO pasan por aquí: los maneja la app con IndexedDB (js/offline/).
//
// IMPORTANTE: al cambiar cualquier archivo de la interfaz, cambie VERSION. El navegador instala
// la versión nueva y la app ofrece "Actualizar". Comando: ver la guía de instalación.
const VERSION = 'kakawa-v1';

const INTERFAZ = [
  'index.html', 'inicio.html', 'ficha.html', 'manifest.json',
  'css/Kakawa.css', 'css/anterior.css',
  'css/organico/base.css', 'css/organico/estructura.css', 'css/organico/ingreso.css',
  'css/organico/tienda.css', 'css/organico/sitio.css', 'css/organico/offline.css',
  'fonts/fraunces.woff2', 'img/Logo.svg', 'img/fondo.jpg',
  'vendor/dexie.mjs',
  'js/api.js', 'js/app.js', 'js/ficha.js', 'js/menu.js', 'js/pwa.js', 'js/sesion.js',
  'js/sitio.js', 'js/sitio-cabecera.js', 'js/ui.js',
  'js/offline/db.js', 'js/offline/cola.js', 'js/offline/lecturas.js',
  'js/componentes/analisis.js', 'js/componentes/dialogo.js', 'js/componentes/historial.js', 'js/componentes/qr.js',
  'js/vistas/alertas.js', 'js/vistas/auditoria.js', 'js/vistas/ingreso.js', 'js/vistas/lote.js',
  'js/vistas/lotes.js', 'js/vistas/mis-solicitudes.js', 'js/vistas/respaldos.js', 'js/vistas/sincronizacion.js',
  'js/vistas/solicitudes.js', 'js/vistas/tienda.js', 'js/vistas/transformar.js',
];

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
  if (url.pathname.startsWith('/api/')) return; // datos: siempre a la red (la app usa IndexedDB sin conexión)

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
      // Navegación sin conexión a una página no guardada: se muestra la app.
      if (request.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      throw error;
    }
  })());
});

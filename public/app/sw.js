// Puente hacia el Service Worker nuevo. Desde esta versión el Service Worker de Kakawa vive en /sw.js
// (raíz del sitio) y controla "/" y "/app/". Los navegadores que tenían instalado el de /app/ reciben
// este archivo: toma el control, recarga la página pidiendo los archivos frescos al servidor y la
// versión nueva de js/pwa.js lo desinstala y registra /sw.js.
// No borrar este archivo mientras pueda haber navegadores con la versión vieja instalada.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    await self.clients.claim();
    const ventanas = await self.clients.matchAll({ type: 'window' });
    ventanas.forEach((ventana) => ventana.navigate(ventana.url));
  })());
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return;
  // Siempre la copia fresca del servidor; sin conexión, la que quedó guardada.
  evento.respondWith(
    fetch(evento.request.url, { cache: 'reload', credentials: 'same-origin' })
      .catch(async () => (await caches.match(evento.request, { ignoreSearch: true })) ?? Response.error()),
  );
});

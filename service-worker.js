/* FuxoraScope · SERVICE WORKER
   ─────────────────────────────────────────────────────────────────────────
   Permite instalar la aplicación en el celular y abrirla sin conexión.

   Dos estrategias, a propósito distintas:

   · EL ARMAZÓN (html, css, js, íconos) se sirve desde caché primero. Es
     código propio y versionado: cambia solo cuando publicamos, así que
     servirlo del caché hace que la app abra al instante.

   · TODO LO DEMÁS (Overpass, DANE, Nominatim, el backend de Apps Script,
     los mosaicos del mapa) NUNCA se cachea. Un estudio de viabilidad
     servido desde caché sería un informe con datos viejos entregado a un
     cliente como si fuera actual — un error que puede costar una decisión
     de inversión. Si no hay red, es preferible fallar y decirlo.

   Al subir VERSION se borran los cachés anteriores y el navegador toma la
   versión nueva. Sube VERSION en cada publicación. */

const VERSION = 'fuxorascope-v10';

const ARMAZON = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css?v=10',
  './css/acceso.css?v=10',
  './css/estudio.css?v=10',
  './src/config.js?v=10',
  './src/nucleo.js?v=10',
  './src/motor.js?v=10',
  './src/lectura.js?v=10',
  './src/datos.js?v=10',
  './src/informe.js?v=10',
  './src/acceso.js?v=10',
  './src/estudio.js?v=10',
  './src/app.js?v=10',
  './assets/iconos/icono-192.png',
  './assets/iconos/icono-512.png'
];

// Nada de estos orígenes debe quedar guardado: son datos vivos.
const NUNCA_CACHEAR = [
  'overpass', 'nominatim', 'ags.esri.co', 'script.google.com',
  'basemaps.cartocdn.com', 'tile.openstreetmap.org'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      // addAll falla entero si un solo recurso falla; con allSettled la
      // instalación sobrevive aunque un archivo puntual no esté disponible.
      .then((cache) => Promise.allSettled(ARMAZON.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  if (peticion.method !== 'GET') return;

  const url = peticion.url;
  if (NUNCA_CACHEAR.some((patron) => url.includes(patron))) return;

  // Solo se atiende lo que vive en este mismo origen.
  if (new URL(url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(peticion).then((guardado) => {
      if (guardado) return guardado;

      return fetch(peticion)
        .then((respuesta) => {
          if (respuesta && respuesta.ok && respuesta.type === 'basic') {
            const copia = respuesta.clone();
            caches.open(VERSION).then((cache) => cache.put(peticion, copia));
          }
          return respuesta;
        })
        .catch(() => {
          // Sin red y sin caché: para una navegación se devuelve el armazón,
          // que al menos muestra la interfaz en vez de la página de error.
          if (peticion.mode === 'navigate') return caches.match('./index.html');
          return new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
    })
  );
});

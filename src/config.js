/* FuxoraScope · Configuración (src/config.js)
   ─────────────────────────────────────────────────────────────────────────
   Único archivo que se edita al instalar. Todo lo demás funciona solo. */
(function(){
  'use strict';

  window.FS_CONFIG = {

    /* ── Backend ────────────────────────────────────────────────────────
       Pega aquí la URL que te dio Apps Script al implementar la aplicación
       web (backend/fuxorascope-api.gs, paso 7 de las instrucciones).
       Mientras diga PENDIENTE, la app corre en MODO DEMOSTRACIÓN: las
       cuentas y los estudios se guardan solo en este navegador, sin correo
       real. Sirve para probar toda la interfaz antes de instalar nada. */
    API_URL: 'PENDIENTE',

    /* ── Identidad ──────────────────────────────────────────────────────── */
    PRODUCTO: 'FuxoraScope',
    LEMA: 'Análisis de viabilidad de implantación',
    CORREO_SOPORTE: 'fuxoravantia@gmail.com',

    /* ── Territorio por defecto ─────────────────────────────────────────── */
    CIUDAD: 'Cúcuta',
    CENTRO: { lat: 7.8939, lng: -72.5078 },
    ZOOM: 14,
    // Caja de búsqueda para el geocodificador (área metropolitana de Cúcuta).
    CAJA: { sur: 7.75, oeste: -72.62, norte: 8.05, este: -72.38 },

    /* ── Fuentes de datos abiertas ──────────────────────────────────────── */
    // Varios espejos: el principal se satura seguido y en zonas densas
    // (Av. Libertadores, Centro) tarda o rechaza. Se prueban en orden.
    OVERPASS: [
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter',
      'https://overpass.osm.jp/api/interpreter',
      'https://overpass.private.coffee/api/interpreter'
    ],
    NOMINATIM: 'https://nominatim.openstreetmap.org',
    DANE: 'https://ags.esri.co/arcgis/rest/services/LivingAtlas/DANE_MGN_2018/MapServer',

    /* ── Comportamiento ─────────────────────────────────────────────────── */
    RADIOS: [250, 500, 1000, 1500],
    RADIO_INICIAL: 500,
    TIEMPO_ESPERA_MS: 25000,
    // Overpass necesita más margen que el resto: en zonas densas la consulta
    // tarda de verdad, y cortarla antes de tiempo obliga a repetir todo.
    ESPERA_OVERPASS_MS: 40000,

    CLAVE_SESION: 'fuxorascope_sesion',
    CLAVE_DEMO: 'fuxorascope_demo'
  };

  window.FS_CONFIG.hayBackend = function(){
    var u = window.FS_CONFIG.API_URL;
    return typeof u === 'string' && u.indexOf('http') === 0;
  };
})();

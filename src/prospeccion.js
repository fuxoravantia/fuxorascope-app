/* FuxoraScope · PROSPECCIÓN (src/prospeccion.js)
   ─────────────────────────────────────────────────────────────────────────
   La pregunta al revés.

   El estudio normal contesta: "tengo este lote, ¿sirve para un granizado?".
   Esto contesta: "quiero montar un granizado, ¿DÓNDE lo pongo?".

   CÓMO SE HACE SIN TUMBAR LOS SERVIDORES
   Evaluar 60 puntos con el flujo normal serían 60 consultas a Overpass y 180
   al DANE. Inviable y abusivo. Aquí se invierte el orden:

     1) UNA sola consulta a Overpass por toda el área (medido: 13 s y ~5.800
        puntos para 8 km × 8 km de Cúcuta).
     2) UNA sola consulta al censo por SECTORES —no manzanas— con su
        población. Medido: 112 polígonos y 42 KB, instantáneo. La manzana es
        demasiado fina para barrer una ciudad: 6.050 registros con tope de
        2.000 por llamada, y además no hace falta esa precisión para
        ORDENAR zonas.
     3) Con esos dos paquetes ya en memoria, cada punto de la malla se evalúa
        LOCALMENTE con el mismo motor de siempre. Cero peticiones extra.

   Es decir: no hay un segundo método de cálculo. El veredicto de cada zona
   sale del mismo calcularIndice() que usa el estudio de un solo predio, así
   que los dos modos no pueden contradecirse.
   ───────────────────────────────────────────────────────────────────────── */
(function(){
  'use strict';

  var CFG = window.FS_CONFIG;
  var MOTOR = window.FUXORASCOPE_MOTOR;

  function pedir(url, opciones, ms){
    var ctrl = new AbortController();
    var t = setTimeout(function(){ ctrl.abort(); }, ms || 30000);
    var op = Object.assign({ signal: ctrl.signal }, opciones || {});
    return fetch(url, op)
      .then(function(r){
        clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function(e){ clearTimeout(t); throw e; });
  }

  /* ── 1 · Entorno construido de toda el área, en una sola consulta ────── */
  function entornoDelArea(caja, avisar){
    var b = caja.sur + ',' + caja.oeste + ',' + caja.norte + ',' + caja.este;
    var q = '[out:json][timeout:90];(' +
      'nwr(' + b + ')[amenity];' +
      'nwr(' + b + ')[shop];' +
      'nwr(' + b + ')[office];' +
      'nwr(' + b + ')[leisure];' +
      'nwr(' + b + ')[tourism];' +
      'nwr(' + b + ')[healthcare];' +
      'nwr(' + b + ')[public_transport];' +
      ');out center tags;';

    // Para una consulta grande el espejo principal del producto se satura
    // más que el oficial: aquí se prueba primero el que aguantó la prueba.
    var espejos = ['https://overpass-api.de/api/interpreter']
      .concat((CFG.OVERPASS || []).filter(function(u){ return u.indexOf('overpass-api.de') === -1; }));

    function intentar(i){
      if (i >= espejos.length) return Promise.reject(new Error('Ningún servidor de mapas respondió.'));
      if (i > 0) avisar('El servidor de mapas está ocupado. Probando con otro (' + (i + 1) + ' de ' + espejos.length + ')…');
      return pedir(espejos[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q)
      }, 95000)
        .then(function(d){
          if (!d || !d.elements || !d.elements.length) throw new Error('Respuesta vacía');
          return d.elements;
        })
        .catch(function(){ return intentar(i + 1); });
    }
    return intentar(0);
  }

  /* ── 2 · Población por sector censal, en una sola consulta ───────────── */
  function sectoresDelArea(caja){
    var base = 'https://ags.esri.co/arcgis/rest/services/LivingAtlas' +
               '/Censo_personas_sectores_2018/MapServer/0/query';
    var p = new URLSearchParams();
    p.set('geometry', JSON.stringify({
      xmin: caja.oeste, ymin: caja.sur, xmax: caja.este, ymax: caja.norte,
      spatialReference: { wkid: 4326 }
    }));
    p.set('geometryType', 'esriGeometryEnvelope');
    p.set('inSR', '4326'); p.set('outSR', '4326');
    p.set('spatialRel', 'esriSpatialRelIntersects');
    p.set('outFields', 'SEXO_TOTAL');
    p.set('returnGeometry', 'true');
    p.set('maxAllowableOffset', '0.0009');   // simplifica: no hace falta el borde exacto
    p.set('geometryPrecision', '5');
    p.set('f', 'geojson');
    p.set('resultRecordCount', '2000');

    return pedir(base + '?' + p.toString(), {}, 40000)
      .then(function(gj){
        if (!gj || !gj.features) return [];
        // Se guarda centroide + habitantes + un radio equivalente, para poder
        // repartir la población del sector entre los puntos que caen dentro.
        return gj.features.map(function(f){
          var c = centroide(f.geometry);
          if (!c) return null;
          return {
            lat: c[1], lng: c[0],
            hab: Number((f.properties || {}).SEXO_TOTAL || 0),
            radio: c[2]
          };
        }).filter(Boolean);
      })
      .catch(function(){ return []; });
  }

  // Centroide aproximado + radio equivalente del anillo exterior.
  function centroide(geom){
    if (!geom) return null;
    var anillos = geom.type === 'Polygon' ? geom.coordinates
                : geom.type === 'MultiPolygon' ? geom.coordinates.map(function(p){ return p[0]; })
                : null;
    if (!anillos || !anillos.length) return null;
    var pts = geom.type === 'Polygon' ? anillos[0] : anillos[0];
    if (!pts || !pts.length) return null;
    var sx = 0, sy = 0, minX = 180, maxX = -180, minY = 90, maxY = -90;
    pts.forEach(function(p){
      sx += p[0]; sy += p[1];
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    });
    var cx = sx / pts.length, cy = sy / pts.length;
    // radio equivalente en metros (media de los semiejes de la caja)
    var mx = (maxX - minX) * 111320 * Math.cos(cy * Math.PI / 180) / 2;
    var my = (maxY - minY) * 110540 / 2;
    return [cx, cy, Math.max(120, (mx + my) / 2)];
  }

  /* ── 3 · Malla de puntos candidatos ──────────────────────────────────── */
  function malla(caja, pasoM){
    var pts = [];
    var latMedia = (caja.sur + caja.norte) / 2;
    var dLat = pasoM / 110540;
    var dLng = pasoM / (111320 * Math.cos(latMedia * Math.PI / 180));
    for (var la = caja.sur + dLat / 2; la < caja.norte; la += dLat) {
      for (var ln = caja.oeste + dLng / 2; ln < caja.este; ln += dLng) {
        pts.push({ lat: la, lng: ln });
      }
    }
    return pts;
  }

  function metros(aLat, aLng, bLat, bLng){
    var R = 6371000, tr = Math.PI / 180;
    var dLat = (bLat - aLat) * tr, dLng = (bLng - aLng) * tr;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * tr) * Math.cos(bLat * tr) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Población alrededor de un punto: se toman los sectores cuyo centroide cae
  // dentro del radio y se reparte su población por el solape aproximado. Es
  // una estimación y se declara como tal — no se presenta como dato censal
  // exacto, que solo lo es a nivel de manzana.
  function poblacionCerca(pt, sectores, radioM){
    var hab = 0;
    for (var i = 0; i < sectores.length; i++) {
      var s = sectores[i];
      var d = metros(pt.lat, pt.lng, s.lat, s.lng);
      if (d > radioM + s.radio) continue;
      var solape = Math.max(0, Math.min(1, (radioM + s.radio - d) / (2 * s.radio)));
      hab += s.hab * solape;
    }
    return Math.round(hab);
  }

  /* ── 4 · Evaluar la malla con el MISMO motor del estudio normal ──────── */
  function evaluar(opciones, avisar){
    var caja = opciones.caja;
    var radio = opciones.radio || 500;
    var paso = opciones.paso || Math.max(300, Math.round(radio * 0.8));
    var usoId = opciones.usoId;
    var aviso = avisar || function(){};

    aviso('Descargando el entorno de toda el área. Es una sola consulta grande, tarda unos segundos…');

    return Promise.all([
      entornoDelArea(caja, aviso),
      sectoresDelArea(caja)
    ]).then(function(res){
      var crudos = res[0], sectores = res[1];
      aviso('Leyendo ' + crudos.length.toLocaleString('es-CO') + ' puntos del entorno…');

      var elementos = normalizar(crudos);
      var puntos = malla(caja, paso);
      aviso('Evaluando ' + puntos.length + ' zonas candidatas…');

      var filas = [];
      for (var i = 0; i < puntos.length; i++) {
        var pt = puntos[i];
        var cerca = enRadio(elementos, pt, radio);
        // Una zona sin nada alrededor no es "mala": es que no hay ciudad ahí.
        // Se descarta para no llenar el ranking de potreros con puntaje medio.
        if (cerca.length < 6) continue;

        var hab = poblacionCerca(pt, sectores, radio);
        var r = MOTOR.calcularIndice({
          elementos: cerca,
          centro: pt,
          radioM: radio,
          tipoNegocio: perfilDe(usoId),
          censo: hab ? { habitantes: hab, nivel: 'sector', estimado: true } : null
        });
        if (!r) continue;
        filas.push({
          lat: pt.lat, lng: pt.lng,
          indice: r.indice, nivel: r.nivel,
          subindices: r.subindices,
          puntos: cerca.length,
          habitantes: hab
        });
      }

      filas.sort(function(a, b){ return b.indice - a.indice; });
      return {
        usoId: usoId,
        radio: radio,
        evaluadas: filas.length,
        candidatas: puntos.length,
        elementos: elementos.length,
        sectores: sectores.length,
        zonas: filas
      };
    });
  }

  function perfilDe(usoId){
    var u = MOTOR.PROGRAMA_POR_ID ? MOTOR.PROGRAMA_POR_ID[usoId] : null;
    if (!u && window.FUXORASCOPE_USOS) u = window.FUXORASCOPE_USOS.POR_ID[usoId];
    return (u && u.perfil) || 'general';
  }

  function enRadio(elementos, pt, radioM){
    var out = [];
    for (var i = 0; i < elementos.length; i++) {
      var e = elementos[i];
      if (Math.abs(e.lat - pt.lat) > 0.02 || Math.abs(e.lng - pt.lng) > 0.02) continue; // descarte barato
      if (metros(pt.lat, pt.lng, e.lat, e.lng) <= radioM) out.push(e);
    }
    return out;
  }

  // Mismo formato que produce datos.js, para que el motor no note diferencia.
  function normalizar(crudos){
    return crudos.map(function(el){
      var t = el.tags || {};
      var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
      var lng = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (lat == null || lng == null) return null;
      var etiqueta = t.amenity || t.shop || t.office || t.leisure || t.tourism ||
                     t.healthcare || t.public_transport || '';
      if (!etiqueta) return null;
      return { lat: lat, lng: lng, etiqueta: etiqueta, nombre: t.name || '', tags: t };
    }).filter(Boolean);
  }

  /* ── Agrupar zonas contiguas para no listar 40 puntos casi iguales ───── */
  function agrupar(zonas, distanciaM){
    var d = distanciaM || 700;
    var grupos = [];
    zonas.forEach(function(z){
      for (var i = 0; i < grupos.length; i++) {
        if (metros(z.lat, z.lng, grupos[i].lat, grupos[i].lng) < d) {
          grupos[i].miembros.push(z);
          return;
        }
      }
      grupos.push({ lat: z.lat, lng: z.lng, indice: z.indice, nivel: z.nivel,
                    subindices: z.subindices, habitantes: z.habitantes,
                    puntos: z.puntos, miembros: [z] });
    });
    return grupos;
  }

  /* ── Ponerle nombre a las zonas ──────────────────────────────────────────
     Un resultado que dice "7.8849, -72.5015" no le sirve a nadie. Se
     resuelve el barrio y la comuna con Nominatim, pero SOLO de las que se
     van a mostrar: su política de uso pide máximo una consulta por segundo,
     así que nombrar 184 zonas sería abusar del servicio. */
  function nombrar(zonas, cuantas){
    var lista = zonas.slice(0, cuantas || 8);
    var i = 0;

    function siguiente(){
      if (i >= lista.length) return Promise.resolve(zonas);
      var z = lista[i++];
      var u = CFG.NOMINATIM + '/reverse?format=json&zoom=16&lat=' + z.lat + '&lon=' + z.lng;
      return pedir(u, { headers: { 'Accept-Language': 'es' } }, 12000)
        .then(function(d){
          var a = (d && d.address) || {};
          var barrio = a.suburb || a.neighbourhood || a.quarter || a.residential || '';
          var comuna = a.city_district || '';
          z.nombre = barrio || comuna || 'Zona sin nombre';
          z.comuna = comuna && comuna !== barrio ? comuna : '';
        })
        .catch(function(){ z.nombre = 'Zona sin nombre'; })
        .then(function(){
          return new Promise(function(r){ setTimeout(r, 1100); }).then(siguiente);
        });
    }
    return siguiente();
  }

  window.FUXORASCOPE_PROSPECCION = {
    evaluar: evaluar,
    agrupar: agrupar,
    nombrar: nombrar,
    malla: malla,
    metros: metros
  };
})();

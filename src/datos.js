/* FuxoraScope · FUENTES DE DATOS (src/datos.js)
   ─────────────────────────────────────────────────────────────────────────
   Todo lo que entra al motor viene de aquí. Tres decisiones de arquitectura:

   1) REGISTRO DE FUENTES con contrato uniforme. Cada fuente declara su
      nombre, qué aporta y una función `traer(punto, radioM)`. Agregar una
      fuente nueva (catastro, cámara de comercio, tránsito) es registrar una
      entrada más, sin tocar el recolector ni el motor.

   2) RECOLECCIÓN TOLERANTE A FALLOS. Las fuentes se piden en paralelo y se
      resuelven con `allSettled`: si una se cae o tarda, el estudio sale
      igual, marcando esa fuente como no disponible en vez de romperse. El
      informe siempre dice con qué datos se hizo y con cuáles no.

   3) FUENTES ABIERTAS Y CITABLES. OpenStreetMap (ODbL) y el Censo Nacional
      2018 del DANE publicado por Esri Colombia (datos abiertos, Ley 1712 de
      2014). Sin llaves de API y sin intermediarios: el navegador consulta
      directo, y cualquier cliente puede auditar de dónde salió cada cifra. */
(function(){
  'use strict';

  var CFG = window.FS_CONFIG;

  /* ── Utilidad: petición con límite de tiempo ──────────────────────────── */
  function pedir(url, opciones, ms){
    var control = new AbortController();
    var reloj = setTimeout(function(){ control.abort(); }, ms || CFG.TIEMPO_ESPERA_MS);
    return fetch(url, Object.assign({ signal: control.signal }, opciones || {}))
      .then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(function(){ clearTimeout(reloj); });
  }

  /* ═══ Geocodificación ══════════════════════════════════════════════════ */
  function buscarDireccion(texto){
    var c = CFG.CAJA;
    var url = CFG.NOMINATIM + '/search?format=json&limit=6&addressdetails=1' +
              '&countrycodes=co&accept-language=es' +
              '&viewbox=' + c.oeste + ',' + c.norte + ',' + c.este + ',' + c.sur +
              '&bounded=1&q=' + encodeURIComponent(texto);
    return pedir(url, {}, 12000)
      .then(function(lista){
        return (lista || []).map(function(r){
          return { etiqueta: r.display_name, lat: Number(r.lat), lng: Number(r.lon) };
        });
      })
      .catch(function(){ return []; });
  }

  function direccionDe(lat, lng){
    var url = CFG.NOMINATIM + '/reverse?format=json&zoom=18&accept-language=es&lat=' + lat + '&lon=' + lng;
    return pedir(url, {}, 10000)
      .then(function(r){
        if (!r || !r.address) return '';
        var a = r.address;
        return [a.road, a.neighbourhood || a.suburb, a.city || a.town || CFG.CIUDAD]
               .filter(Boolean).join(', ');
      })
      .catch(function(){ return ''; });
  }

  /* ═══ Fuente 1 · OpenStreetMap (entorno construido) ════════════════════ */
  function consultaOverpass(lat, lng, radioM){
    var r = Math.round(radioM);
    var q =
      '[out:json][timeout:25];(' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[amenity];' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[shop];' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[office];' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[leisure];' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[tourism];' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[healthcare];' +
        'nwr(around:' + r + ',' + lat + ',' + lng + ')[public_transport];' +
        'way(around:' + Math.round(radioM * 1.5) + ',' + lat + ',' + lng +
            ')[highway~"^(trunk|primary|secondary|tertiary)$"];' +
      ');out center tags;';

    // Se prueban los espejos en orden: si el primero está saturado, sigue el otro.
    var espejos = CFG.OVERPASS.slice();
    function intentar(i){
      if (i >= espejos.length) return Promise.reject(new Error('Sin espejos disponibles'));
      return pedir(espejos[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q)
      }).catch(function(){ return intentar(i + 1); });
    }
    return intentar(0);
  }

  function normalizarElementos(respuesta){
    return (respuesta && respuesta.elements ? respuesta.elements : [])
      .map(function(el){
        var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        var lng = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (lat == null || lng == null) return null;
        var t = el.tags || {};
        return {
          id: el.type + '/' + el.id,
          lat: lat, lng: lng,
          nombre: t.name || '',
          tags: t
        };
      })
      .filter(Boolean);
  }

  /* ═══ Fuente 2 · Censo DANE 2018 (vía Esri Colombia) ═══════════════════ */
  var CAPAS = {
    personasManzana:  '/Censo_personas_manzana_2018/MapServer/0/query',
    personasSector:   '/Censo_personas_sectores_2018/MapServer/0/query',
    viviendasManzana: '/Censo_viviendas_manzana_2018/MapServer/0/query',
    estratoManzana:   '/Estrato_predominante_por_manzana_2018/MapServer/0/query'
  };
  var BASE_DANE = 'https://ags.esri.co/arcgis/rest/services/LivingAtlas';

  function paramsRadio(lat, lng, radioM){
    var p = new URLSearchParams();
    p.set('geometry', JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
    p.set('geometryType', 'esriGeometryPoint');
    p.set('inSR', '4326');
    p.set('distance', String(Math.round(radioM)));
    p.set('units', 'esriSRUnit_Meter');
    p.set('spatialRel', 'esriSpatialRelIntersects');
    p.set('f', 'json');
    return p;
  }

  function agregarCapa(capa, lat, lng, radioM, campo){
    var p = paramsRadio(lat, lng, radioM);
    p.set('outStatistics', JSON.stringify([
      { statisticType:'sum',   onStatisticField: campo,  outStatisticFieldName:'TOTAL' },
      { statisticType:'count', onStatisticField:'OBJECTID', outStatisticFieldName:'N' }
    ]));
    return pedir(BASE_DANE + capa + '?' + p.toString(), {}, 20000)
      .then(function(d){
        if (!d || d.error) return null;
        var a = d.features && d.features[0] && d.features[0].attributes;
        if (!a || a.TOTAL == null) return null;
        return { total: Math.round(a.TOTAL), unidades: a.N || 0 };
      })
      .catch(function(){ return null; });
  }

  var ESTRATO_NUM = { uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6 };

  function estratoPredominante(lat, lng, radioM){
    var p = paramsRadio(lat, lng, radioM);
    p.set('outFields', 'ESTRATO_PREDOMINANTE');
    p.set('returnGeometry', 'false');
    p.set('resultRecordCount', '600');
    return pedir(BASE_DANE + CAPAS.estratoManzana + '?' + p.toString(), {}, 20000)
      .then(function(d){
        if (!d || d.error || !d.features || !d.features.length) return null;
        var cuenta = {}, suma = 0, n = 0;
        d.features.forEach(function(f){
          var txt = String((f.attributes || {}).ESTRATO_PREDOMINANTE || '').trim().toLowerCase();
          var num = ESTRATO_NUM[txt];
          if (!num) return;
          cuenta[num] = (cuenta[num] || 0) + 1;
          suma += num; n++;
        });
        if (!n) return null;
        var mayor = Object.keys(cuenta).sort(function(a, b){ return cuenta[b] - cuenta[a]; })[0];
        return {
          predominante: Number(mayor),
          promedio: Math.round((suma / n) * 10) / 10,
          manzanas: n,
          reparto: cuenta
        };
      })
      .catch(function(){ return null; });
  }

  // Población: manzana (fino, solo urbano) y si no hay, sector (grueso, cubre
  // rural). Se devuelve SIEMPRE con qué nivel se resolvió, porque de eso
  // depende si otras cifras del mismo nivel son comparables.
  function poblacion(lat, lng, radioM){
    return agregarCapa(CAPAS.personasManzana, lat, lng, radioM, 'SEXO_TOTAL')
      .then(function(m){
        if (m && m.total > 0) return { habitantes: m.total, nivel:'manzana', unidades: m.unidades };
        return agregarCapa(CAPAS.personasSector, lat, lng, radioM, 'SEXO_TOTAL')
          .then(function(s){
            if (s && s.total > 0) return { habitantes: s.total, nivel:'sector', unidades: s.unidades };
            return null;
          });
      });
  }

  function censo(lat, lng, radioM){
    return Promise.all([
      poblacion(lat, lng, radioM),
      agregarCapa(CAPAS.viviendasManzana, lat, lng, radioM, 'TOTAL_VIVIENDAS'),
      estratoPredominante(lat, lng, radioM)
    ]).then(function(res){
      var pob = res[0], viv = res[1], est = res[2];
      if (!pob) return null;
      var salida = {
        habitantes: pob.habitantes,
        nivel: pob.nivel,
        manzanas: pob.unidades,
        estrato: est
      };
      // Las viviendas vienen de la capa de MANZANA. Solo se combinan con la
      // población si esta también salió de manzana; mezclar niveles daría
      // una relación personas/vivienda sin sentido.
      if (viv && viv.total > 0 && pob.nivel === 'manzana') {
        salida.viviendas = viv.total;
        salida.personasPorVivienda = Math.round((pob.habitantes / viv.total) * 10) / 10;
      }
      return salida;
    }).catch(function(){ return null; });
  }

  /* ═══ Registro de fuentes ══════════════════════════════════════════════ */
  var FUENTES = [
    {
      id: 'osm',
      nombre: 'OpenStreetMap',
      aporta: 'Entorno construido: comercio, salud, educación, vías y transporte.',
      licencia: 'ODbL · © colaboradores de OpenStreetMap',
      critica: true,   // sin esta fuente no hay estudio posible
      traer: function(punto, radioM){
        return consultaOverpass(punto.lat, punto.lng, radioM).then(normalizarElementos);
      }
    },
    {
      id: 'dane',
      nombre: 'Censo Nacional 2018 (DANE)',
      aporta: 'Población, viviendas y estrato socioeconómico del sector.',
      licencia: 'Datos abiertos · DANE, publicados por Esri Colombia',
      critica: false,  // si falla, el estudio sigue sin cifras de población
      traer: function(punto, radioM){ return censo(punto.lat, punto.lng, radioM); }
    }
  ];

  /* Recolecta todas las fuentes en paralelo y devuelve además un parte de
     estado por fuente, que el informe usa para declarar su procedencia. */
  function recolectar(punto, radioM, alAvanzar){
    var avisar = alAvanzar || function(){};
    avisar('Consultando el entorno del predio…');

    var trabajos = FUENTES.map(function(f){
      return f.traer(punto, radioM)
        .then(function(datos){ return { id:f.id, ok: datos != null, datos: datos }; })
        .catch(function(err){ return { id:f.id, ok:false, datos:null, error:String(err) }; });
    });

    return Promise.all(trabajos).then(function(resultados){
      var porId = {};
      resultados.forEach(function(r){ porId[r.id] = r; });

      var osm = porId.osm;
      if (!osm.ok || !osm.datos || !osm.datos.length) {
        throw new Error('No pudimos leer el entorno del predio. ' +
          'El servicio de mapas puede estar saturado; inténtalo de nuevo en un minuto.');
      }

      return {
        elementos: osm.datos,
        censo: porId.dane.ok ? porId.dane.datos : null,
        procedencia: FUENTES.map(function(f){
          return { nombre:f.nombre, aporta:f.aporta, licencia:f.licencia, disponible: porId[f.id].ok };
        })
      };
    });
  }

  window.FUXORASCOPE_DATOS = {
    recolectar: recolectar,
    buscarDireccion: buscarDireccion,
    direccionDe: direccionDe,
    FUENTES: FUENTES
  };
})();

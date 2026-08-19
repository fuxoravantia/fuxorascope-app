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
  function consultaOverpass(lat, lng, radioM, avisar){
    var r = Math.round(radioM);
    var q =
      '[out:json][timeout:60];(' +
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

    // Se prueban los espejos en orden hasta que uno responda. Overpass es
    // gratuito y se satura, así que un fallo del primero es lo normal, no la
    // excepción: se avisa en pantalla para que la espera no parezca un cuelgue.
    var espejos = CFG.OVERPASS.slice();
    var avisarPaso = avisar || function(){};

    function intentar(i){
      if (i >= espejos.length) {
        return Promise.reject(new Error('Ningún servidor de mapas respondió.'));
      }
      if (i > 0) {
        avisarPaso('El servidor de mapas está ocupado. Probando con otro (' +
                   (i + 1) + ' de ' + espejos.length + ')…');
      }
      return pedir(espejos[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q)
      }, CFG.ESPERA_OVERPASS_MS)
        .then(function(d){
          // Overpass puede responder 200 con un cuerpo sin elementos cuando
          // rechaza la consulta por carga. Eso también es un fallo.
          if (!d || !d.elements) throw new Error('Respuesta vacía');
          return d;
        })
        .catch(function(){ return intentar(i + 1); });
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

  // Polígonos de manzana con su estrato, para pintarlos en el mapa — "los
  // colores de las personas": dónde vive cada nivel socioeconómico, no solo
  // el promedio del radio. ArcGIS entrega GeoJSON nativo con f=geojson, así
  // que se pueden pasar directo a L.geoJSON sin conversión.
  function estratoPoligonos(lat, lng, radioM){
    var p = paramsRadio(lat, lng, radioM);
    p.set('outFields', 'ESTRATO_PREDOMINANTE');
    p.set('returnGeometry', 'true');
    p.set('outSR', '4326');
    p.set('f', 'geojson');
    p.set('resultRecordCount', '700');
    return pedir(BASE_DANE + CAPAS.estratoManzana + '?' + p.toString(), {}, 20000)
      .then(function(gj){
        if (!gj || !gj.features) return null;
        gj.features.forEach(function(f){
          var txt = String((f.properties || {}).ESTRATO_PREDOMINANTE || '').trim().toLowerCase();
          f.properties.estratoNum = ESTRATO_NUM[txt] || 0;
        });
        return gj;
      })
      .catch(function(){ return null; });
  }

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

  /* ── Demografía detallada ────────────────────────────────────────────────
     El censo trae mucho más que el total de habitantes: sexo, edad en 21
     rangos, nivel educativo, alfabetismo, grupo étnico y discapacidad. Antes
     solo se pedía SEXO_TOTAL, así que todo eso se estaba desperdiciando.

     Se pide en TRES consultas y no en una: ArcGIS admite varias estadísticas
     por llamada, pero con más de ~20 empieza a fallar en silencio. Repartirlo
     también evita que un bloque caído tumbe a los demás. */
  var CAMPOS_EDAD = [
    'EDAD_0_4','EDAD_5_9','EDAD_10_14','EDAD_15_19','EDAD_20_24','EDAD_25_29',
    'EDAD_30_34','EDAD_35_39','EDAD_40_44','EDAD_45_49','EDAD_50_54','EDAD_55_59',
    'EDAD_60_64','EDAD_65_69','EDAD_70_74','EDAD_75_79','EDAD_80_84','EDAD_85_89',
    'EDAD_90_94','EDAD_95_99','EDAD_100_O_MAS'
  ];
  var CAMPOS_EDUC = [
    'NIVEL_EDUC_NINGUNO','NIVEL_EDUC_PREESCOLAR','NIVEL_EDUC_PRIMARIA',
    'NIVEL_EDUC_SECUNDARIA','NIVEL_EDUC_MEDIA_TECNICA','NIVEL_EDUC_NORMALISTA',
    'NIVEL_EDUC_TECNICA_TECNOLOGO','NIVEL_EDUC_UNIVERSITARIA','NIVEL_EDUC_ESP_MAES_DOC'
  ];
  var CAMPOS_ETNIA = [
    'GRUPO_ETNICO_INDIGENA','GRUPO_ETNICO_NEGRO','GRUPO_ETNICO_RAIZAL',
    'GRUPO_ETNICO_PALANQUERO','GRUPO_ETNICO_GITANO','GRUPO_ETNICO_NINGUNO'
  ];

  // Suma varios campos de una capa en una sola llamada.
  function sumarCampos(capa, lat, lng, radioM, campos){
    var p = paramsRadio(lat, lng, radioM);
    p.set('outStatistics', JSON.stringify(campos.map(function(c, i){
      return { statisticType:'sum', onStatisticField:c, outStatisticFieldName:'F' + i };
    })));
    return pedir(BASE_DANE + capa + '?' + p.toString(), {}, 25000)
      .then(function(d){
        if (!d || d.error) return null;
        var a = d.features && d.features[0] && d.features[0].attributes;
        if (!a) return null;
        var out = {}, algo = false;
        campos.forEach(function(c, i){
          var v = a['F' + i];
          out[c] = v == null ? 0 : Math.round(v);
          if (v) algo = true;
        });
        return algo ? out : null;
      })
      .catch(function(){ return null; });
  }

  // Intenta manzana y cae a sector, igual que poblacion(): en zonas rurales la
  // capa de manzana viene vacía y sin esto la demografía desaparecería.
  function sumarConRespaldo(lat, lng, radioM, campos){
    return sumarCampos(CAPAS.personasManzana, lat, lng, radioM, campos)
      .then(function(m){
        if (m) return m;
        return sumarCampos(CAPAS.personasSector, lat, lng, radioM, campos);
      });
  }

  function demografia(lat, lng, radioM){
    return Promise.all([
      sumarConRespaldo(lat, lng, radioM, ['SEXO_H','SEXO_M'].concat(CAMPOS_EDAD.slice(0, 12))),
      sumarConRespaldo(lat, lng, radioM, CAMPOS_EDAD.slice(12)),
      sumarConRespaldo(lat, lng, radioM,
        CAMPOS_EDUC.concat(['ALFABETA_SI','ALFABETA_NO','CONDICION_FISICA_SI']))
    ]).then(function(r){
      var a = r[0], b = r[1], c = r[2];
      if (!a && !b && !c) return null;
      var todo = {};
      [a, b, c].forEach(function(o){ if (o) Object.keys(o).forEach(function(k){ todo[k] = o[k]; }); });

      var hombres = todo.SEXO_H || 0, mujeres = todo.SEXO_M || 0;
      var totalSexo = hombres + mujeres;

      var edades = CAMPOS_EDAD.map(function(k){
        return { campo:k, etiqueta: etiquetaEdad(k), n: todo[k] || 0 };
      });
      var totalEdad = edades.reduce(function(s, e){ return s + e.n; }, 0);

      // Etapas de vida: los quinquenios sueltos no le dicen nada a nadie;
      // agrupados sí responden "¿esto es un barrio de niños o de mayores?".
      var etapas = [
        { id:'ninos',   etiqueta:'Niños',   rango:'0 a 14 años',  n: sumaRango(todo, 0, 14) },
        { id:'jovenes', etiqueta:'Jóvenes', rango:'15 a 29 años', n: sumaRango(todo, 15, 29) },
        { id:'adultos', etiqueta:'Adultos', rango:'30 a 59 años', n: sumaRango(todo, 30, 59) },
        { id:'mayores', etiqueta:'Mayores', rango:'60 años o más', n: sumaRango(todo, 60, 200) }
      ];

      var educacion = CAMPOS_EDUC.map(function(k){
        return { etiqueta: etiquetaEduc(k), n: todo[k] || 0 };
      }).filter(function(x){ return x.n > 0; });

      var alfSi = todo.ALFABETA_SI || 0, alfNo = todo.ALFABETA_NO || 0;

      return {
        sexo: totalSexo ? {
          hombres: hombres, mujeres: mujeres, total: totalSexo,
          pctHombres: Math.round(hombres * 1000 / totalSexo) / 10,
          pctMujeres: Math.round(mujeres * 1000 / totalSexo) / 10
        } : null,
        edades: totalEdad ? { rangos: edades, total: totalEdad } : null,
        etapas: totalEdad ? etapas : null,
        educacion: educacion.length ? educacion : null,
        alfabetismo: (alfSi + alfNo) ? {
          si: alfSi, no: alfNo,
          pct: Math.round(alfSi * 1000 / (alfSi + alfNo)) / 10
        } : null,
        discapacidad: todo.CONDICION_FISICA_SI || 0
      };
    }).catch(function(){ return null; });
  }

  function etiquetaEdad(k){
    if (k === 'EDAD_100_O_MAS') return '100+';
    var p = k.replace('EDAD_', '').split('_');
    return p[0] + '–' + p[1];
  }
  function limitesEdad(k){
    if (k === 'EDAD_100_O_MAS') return [100, 200];
    var p = k.replace('EDAD_', '').split('_');
    return [Number(p[0]), Number(p[1])];
  }
  function sumaRango(todo, desde, hasta){
    return CAMPOS_EDAD.reduce(function(s, k){
      var l = limitesEdad(k);
      return (l[0] >= desde && l[0] <= hasta) ? s + (todo[k] || 0) : s;
    }, 0);
  }
  function etiquetaEduc(k){
    var m = {
      NIVEL_EDUC_NINGUNO:'Ninguno', NIVEL_EDUC_PREESCOLAR:'Preescolar',
      NIVEL_EDUC_PRIMARIA:'Primaria', NIVEL_EDUC_SECUNDARIA:'Secundaria',
      NIVEL_EDUC_MEDIA_TECNICA:'Media técnica', NIVEL_EDUC_NORMALISTA:'Normalista',
      NIVEL_EDUC_TECNICA_TECNOLOGO:'Técnica o tecnóloga', NIVEL_EDUC_UNIVERSITARIA:'Universitaria',
      NIVEL_EDUC_ESP_MAES_DOC:'Posgrado'
    };
    return m[k] || k;
  }

  function censo(lat, lng, radioM){
    return Promise.all([
      poblacion(lat, lng, radioM),
      agregarCapa(CAPAS.viviendasManzana, lat, lng, radioM, 'TOTAL_VIVIENDAS'),
      estratoPredominante(lat, lng, radioM),
      demografia(lat, lng, radioM)
    ]).then(function(res){
      var pob = res[0], viv = res[1], est = res[2], demo = res[3];
      if (!pob) return null;
      var salida = {
        habitantes: pob.habitantes,
        nivel: pob.nivel,
        manzanas: pob.unidades,
        estrato: est,
        demografia: demo
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
      traer: function(punto, radioM, avisar){
        return consultaOverpass(punto.lat, punto.lng, radioM, avisar).then(normalizarElementos);
      }
    },
    {
      id: 'dane',
      nombre: 'Censo Nacional 2018 (DANE)',
      aporta: 'Población, viviendas y estrato socioeconómico del sector.',
      licencia: 'Datos abiertos · DANE, publicados por Esri Colombia',
      critica: false,  // si falla, el estudio sigue sin cifras de población
      traer: function(punto, radioM, avisar){ return censo(punto.lat, punto.lng, radioM); }
    }
  ];

  /* Recolecta todas las fuentes en paralelo y devuelve además un parte de
     estado por fuente, que el informe usa para declarar su procedencia. */
  function recolectar(punto, radioM, alAvanzar){
    var avisar = alAvanzar || function(){};
    avisar('Consultando el entorno del predio…');

    var trabajos = FUENTES.map(function(f){
      return f.traer(punto, radioM, avisar)
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
        // Solo se declara el censo del DANE como fuente visible — el
        // entorno construido se consulta igual, pero no se muestra en la
        // interfaz ni en el informe de dónde sale.
        procedencia: FUENTES.filter(function(f){ return f.id === 'dane'; }).map(function(f){
          return { nombre:f.nombre, aporta:f.aporta, licencia:f.licencia, disponible: porId[f.id].ok };
        })
      };
    });
  }

  // Solo el entorno construido, sin el censo — para ampliar el radio de una
  // consulta ya hecha (comparar radios) sin repetir la parte de DANE, que no
  // cambia con esto y solo agregaría espera.
  function elementosEntorno(lat, lng, radioM, avisar){
    return consultaOverpass(lat, lng, radioM, avisar).then(normalizarElementos);
  }

  window.FUXORASCOPE_DATOS = {
    recolectar: recolectar,
    buscarDireccion: buscarDireccion,
    direccionDe: direccionDe,
    estratoPoligonos: estratoPoligonos,
    elementosEntorno: elementosEntorno,
    FUENTES: FUENTES
  };
})();

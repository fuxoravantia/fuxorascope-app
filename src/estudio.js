/* FuxoraScope · ESTUDIO (src/estudio.js)
   ─────────────────────────────────────────────────────────────────────────
   La pantalla de trabajo: elegir predio en el mapa, definir radio y uso,
   correr el análisis y leer el dictamen.

   El estado del formulario vive en un objeto local `borrador`; el resultado
   del análisis vive en el estado global (lo comparten el informe y la vista
   de estudios guardados). Los elementos crudos del entorno también quedan en
   memoria: cambiar el tipo de negocio recalcula al instante, sin volver a
   pedir datos a la red. */
(function(){
  'use strict';

  var FS = window.FS, dom = FS.dom, esc = dom.escapar;
  var MOTOR = window.FUXORASCOPE_MOTOR, DATOS = window.FUXORASCOPE_DATOS, LECTURA = window.FUXORASCOPE_LECTURA;

  // El Paso 3 muestra el catálogo completo de MOTOR.PROGRAMA (28 usos
  // concretos), agrupado por el perfil de pesos que le corresponde a cada
  // uno — así el usuario elige "Gimnasio" o "Cafetería" directamente, no un
  // genérico "Comercio" que hay que adivinar qué tan bien representa.
  var GRUPOS_PROGRAMA = [
    { perfil:'comercio',    titulo:'Comercio' },
    { perfil:'gastronomia', titulo:'Gastronomía' },
    { perfil:'salud',       titulo:'Salud' },
    { perfil:'oficinas',    titulo:'Oficinas y servicios' },
    { perfil:'general',     titulo:'Otros usos' }
  ];
  function programaPorGrupo(perfil){
    return MOTOR.PROGRAMA.filter(function(u){ return u.perfil === perfil; });
  }
  function usoActual(){
    return MOTOR.PROGRAMA_POR_ID[borrador.usoId] || MOTOR.PROGRAMA[0];
  }

  var borrador = {
    punto: null, direccion: '', radioM: FS.cfg.RADIO_INICIAL,
    usoId: MOTOR.PROGRAMA[0].id, nombre: '', modo: 'simple', usosMixto: []
  };
  var mapa = null, capaPredio = null, capaRadio = null, capaPuntos = null;
  var capaEstratos = null, leyendaCtrl = null, botonEstratoBtn = null;

  var COLOR_ESTRATO = { 1:'#7f1d1d', 2:'#c2410c', 3:'#ca8a04', 4:'#65a30d', 5:'#0d9488', 6:'#1d4ed8' };
  function colorEstrato(n){ return COLOR_ESTRATO[n] || '#6b7280'; }

  // Nominatim devuelve la dirección completa hasta el país y el código postal.
  // Para encabezar un estudio sobran: con vía, barrio y comuna se identifica
  // el predio, y cabe en una línea tanto en el panel como en el informe.
  function direccionCorta(etiqueta){
    return String(etiqueta || '').split(',').slice(0, 3).join(',').trim();
  }

  /* ═══ Plantilla ════════════════════════════════════════════════════════ */
  function plantilla(){
    return '' +
    '<div class="fs-estudio">' +
      '<div id="fs-mapa" role="application" aria-label="Mapa para elegir el predio"></div>' +

      '<section class="fs-panel" id="fs-panel">' +

        '<div class="fs-panel-agarre" aria-hidden="true"><span></span></div>' +

        '<div class="fs-formulario" id="fs-formulario">' +

          '<div class="fs-paso">' +
            '<h2><i>1</i> ¿Dónde está el predio?</h2>' +
            '<div class="fs-buscador">' +
              '<input id="fs-buscar" type="text" autocomplete="off" ' +
                'placeholder="Busca una dirección en ' + esc(FS.cfg.CIUDAD) + '…" />' +
              '<ul id="fs-sugerencias" hidden></ul>' +
            '</div>' +
            '<p class="fs-pista" id="fs-pista-predio">O toca el mapa para marcar el punto exacto.</p>' +
          '</div>' +

          '<div class="fs-paso">' +
            '<h2><i>2</i> Radio de estudio</h2>' +
            '<div class="fs-opciones" id="fs-radios">' +
              FS.cfg.RADIOS.map(function(r){
                return '<button type="button" class="fs-opcion' +
                       (r === FS.cfg.RADIO_INICIAL ? ' activa' : '') + '" data-radio="' + r + '">' +
                       (r >= 1000 ? (r / 1000) + ' km' : r + ' m') + '</button>';
              }).join('') +
            '</div>' +
            '<p class="fs-pista">Los puntos cercanos pesan más que los lejanos, así que el radio ' +
              'define el alcance del estudio, no un corte brusco.</p>' +
          '</div>' +

          '<div class="fs-paso">' +
            '<h2><i>3</i> ¿Qué se quiere implantar?</h2>' +
            '<div class="fs-usos" id="fs-usos" ' + (borrador.modo === 'mixto' ? 'hidden' : '') + '>' +
              GRUPOS_PROGRAMA.map(function(g){
                var items = programaPorGrupo(g.perfil);
                if (!items.length) return '';
                return '<div class="fs-usos-grupo">' +
                  '<span class="fs-usos-grupo-titulo">' + esc(g.titulo) + '</span>' +
                  '<div class="fs-usos-grupo-chips">' +
                    items.map(function(u){
                      return '<button type="button" class="fs-chip-uso' +
                        (u.id === borrador.usoId ? ' activa' : '') + '" data-uso="' + u.id + '">' +
                        u.icono + ' ' + esc(u.nombre) + '</button>';
                    }).join('') +
                  '</div>' +
                '</div>';
              }).join('') +
            '</div>' +
            '<button type="button" id="fs-btn-combinar" class="fs-enlace-combinar" ' +
              (borrador.modo === 'mixto' ? 'hidden' : '') + '>' +
              '➕ Combinar varios usos en un mismo proyecto</button>' +

            '<div id="fs-combinador" ' + (borrador.modo === 'mixto' ? '' : 'hidden') + '>' +
              '<p class="fs-pista">Elige los usos que van en el mismo predio. El veredicto será el ' +
                'promedio de cada uno, más qué tan bien conviven entre sí.</p>' +
              '<div class="fs-usos-chips" id="fs-usos-chips">' +
                MOTOR.PROGRAMA.map(function(u){
                  return '<button type="button" class="fs-chip-uso' +
                    (borrador.usosMixto.indexOf(u.id) !== -1 ? ' activa' : '') + '" data-uso-mixto="' + u.id + '">' +
                    u.icono + ' ' + esc(u.nombre) + '</button>';
                }).join('') +
              '</div>' +
              '<button type="button" id="fs-btn-un-uso" class="fs-enlace-combinar">↩️ Usar un solo uso</button>' +
            '</div>' +
          '</div>' +

          '<div class="fs-paso">' +
            '<h2><i>4</i> Nombre del estudio <em>(opcional)</em></h2>' +
            '<input id="fs-nombre" type="text" maxlength="70" autocomplete="off" ' +
              'placeholder="Ej. Lote Av. Libertadores, Torre Norte…" />' +
            '<p class="fs-pista">Así lo reconoces después en «Mis estudios» y en el PDF.</p>' +
          '</div>' +

          '<button type="button" id="fs-analizar" class="fs-btn fs-btn--principal fs-btn--grande" disabled>' +
            'Marca el predio para continuar</button>' +
        '</div>' +

        '<div class="fs-trabajando" id="fs-trabajando" hidden>' +
          '<div class="fs-girando fs-girando--grande"></div>' +
          '<p id="fs-trabajando-texto">Consultando el entorno del predio…</p>' +
          '<p class="fs-pista">Puede tardar hasta un minuto: los servidores de mapas ' +
            'son gratuitos y a veces están ocupados.</p>' +
        '</div>' +

        '<div class="fs-fallo" id="fs-fallo" hidden>' +
          '<div class="fs-fallo-icono">⚠️</div>' +
          '<h2>No se pudo completar el estudio</h2>' +
          '<p id="fs-fallo-texto"></p>' +
          '<div class="fs-fallo-acciones">' +
            '<button type="button" class="fs-btn fs-btn--principal" id="fs-reintentar">Reintentar</button>' +
            '<button type="button" class="fs-btn fs-btn--tenue" id="fs-volver-form">Cambiar el predio</button>' +
          '</div>' +
        '</div>' +

        '<div class="fs-resultado" id="fs-resultado" hidden></div>' +

      '</section>' +
    '</div>';
  }

  /* ═══ Mapa ═════════════════════════════════════════════════════════════ */
  function iniciarMapa(){
    mapa = L.map('fs-mapa', { zoomControl: false, attributionControl: true })
            .setView([FS.cfg.CENTRO.lat, FS.cfg.CENTRO.lng], FS.cfg.ZOOM);
    L.control.zoom({ position:'topright' }).addTo(mapa);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, attribution: '© OpenStreetMap · © CARTO'
    }).addTo(mapa);
    capaPuntos = L.layerGroup().addTo(mapa);
    mapa.on('click', function(ev){ fijarPredio(ev.latlng.lat, ev.latlng.lng); });

    // Botón para superponer los polígonos de estrato del DANE — "los colores
    // de las personas" que piden ver, no solo comercios y vías.
    var CtrlEstrato = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(){
        var btn = L.DomUtil.create('button', 'fs-mapa-btn');
        btn.type = 'button';
        btn.innerHTML = '🎨';
        btn.title = 'Ver estratos socioeconómicos del DANE';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', alternarEstratos);
        botonEstratoBtn = btn;
        return btn;
      }
    });
    new CtrlEstrato().addTo(mapa);

    setTimeout(function(){ mapa.invalidateSize(); }, 220);
  }

  function actualizarBotonEstrato(estado){
    if (!botonEstratoBtn) return;
    botonEstratoBtn.innerHTML = estado === 'cargando' ? '⏳' : estado === 'activo' ? '🎨' : '🎨';
    botonEstratoBtn.classList.toggle('activo', estado === 'activo');
  }

  function alternarEstratos(){
    if (capaEstratos) {
      mapa.removeLayer(capaEstratos);
      capaEstratos = null;
      pintarLeyendaEstrato(false);
      actualizarBotonEstrato('inactivo');
      return;
    }
    if (!borrador.punto) { FS.aviso('Primero marca el predio en el mapa.', 'info'); return; }
    actualizarBotonEstrato('cargando');
    DATOS.estratoPoligonos(borrador.punto.lat, borrador.punto.lng, Math.max(borrador.radioM, 700))
      .then(function(gj){
        if (!gj || !gj.features || !gj.features.length) {
          actualizarBotonEstrato('inactivo');
          FS.aviso('El DANE no tiene polígonos de estrato para este sector.', 'info');
          return;
        }
        capaEstratos = L.geoJSON(gj, {
          style: function(f){
            return { color:'#0b1a22', weight:1, fillColor: colorEstrato(f.properties.estratoNum), fillOpacity:.48 };
          },
          onEachFeature: function(f, layer){
            var n = f.properties.estratoNum;
            layer.bindTooltip('Estrato ' + (n || 'sin dato'));
          }
        }).addTo(mapa);
        capaEstratos.bringToBack();
        pintarLeyendaEstrato(true);
        actualizarBotonEstrato('activo');
      })
      .catch(function(){
        actualizarBotonEstrato('inactivo');
        FS.aviso('No se pudo cargar la capa de estratos.', 'error');
      });
  }

  function pintarLeyendaEstrato(mostrar){
    var existente = dom.uno('#fs-leyenda-estrato');
    if (existente) existente.remove();
    if (!mostrar) return;
    var div = document.createElement('div');
    div.id = 'fs-leyenda-estrato';
    div.className = 'fs-leyenda fs-leyenda--estrato';
    div.innerHTML = '<b>Estrato predominante</b>' +
      [1,2,3,4,5,6].map(function(n){
        return '<span><i style="background:' + colorEstrato(n) + '"></i>Estrato ' + n + '</span>';
      }).join('');
    dom.uno('#fs-mapa').appendChild(div);
  }

  function fijarPredio(lat, lng, etiqueta){
    borrador.punto = { lat: lat, lng: lng };
    if (capaPredio) mapa.removeLayer(capaPredio);
    capaPredio = L.marker([lat, lng], {
      icon: L.divIcon({ className:'fs-pin', html:'<span></span>', iconSize:[26, 26], iconAnchor:[13, 13] })
    }).addTo(mapa);
    dibujarRadio();
    mapa.setView([lat, lng], Math.max(mapa.getZoom(), 16));

    var pista = dom.uno('#fs-pista-predio');
    if (etiqueta) {
      borrador.direccion = direccionCorta(etiqueta);
      if (pista) pista.textContent = '📍 ' + borrador.direccion;
    } else {
      if (pista) pista.textContent = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' — buscando dirección…';
      DATOS.direccionDe(lat, lng).then(function(d){
        if (!d || !borrador.punto || borrador.punto.lat !== lat) return;
        borrador.direccion = d;
        if (pista) pista.textContent = '📍 ' + d;
      });
    }
    refrescarBoton();
  }

  function dibujarRadio(){
    if (!borrador.punto) return;
    if (capaRadio) mapa.removeLayer(capaRadio);
    capaRadio = L.circle([borrador.punto.lat, borrador.punto.lng], {
      radius: borrador.radioM, color:'#16b3c9', weight:2, fillColor:'#16b3c9', fillOpacity:.08
    }).addTo(mapa);
  }

  function pintarEntorno(elementos){
    capaPuntos.clearLayers();
    var presentes = {};
    elementos.slice(0, 900).forEach(function(el){
      if (el.tags && el.tags.highway) return;
      var cat = MOTOR.categoriaDe(el.tags);
      presentes[cat] = true;
      L.circleMarker([el.lat, el.lng], {
        radius:4.5, weight:1, color:'#0b1a22',
        fillColor: LECTURA.colorCategoria(cat), fillOpacity:.9
      }).bindTooltip(el.nombre || LECTURA.NOMBRE_CATEGORIA[cat] || 'Sin clasificar').addTo(capaPuntos);
    });
    pintarLeyendaCategorias(presentes);
  }

  function pintarLeyendaCategorias(presentes){
    if (leyendaCtrl) { mapa.removeControl(leyendaCtrl); leyendaCtrl = null; }
    var cats = Object.keys(presentes).sort(function(a, b){
      return (LECTURA.NOMBRE_CATEGORIA[a] || a).localeCompare(LECTURA.NOMBRE_CATEGORIA[b] || b);
    });
    if (!cats.length) return;
    leyendaCtrl = L.control({ position:'bottomleft' });
    leyendaCtrl.onAdd = function(){
      var div = L.DomUtil.create('div', 'fs-leyenda');
      div.innerHTML = '<b>Qué es cada color</b>' + cats.map(function(c){
        return '<span><i style="background:' + LECTURA.colorCategoria(c) + '"></i>' +
               esc(LECTURA.NOMBRE_CATEGORIA[c] || c) + '</span>';
      }).join('');
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    leyendaCtrl.addTo(mapa);
  }

  /* ═══ Análisis ═════════════════════════════════════════════════════════ */
  function refrescarBoton(){
    var b = dom.uno('#fs-analizar');
    if (!b) return;
    var faltaUso = borrador.modo === 'mixto' && !borrador.usosMixto.length;
    b.disabled = !borrador.punto || faltaUso;
    b.textContent = !borrador.punto ? 'Marca el predio para continuar' :
                     faltaUso ? 'Elige al menos un uso' : 'Analizar viabilidad';
  }

  function mostrar(cual){
    ['fs-formulario','fs-trabajando','fs-fallo','fs-resultado'].forEach(function(id){
      var el = dom.uno('#' + id);
      if (el) el.hidden = (id !== cual);
    });
    var panel = dom.uno('#fs-panel');
    if (panel) panel.scrollTop = 0;
  }

  function analizar(){
    if (!borrador.punto) return;
    borrador.nombre = (dom.uno('#fs-nombre') || {}).value || '';
    mostrar('fs-trabajando');

    var avisar = function(t){
      var el = dom.uno('#fs-trabajando-texto');
      if (el) el.textContent = t;
    };

    DATOS.recolectar(borrador.punto, borrador.radioM, avisar)
      .then(function(paquete){
        avisar('Calculando el índice de viabilidad…');
        paquete._radioFetch = borrador.radioM;
        FS.estado.fijar({ entorno: paquete });
        pintarEntorno(paquete.elementos);
        calcularYMostrar(paquete);
      })
      .catch(function(err){
        // El fallo se queda en pantalla con un botón para reintentar. Un
        // aviso que se desvanece dejaba al usuario de vuelta en el formulario
        // sin saber qué pasó ni qué hacer.
        dom.uno('#fs-fallo-texto').textContent = (err && err.message) ||
          'No pudimos leer el entorno del predio.';
        mostrar('fs-fallo');
      });
  }

  // Recalcula con lo que ya está en memoria: cambiar el uso no cuesta red.
  function calcularYMostrar(paquete){
    var censo = paquete.censo;
    var poblacion = censo ? censo.habitantes : 0;
    var mezclaUsos = null;
    var estudio;

    if (borrador.modo === 'mixto' && borrador.usosMixto.length) {
      var programa = MOTOR.calcularPrograma({
        elementos: paquete.elementos, radioM: borrador.radioM,
        centro: borrador.punto, usos: borrador.usosMixto, poblacion: poblacion
      });
      // Se reutiliza calcularIndice en modo 'general' solo para obtener el
      // inventario del entorno (porCategoria, vías) — el índice de esa
      // llamada se descarta, el que manda es el promedio del programa.
      var entorno = MOTOR.calcularIndice({
        elementos: paquete.elementos, radioM: borrador.radioM,
        centro: borrador.punto, tipoNegocio: 'general', poblacion: poblacion
      });
      mezclaUsos = MOTOR.indiceMezclaUsos(entorno.porCategoria);

      estudio = {
        modo: 'mixto',
        indice: programa.indiceConjunto, nivel: programa.nivel,
        porUso: programa.porUso, compatibilidad: programa.compatibilidad,
        porCategoria: entorno.porCategoria, viasCercanas: entorno.viasCercanas,
        radioM: borrador.radioM, mezclaUsos: mezclaUsos,
        nombre: borrador.nombre || ('Programa combinado · ' + (borrador.direccion || FS.cfg.CIUDAD)),
        lat: borrador.punto.lat, lng: borrador.punto.lng, direccion: borrador.direccion,
        censo: censo, procedencia: paquete.procedencia,
        totalPuntos: paquete.elementos.length, fecha: new Date().toISOString()
      };
    } else {
      var uso = usoActual();
      var resultado = MOTOR.calcularIndice({
        elementos: paquete.elementos, radioM: borrador.radioM,
        centro: borrador.punto, tipoNegocio: uso.perfil, poblacion: poblacion
      });
      mezclaUsos = MOTOR.indiceMezclaUsos(resultado.porCategoria);
      estudio = Object.assign({}, resultado, {
        modo: 'simple', usoId: uso.id,
        nombre: borrador.nombre || (uso.nombre + ' · ' + (borrador.direccion || FS.cfg.CIUDAD)),
        lat: borrador.punto.lat, lng: borrador.punto.lng,
        direccion: borrador.direccion,
        usoNombre: uso.nombre, usoIcono: uso.icono,
        censo: censo, procedencia: paquete.procedencia,
        totalPuntos: paquete.elementos.length, mezclaUsos: mezclaUsos,
        fecha: new Date().toISOString()
      });
    }

    FS.estado.fijar({ estudio: estudio });
    if (estudio.modo === 'mixto') pintarResultadoMixto(estudio); else pintarResultado(estudio);
    mostrar('fs-resultado');
  }

  /* ═══ Comparación por radio (sin red si ya se tiene el radio máximo) ═══ */
  function compararRadios(boton){
    var paquete = FS.estado.obtener('entorno');
    if (!paquete) return;
    var maxR = Math.max.apply(null, FS.cfg.RADIOS);

    function continuar(elementos){
      var filas = FS.cfg.RADIOS.map(function(r){
        var poblacion = paquete.censo ? paquete.censo.habitantes : 0;
        var res;
        if (borrador.modo === 'mixto' && borrador.usosMixto.length) {
          res = MOTOR.calcularPrograma({
            elementos: elementos, radioM: r, centro: borrador.punto,
            usos: borrador.usosMixto, poblacion: poblacion
          });
          return { radioM:r, indice: res.indiceConjunto, nivel: res.nivel };
        }
        res = MOTOR.calcularIndice({
          elementos: elementos, radioM: r, centro: borrador.punto,
          tipoNegocio: usoActual().perfil, poblacion: poblacion
        });
        return { radioM:r, indice: res.indice, nivel: res.nivel };
      });
      pintarComparacionRadios(filas);
    }

    if ((paquete._radioFetch || 0) >= maxR) { continuar(paquete.elementos); return; }

    var libre = boton ? FS.util.ocupar(boton, 'Ampliando…') : function(){};
    DATOS.elementosEntorno(borrador.punto.lat, borrador.punto.lng, maxR).then(function(elementosGrandes){
      libre();
      paquete.elementos = elementosGrandes;
      paquete._radioFetch = maxR;
      FS.estado.fijar({ entorno: paquete });
      continuar(elementosGrandes);
    }).catch(function(){
      libre();
      FS.aviso('No se pudo ampliar la consulta para comparar todos los radios.', 'error');
    });
  }

  function pintarComparacionRadios(filas){
    var caja = dom.uno('#fs-comparacion-radios');
    if (!caja) return;
    caja.hidden = false;
    caja.innerHTML = '<h3>Viabilidad según el radio</h3>' +
      '<div class="fs-comp-filas">' +
        filas.map(function(f){
          var activa = f.radioM === borrador.radioM;
          return '<div class="fs-comp-fila' + (activa ? ' activa' : '') + '">' +
            '<span>' + (f.radioM >= 1000 ? (f.radioM / 1000) + ' km' : f.radioM + ' m') + '</span>' +
            '<b>' + f.indice + '</b><small>' + esc(f.nivel) + '</small></div>';
        }).join('') +
      '</div>' +
      '<p class="fs-pista">Usa la misma población del censo para los cuatro tamaños: una aproximación, ' +
        'no una consulta independiente por radio.</p>';
  }

  /* ═══ Resultado ════════════════════════════════════════════════════════ */
  function medidor(indice, color){
    var r = 52, circ = 2 * Math.PI * r;
    var avance = circ * (1 - Math.min(100, Math.max(0, indice)) / 100);
    return '' +
      '<svg class="fs-medidor" viewBox="0 0 128 128" role="img" aria-label="Índice ' + indice + ' de 100">' +
        '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="13"/>' +
        '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="13" ' +
          'stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" ' +
          'stroke-dashoffset="' + avance.toFixed(1) + '" transform="rotate(-90 64 64)"/>' +
        '<text x="64" y="60" text-anchor="middle" class="fs-medidor-num">' + indice + '</text>' +
        '<text x="64" y="80" text-anchor="middle" class="fs-medidor-pie">de 100</text>' +
      '</svg>';
  }

  function barra(nombre, valor, peso){
    return '' +
      '<div class="fs-barra">' +
        '<div class="fs-barra-cab"><b>' + esc(nombre) + '</b>' +
          '<span><i>' + valor + '</i>/100 · peso ' + peso + '%</span></div>' +
        '<div class="fs-barra-riel"><span style="width:' + valor + '%"></span></div>' +
      '</div>';
  }

  function pintarResultado(e){
    var lec = LECTURA.narrar(e, e.censo);
    var fuerzas = lec.señales.filter(function(s){ return s.tipo === 'fuerza'; });
    var riesgos = lec.señales.filter(function(s){ return s.tipo === 'riesgo'; });
    var datos   = lec.señales.filter(function(s){ return s.tipo === 'dato'; });

    var cats = Object.keys(e.porCategoria || {})
      .filter(function(c){ return c !== 'otro'; })
      .sort(function(a, b){ return e.porCategoria[b] - e.porCategoria[a]; });

    dom.uno('#fs-resultado').innerHTML = '' +
      '<div class="fs-res-cab">' +
        '<div>' +
          '<h2>' + esc(e.nombre) + '</h2>' +
          '<p>' + e.usoIcono + ' ' + esc(e.usoNombre) + ' · radio ' + FS.util.numero(e.radioM) + ' m' +
            (e.direccion ? ' · ' + esc(e.direccion) : '') + '</p>' +
        '</div>' +
        '<div class="fs-res-acciones">' +
          '<button type="button" class="fs-btn" id="fs-guardar">Guardar</button>' +
          '<button type="button" class="fs-btn" id="fs-comparar-radios">📊 Comparar radios</button>' +
          '<button type="button" class="fs-btn" id="fs-pdf">Informe PDF</button>' +
          '<button type="button" class="fs-btn fs-btn--tenue" id="fs-nuevo">Nuevo estudio</button>' +
        '</div>' +
      '</div>' +

      '<div class="fs-bloque" id="fs-comparacion-radios" hidden></div>' +

      '<div class="fs-veredicto" style="--tono:' + lec.color + '">' +
        medidor(e.indice, lec.color) +
        '<div class="fs-veredicto-texto">' +
          '<b>' + esc(lec.titulo) + '</b>' +
          '<p>' + esc(lec.resumen) + '</p>' +
        '</div>' +
      '</div>' +

      '<div class="fs-cambiar-uso">' +
        '<label for="fs-usos-res">Ver el mismo predio como:</label>' +
        '<select id="fs-usos-res">' +
          GRUPOS_PROGRAMA.map(function(g){
            var items = programaPorGrupo(g.perfil);
            if (!items.length) return '';
            return '<optgroup label="' + esc(g.titulo) + '">' +
              items.map(function(u){
                return '<option value="' + u.id + '"' + (u.id === borrador.usoId ? ' selected' : '') + '>' +
                       u.icono + ' ' + esc(u.nombre) + '</option>';
              }).join('') +
            '</optgroup>';
          }).join('') +
        '</select>' +
      '</div>' +

      '<div class="fs-bloque">' +
        '<h3>Cómo se compone el índice</h3>' +
        lec.criterios.map(function(c){ return barra(c.nombre, c.valor, c.peso); }).join('') +
      '</div>' +

      (e.censo ? bloqueCenso(e.censo) : '') +

      '<div class="fs-bloque">' +
        '<h3>Dictamen</h3>' +
        lec.parrafos.map(function(p){ return '<p class="fs-parrafo">' + esc(p) + '</p>'; }).join('') +
      '</div>' +

      '<div class="fs-columnas">' +
        listaSeñales('A favor', fuerzas, 'fuerza') +
        listaSeñales('A vigilar', riesgos, 'riesgo') +
      '</div>' +
      (datos.length ? listaSeñales('Contexto del censo', datos, 'dato') : '') +

      '<div class="fs-bloque">' +
        '<h3>Qué hay en el radio <small>' + FS.util.numero(e.totalPuntos) + ' puntos leídos</small></h3>' +
        '<div class="fs-fichas">' +
          cats.map(function(c){
            return '<div class="fs-ficha" style="--tono:' + LECTURA.colorCategoria(c) + '">' +
                   '<b>' + e.porCategoria[c] + '</b>' +
                   '<span>' + esc(LECTURA.NOMBRE_CATEGORIA[c] || c) + '</span></div>';
          }).join('') +
        '</div>' +
        bloqueMezclaUsos(e.mezclaUsos) +
      '</div>' +

      '<div class="fs-procedencia">' +
        '<b>Con qué datos se hizo</b>' +
        (e.procedencia || []).map(function(f){
          return '<p>' + (f.disponible ? '✅' : '⚠️') + ' <b>' + esc(f.nombre) + '</b> — ' +
                 esc(f.disponible ? f.aporta : 'no disponible en esta consulta') +
                 '<br><small>' + esc(f.licencia) + '</small></p>';
        }).join('') +
      '</div>';

    enlazarResultado();
  }

  /* ═══ Resultado — programa de varios usos ═══════════════════════════════ */
  function estrellas(n){
    var llenas = '★'.repeat(n), vacias = '☆'.repeat(5 - n);
    return '<span class="fs-estrellas">' + llenas + vacias + '</span>';
  }

  function pintarResultadoMixto(e){
    var nivel = LECTURA.NIVELES[e.nivel] || LECTURA.NIVELES.Media;
    var cats = Object.keys(e.porCategoria || {})
      .filter(function(c){ return c !== 'otro'; })
      .sort(function(a, b){ return e.porCategoria[b] - e.porCategoria[a]; });

    dom.uno('#fs-resultado').innerHTML = '' +
      '<div class="fs-res-cab">' +
        '<div>' +
          '<h2>' + esc(e.nombre) + '</h2>' +
          '<p>🧩 Programa combinado · ' + e.porUso.length + ' usos · radio ' +
            FS.util.numero(e.radioM) + ' m' + (e.direccion ? ' · ' + esc(e.direccion) : '') + '</p>' +
        '</div>' +
        '<div class="fs-res-acciones">' +
          '<button type="button" class="fs-btn" id="fs-guardar">Guardar</button>' +
          '<button type="button" class="fs-btn" id="fs-comparar-radios">📊 Comparar radios</button>' +
          '<button type="button" class="fs-btn fs-btn--tenue" id="fs-nuevo">Nuevo estudio</button>' +
        '</div>' +
      '</div>' +

      '<div class="fs-bloque" id="fs-comparacion-radios" hidden></div>' +

      '<div class="fs-veredicto" style="--tono:' + nivel.color + '">' +
        medidor(e.indice, nivel.color) +
        '<div class="fs-veredicto-texto">' +
          '<b>' + esc(nivel.titulo) + ' del conjunto</b>' +
          '<p>Promedio de los ' + e.porUso.length + ' usos elegidos — cada uno se evalúa con su propio ' +
            'perfil de criterios, y el veredicto conjunto es el punto medio entre todos.</p>' +
        '</div>' +
      '</div>' +

      '<div class="fs-bloque">' +
        '<h3>Cada uso por separado</h3>' +
        '<div class="fs-desglose-usos">' +
          e.porUso.map(function(u){
            var n = LECTURA.NIVELES[u.nivel] || LECTURA.NIVELES.Media;
            return '<div class="fs-uso-mini" style="--tono:' + n.color + '">' +
              '<span class="fs-uso-mini-ico">' + u.icono + '</span>' +
              '<b>' + esc(u.nombre) + '</b>' +
              '<div class="fs-uso-mini-indice">' + u.indice + '</div>' +
              '<small>' + esc(u.nivel) + '</small></div>';
          }).join('') +
        '</div>' +
      '</div>' +

      (e.compatibilidad.length ? '<div class="fs-bloque">' +
        '<h3>Compatibilidad entre los usos elegidos</h3>' +
        '<div class="fs-compatibilidad">' +
          e.compatibilidad.map(function(c){
            return '<div class="fs-compat-fila">' +
              '<div class="fs-compat-par">' + esc(c.a) + ' + ' + esc(c.b) + '</div>' +
              estrellas(c.estrellas) +
              '<p>' + esc(c.motivo) + '</p></div>';
          }).join('') +
        '</div>' +
      '</div>' : '') +

      (e.censo ? bloqueCenso(e.censo) : '') +

      '<div class="fs-bloque">' +
        '<h3>Qué hay en el radio <small>' + FS.util.numero(e.totalPuntos) + ' puntos leídos</small></h3>' +
        '<div class="fs-fichas">' +
          cats.map(function(c){
            return '<div class="fs-ficha" style="--tono:' + LECTURA.colorCategoria(c) + '">' +
                   '<b>' + e.porCategoria[c] + '</b>' +
                   '<span>' + esc(LECTURA.NOMBRE_CATEGORIA[c] || c) + '</span></div>';
          }).join('') +
        '</div>' +
        bloqueMezclaUsos(e.mezclaUsos) +
      '</div>' +

      '<div class="fs-procedencia">' +
        '<b>Con qué datos se hizo</b>' +
        (e.procedencia || []).map(function(f){
          return '<p>' + (f.disponible ? '✅' : '⚠️') + ' <b>' + esc(f.nombre) + '</b> — ' +
                 esc(f.disponible ? f.aporta : 'no disponible en esta consulta') +
                 '<br><small>' + esc(f.licencia) + '</small></p>';
        }).join('') +
        '<p class="fs-nota-pdf">📄 El informe en PDF para programas combinados llega en la próxima ' +
          'versión — por ahora, evalúa cada uso por separado para exportarlo.</p>' +
      '</div>';

    enlazarResultadoMixto();
  }

  function enlazarResultadoMixto(){
    var raiz = dom.uno('#fs-resultado');

    dom.uno('#fs-nuevo', raiz).addEventListener('click', function(){
      FS.estado.fijar({ estudio: null });
      mostrar('fs-formulario');
    });

    var btnComparar = dom.uno('#fs-comparar-radios', raiz);
    if (btnComparar) btnComparar.addEventListener('click', function(ev){ compararRadios(ev.currentTarget); });

    dom.uno('#fs-guardar', raiz).addEventListener('click', function(ev){
      var libre = FS.util.ocupar(ev.currentTarget, 'Guardando…');
      FS.api.llamar('guardar_estudio', { estudio: FS.estado.obtener('estudio') }).then(function(res){
        libre();
        FS.aviso(res.ok ? 'Estudio guardado.' : (res.error || 'No se pudo guardar.'),
                 res.ok ? 'exito' : 'error');
      });
    });
  }

  function bloqueCenso(c){
    var filas = [
      { et:'Habitantes en el radio', v: FS.util.numero(c.habitantes) },
      c.viviendas ? { et:'Viviendas', v: FS.util.numero(c.viviendas) } : null,
      c.personasPorVivienda ? { et:'Personas por vivienda', v: c.personasPorVivienda } : null,
      c.estrato ? { et:'Estrato predominante', v: c.estrato.predominante +
        ' (promedio ' + c.estrato.promedio + ')' } : null,
      { et:'Detalle del dato', v: c.nivel === 'manzana' ? 'Manzana censal' : 'Sector censal (aproximado)' }
    ].filter(Boolean);

    return '' +
      '<div class="fs-bloque">' +
        '<h3>Población según el Censo 2018 <small>DANE</small></h3>' +
        '<div class="fs-tabla">' +
          filas.map(function(f){
            return '<div class="fs-tabla-fila"><span>' + esc(f.et) + '</span><b>' + esc(f.v) + '</b></div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function bloqueMezclaUsos(valor){
    if (valor == null) return '';
    var lectura = valor >= 65 ? 'sector mezclado: conviven varios tipos de actividad'
                : valor >= 35 ? 'mezcla moderada: predomina un tipo de uso, con algo más alrededor'
                : 'sector monofuncional: casi todo es el mismo tipo de actividad';
    return '<div class="fs-mezcla-usos">' +
      '<div class="fs-barra-riel"><span style="width:' + valor + '%"></span></div>' +
      '<p><b>Mezcla de usos del sector: ' + valor + '/100</b> — ' + esc(lectura) + '.</p>' +
    '</div>';
  }

  function listaSeñales(titulo, lista, tipo){
    if (!lista.length) return '';
    return '' +
      '<div class="fs-bloque fs-bloque--' + tipo + '">' +
        '<h3>' + esc(titulo) + '</h3>' +
        '<ul class="fs-senales">' +
          lista.map(function(s){
            return '<li>' + (s.criterio ? '<b>' + esc(s.criterio) + ':</b> ' : '') + esc(s.texto) + '</li>';
          }).join('') +
        '</ul>' +
      '</div>';
  }

  function enlazarResultado(){
    var raiz = dom.uno('#fs-resultado');

    var selectorUso = dom.uno('#fs-usos-res', raiz);
    if (selectorUso) selectorUso.addEventListener('change', function(ev){
      borrador.usoId = ev.currentTarget.value;
      var paquete = FS.estado.obtener('entorno');
      if (paquete) calcularYMostrar(paquete);
    });

    dom.uno('#fs-nuevo', raiz).addEventListener('click', function(){
      FS.estado.fijar({ estudio: null });
      mostrar('fs-formulario');
    });

    dom.uno('#fs-pdf', raiz).addEventListener('click', function(){
      window.FUXORASCOPE_INFORME.abrir(FS.estado.obtener('estudio'));
    });

    var btnComparar = dom.uno('#fs-comparar-radios', raiz);
    if (btnComparar) btnComparar.addEventListener('click', function(ev){ compararRadios(ev.currentTarget); });

    dom.uno('#fs-guardar', raiz).addEventListener('click', function(ev){
      var libre = FS.util.ocupar(ev.currentTarget, 'Guardando…');
      FS.api.llamar('guardar_estudio', { estudio: FS.estado.obtener('estudio') }).then(function(res){
        libre();
        FS.aviso(res.ok ? 'Estudio guardado.' : (res.error || 'No se pudo guardar.'),
                 res.ok ? 'exito' : 'error');
      });
    });
  }

  /* ═══ Enganches del formulario ═════════════════════════════════════════ */
  function enlazarFormulario(raiz){
    var caja = dom.uno('#fs-buscar', raiz);
    var lista = dom.uno('#fs-sugerencias', raiz);
    var reloj = null;

    caja.addEventListener('input', function(){
      clearTimeout(reloj);
      var texto = caja.value.trim();
      if (texto.length < 3) { lista.hidden = true; return; }
      reloj = setTimeout(function(){
        DATOS.buscarDireccion(texto).then(function(resultados){
          if (!resultados.length) { lista.hidden = true; return; }
          lista.innerHTML = resultados.map(function(r, i){
            return '<li><button type="button" data-i="' + i + '">' + esc(r.etiqueta) + '</button></li>';
          }).join('');
          lista.hidden = false;
          lista._datos = resultados;
        });
      }, 420);
    });

    lista.addEventListener('click', function(ev){
      var b = ev.target.closest('button[data-i]');
      if (!b) return;
      var r = (lista._datos || [])[Number(b.getAttribute('data-i'))];
      if (!r) return;
      lista.hidden = true;
      caja.value = r.etiqueta.split(',').slice(0, 2).join(', ');
      fijarPredio(r.lat, r.lng, r.etiqueta);
    });

    dom.enlazar(dom.uno('#fs-radios', raiz), {
      'click [data-radio]': function(ev, b){
        dom.todos('#fs-radios .fs-opcion', raiz).forEach(function(o){ o.classList.remove('activa'); });
        b.classList.add('activa');
        borrador.radioM = Number(b.getAttribute('data-radio'));
        dibujarRadio();
      }
    });

    dom.enlazar(dom.uno('#fs-usos', raiz), {
      'click [data-uso]': function(ev, b){
        dom.todos('#fs-usos .fs-chip-uso', raiz).forEach(function(o){ o.classList.remove('activa'); });
        b.classList.add('activa');
        borrador.usoId = b.getAttribute('data-uso');
      }
    });

    dom.uno('#fs-btn-combinar', raiz).addEventListener('click', function(){
      borrador.modo = 'mixto';
      dom.uno('#fs-usos', raiz).hidden = true;
      dom.uno('#fs-btn-combinar', raiz).hidden = true;
      dom.uno('#fs-combinador', raiz).hidden = false;
      refrescarBoton();
    });
    dom.uno('#fs-btn-un-uso', raiz).addEventListener('click', function(){
      borrador.modo = 'simple';
      borrador.usosMixto = [];
      dom.uno('#fs-usos', raiz).hidden = false;
      dom.uno('#fs-btn-combinar', raiz).hidden = false;
      dom.uno('#fs-combinador', raiz).hidden = true;
      dom.todos('#fs-usos-chips .fs-chip-uso', raiz).forEach(function(c){ c.classList.remove('activa'); });
      refrescarBoton();
    });
    dom.enlazar(dom.uno('#fs-usos-chips', raiz), {
      'click [data-uso-mixto]': function(ev, b){
        var id = b.getAttribute('data-uso-mixto');
        var i = borrador.usosMixto.indexOf(id);
        if (i === -1) borrador.usosMixto.push(id); else borrador.usosMixto.splice(i, 1);
        b.classList.toggle('activa');
        refrescarBoton();
      }
    });

    dom.uno('#fs-analizar', raiz).addEventListener('click', analizar);
    dom.uno('#fs-reintentar', raiz).addEventListener('click', analizar);
    dom.uno('#fs-volver-form', raiz).addEventListener('click', function(){ mostrar('fs-formulario'); });
  }

  /* ═══ Registro de la vista ═════════════════════════════════════════════ */
  FS.ruta.registrar('estudio', {
    privada: true,
    plantilla: plantilla,
    montar: function(raiz){
      iniciarMapa();
      enlazarFormulario(raiz);

      // Si se llega desde "Mis estudios", se pinta el estudio ya cargado.
      var previo = FS.estado.obtener('estudio');
      if (previo) {
        borrador.punto = { lat: previo.lat, lng: previo.lng };
        borrador.radioM = previo.radioM;
        borrador.direccion = previo.direccion || '';
        borrador.modo = previo.modo === 'mixto' ? 'mixto' : 'simple';
        borrador.usosMixto = previo.modo === 'mixto' ? (previo.porUso || []).map(function(u){ return u.id; }) : [];
        if (previo.modo !== 'mixto') {
          // Estudios guardados antes de este catálogo solo traían el perfil
          // (ej. "comercio"), no un uso concreto: se cae al primero de ese
          // grupo para no dejar el selector sin nada elegido.
          borrador.usoId = (previo.usoId && MOTOR.PROGRAMA_POR_ID[previo.usoId]) ? previo.usoId :
            ((programaPorGrupo(previo.tipoNegocio)[0] || MOTOR.PROGRAMA[0]).id);
        }
        fijarPredio(previo.lat, previo.lng, previo.direccion);
        if (previo.modo === 'mixto') pintarResultadoMixto(previo); else pintarResultado(previo);
        mostrar('fs-resultado');
      } else {
        refrescarBoton();
      }

      return function(){
        if (mapa) { mapa.remove(); mapa = null; }
        capaPredio = capaRadio = capaPuntos = capaEstratos = leyendaCtrl = botonEstratoBtn = null;
      };
    }
  });

  /* ═══ Vista: mis estudios ══════════════════════════════════════════════ */
  FS.ruta.registrar('mis-estudios', {
    privada: true,
    plantilla: function(){
      return '' +
      '<div class="fs-lista-pagina">' +
        '<header class="fs-lista-cab">' +
          '<h1>Mis estudios</h1>' +
          '<a class="fs-btn fs-btn--principal" href="#/estudio">Nuevo estudio</a>' +
        '</header>' +
        '<div id="fs-lista" class="fs-lista"><p class="fs-vacio">Cargando…</p></div>' +
      '</div>';
    },
    montar: function(raiz){
      var caja = dom.uno('#fs-lista', raiz);

      FS.api.llamar('listar_estudios', {}).then(function(res){
        if (!res.ok) { caja.innerHTML = '<p class="fs-vacio">' + esc(res.error) + '</p>'; return; }
        if (!res.estudios.length) {
          caja.innerHTML = '<p class="fs-vacio">Todavía no has guardado ningún estudio. ' +
                           'Corre uno y pulsa <b>Guardar</b>.</p>';
          return;
        }
        caja.innerHTML = res.estudios.map(function(e){
          var tono = e.nivel === 'Alta' ? '#1f9d55' : e.nivel === 'Media' ? '#c98a10' : '#c0392b';
          return '' +
          '<article class="fs-tarjeta" data-id="' + esc(e.estudio_id) + '">' +
            '<div class="fs-tarjeta-indice" style="--tono:' + tono + '"><b>' + e.indice + '</b><small>' + esc(e.nivel) + '</small></div>' +
            '<div class="fs-tarjeta-cuerpo">' +
              '<h3>' + esc(e.nombre) + '</h3>' +
              '<p>' + esc(e.tipoNegocio || 'Programa combinado') + ' · radio ' + FS.util.numero(e.radioM) + ' m · ' + esc(FS.util.fecha(e.creado)) + '</p>' +
            '</div>' +
            '<div class="fs-tarjeta-acciones">' +
              '<button type="button" class="fs-btn" data-abrir>Abrir</button>' +
              '<button type="button" class="fs-btn fs-btn--tenue" data-borrar>Borrar</button>' +
            '</div>' +
          '</article>';
        }).join('');
      });

      dom.enlazar(caja, {
        'click [data-abrir]': function(ev, b){
          var id = b.closest('.fs-tarjeta').getAttribute('data-id');
          var libre = FS.util.ocupar(b, 'Abriendo…');
          FS.api.llamar('abrir_estudio', { estudio_id: id }).then(function(res){
            libre();
            if (!res.ok) return FS.aviso(res.error, 'error');
            FS.estado.fijar({ estudio: res.estudio, entorno: null });
            FS.ruta.ir('estudio');
          });
        },
        'click [data-borrar]': function(ev, b){
          var tarjeta = b.closest('.fs-tarjeta');
          if (!confirm('¿Borrar este estudio? No se puede deshacer.')) return;
          FS.api.llamar('borrar_estudio', { estudio_id: tarjeta.getAttribute('data-id') }).then(function(res){
            if (!res.ok) return FS.aviso(res.error, 'error');
            tarjeta.remove();
            FS.aviso('Estudio borrado.', 'info');
          });
        }
      });
    }
  });

  window.FUXORASCOPE_ESTUDIO = { PROGRAMA: MOTOR.PROGRAMA };
})();

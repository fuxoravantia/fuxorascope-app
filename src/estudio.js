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

  var USOS = [
    { id:'comercio',    icono:'🛍️', nombre:'Comercio',      pie:'Local, tienda, superficie' },
    { id:'gastronomia', icono:'🍽️', nombre:'Gastronomía',   pie:'Restaurante, café, bar' },
    { id:'salud',       icono:'🩺', nombre:'Salud',          pie:'Consultorios, droguería, clínica' },
    { id:'oficinas',    icono:'💼', nombre:'Oficinas',       pie:'Corporativo, coworking' },
    { id:'general',     icono:'🏗️', nombre:'Uso mixto',      pie:'Vivienda + comercio, u otro' }
  ];

  var borrador = {
    punto: null, direccion: '', radioM: FS.cfg.RADIO_INICIAL,
    uso: 'comercio', nombre: ''
  };
  var mapa = null, capaPredio = null, capaRadio = null, capaPuntos = null;

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
            '<div class="fs-usos" id="fs-usos">' +
              USOS.map(function(u){
                return '<button type="button" class="fs-uso' + (u.id === borrador.uso ? ' activa' : '') +
                  '" data-uso="' + u.id + '">' +
                  '<span class="fs-uso-icono">' + u.icono + '</span>' +
                  '<b>' + esc(u.nombre) + '</b><small>' + esc(u.pie) + '</small></button>';
              }).join('') +
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
    setTimeout(function(){ mapa.invalidateSize(); }, 220);
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
    elementos.slice(0, 700).forEach(function(el){
      if (el.tags && el.tags.highway) return;
      L.circleMarker([el.lat, el.lng], {
        radius:4, weight:1, color:'#0b6e8f', fillColor:'#7fe9f7', fillOpacity:.85
      }).bindTooltip(el.nombre || MOTOR.categoriaDe(el.tags)).addTo(capaPuntos);
    });
  }

  /* ═══ Análisis ═════════════════════════════════════════════════════════ */
  function refrescarBoton(){
    var b = dom.uno('#fs-analizar');
    if (!b) return;
    b.disabled = !borrador.punto;
    b.textContent = borrador.punto ? 'Analizar viabilidad' : 'Marca el predio para continuar';
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
    var resultado = MOTOR.calcularIndice({
      elementos: paquete.elementos,
      radioM: borrador.radioM,
      centro: borrador.punto,
      tipoNegocio: borrador.uso,
      poblacion: censo ? censo.habitantes : 0
    });

    var uso = USOS.filter(function(u){ return u.id === borrador.uso; })[0] || USOS[0];
    var estudio = Object.assign({}, resultado, {
      nombre: borrador.nombre || (uso.nombre + ' · ' + (borrador.direccion || FS.cfg.CIUDAD)),
      lat: borrador.punto.lat, lng: borrador.punto.lng,
      direccion: borrador.direccion,
      usoNombre: uso.nombre, usoIcono: uso.icono,
      censo: censo,
      procedencia: paquete.procedencia,
      totalPuntos: paquete.elementos.length,
      fecha: new Date().toISOString()
    });

    FS.estado.fijar({ estudio: estudio });
    pintarResultado(estudio);
    mostrar('fs-resultado');
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
          '<button type="button" class="fs-btn" id="fs-pdf">Informe PDF</button>' +
          '<button type="button" class="fs-btn fs-btn--tenue" id="fs-nuevo">Nuevo estudio</button>' +
        '</div>' +
      '</div>' +

      '<div class="fs-veredicto" style="--tono:' + lec.color + '">' +
        medidor(e.indice, lec.color) +
        '<div class="fs-veredicto-texto">' +
          '<b>' + esc(lec.titulo) + '</b>' +
          '<p>' + esc(lec.resumen) + '</p>' +
        '</div>' +
      '</div>' +

      '<div class="fs-cambiar-uso">' +
        '<span>Ver el mismo predio como:</span>' +
        '<div class="fs-opciones" id="fs-usos-res">' +
          USOS.map(function(u){
            return '<button type="button" class="fs-opcion' + (u.id === borrador.uso ? ' activa' : '') +
                   '" data-uso="' + u.id + '">' + u.icono + ' ' + esc(u.nombre) + '</button>';
          }).join('') +
        '</div>' +
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
            return '<div class="fs-ficha"><b>' + e.porCategoria[c] + '</b>' +
                   '<span>' + esc(LECTURA.NOMBRE_CATEGORIA[c] || c) + '</span></div>';
          }).join('') +
        '</div>' +
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

    dom.enlazar(raiz, {
      'click [data-uso]': function(ev, b){
        borrador.uso = b.getAttribute('data-uso');
        var paquete = FS.estado.obtener('entorno');
        if (paquete) calcularYMostrar(paquete);
      }
    });

    dom.uno('#fs-nuevo', raiz).addEventListener('click', function(){
      FS.estado.fijar({ estudio: null });
      mostrar('fs-formulario');
    });

    dom.uno('#fs-pdf', raiz).addEventListener('click', function(){
      window.FUXORASCOPE_INFORME.abrir(FS.estado.obtener('estudio'));
    });

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
        dom.todos('#fs-usos .fs-uso', raiz).forEach(function(o){ o.classList.remove('activa'); });
        b.classList.add('activa');
        borrador.uso = b.getAttribute('data-uso');
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
        fijarPredio(previo.lat, previo.lng, previo.direccion);
        pintarResultado(previo);
        mostrar('fs-resultado');
      } else {
        refrescarBoton();
      }

      return function(){
        if (mapa) { mapa.remove(); mapa = null; }
        capaPredio = capaRadio = capaPuntos = null;
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
              '<p>' + esc(e.tipoNegocio) + ' · radio ' + FS.util.numero(e.radioM) + ' m · ' + esc(FS.util.fecha(e.creado)) + '</p>' +
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

  window.FUXORASCOPE_ESTUDIO = { USOS: USOS };
})();

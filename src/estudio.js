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

  /* ── Selector de usos con 148 opciones ─────────────────────────────────
     Familias plegadas + buscador. Se dibuja por JS y no en la plantilla
     porque cambia con cada búsqueda y con cada selección. */
  var familiaAbierta = null;

  function pintarSelectorUsos(filtro){
    var caja = document.getElementById('fs-usos');
    if (!caja) return;
    var texto = String(filtro || '').trim();

    // Buscando: lista plana con los resultados, sin familias de por medio.
    if (texto && USOS) {
      var hallados = USOS.buscar(texto);
      caja.innerHTML = hallados.length
        ? '<div class="fs-usos-grupo"><span class="fs-usos-grupo-titulo">' +
            hallados.length + ' resultado' + (hallados.length === 1 ? '' : 's') + '</span>' +
            '<div class="fs-usos-grupo-chips">' + hallados.map(chipUso).join('') + '</div></div>'
        : '<p class="fs-pista">Ningún negocio coincide con “' + esc(texto) + '”. ' +
          'Prueba con otra palabra o abre una familia.</p>';
      return;
    }

    if (!USOS) {   // respaldo: catálogo viejo agrupado por perfil
      caja.innerHTML = GRUPOS_PROGRAMA.map(function(g){
        var items = programaPorGrupo(g.perfil);
        if (!items.length) return '';
        return '<div class="fs-usos-grupo"><span class="fs-usos-grupo-titulo">' + esc(g.titulo) +
          '</span><div class="fs-usos-grupo-chips">' + items.map(chipUso).join('') + '</div></div>';
      }).join('');
      return;
    }

    // La familia del uso ya elegido se abre sola: si vuelvo al paso, quiero
    // ver dónde quedó mi selección, no una lista cerrada.
    var elegido = USOS.POR_ID[borrador.usoId];
    if (familiaAbierta === null && elegido) familiaAbierta = elegido.grupo;

    caja.innerHTML = USOS.porGrupo().map(function(g){
      var abierta = familiaAbierta === g.grupo.id;
      var marcados = g.usos.filter(function(u){
        return borrador.modo === 'mixto'
          ? borrador.usosMixto.indexOf(u.id) !== -1
          : u.id === borrador.usoId;
      }).length;
      return '<div class="fs-familia' + (abierta ? ' abierta' : '') + '">' +
        '<button type="button" class="fs-familia-cab" data-familia="' + g.grupo.id + '" ' +
          'aria-expanded="' + (abierta ? 'true' : 'false') + '">' +
          '<span class="fs-familia-ico" aria-hidden="true">' + g.grupo.icono + '</span>' +
          '<b>' + esc(g.grupo.nombre) + '</b>' +
          (marcados ? '<em class="fs-familia-marca">' + marcados + '</em>' : '') +
          '<span class="fs-familia-n">' + g.usos.length + '</span>' +
          '<span class="fs-familia-flecha" aria-hidden="true">›</span>' +
        '</button>' +
        (abierta ? '<div class="fs-usos-grupo-chips">' + g.usos.map(chipUso).join('') + '</div>' : '') +
      '</div>';
    }).join('');
  }

  /* ── Las dos preguntas ────────────────────────────────────────────────
     En modo "busco dónde" no hay predio que marcar: pedir una dirección
     sería contradecir la pregunta que el cliente acaba de hacer. */
  function aplicarPregunta(raiz){
    var r = raiz || document;
    var zona = borrador.pregunta === 'zona';
    dom.todos('[data-solo="predio"]', r).forEach(function(n){ n.hidden = zona; });
    var pista = dom.uno('#fs-pista-radio-zona', r);
    if (pista) pista.hidden = !zona;
    // El mapa deja de esperar un clic de predio y pasa a mostrar el área.
    if (zona && mapa) { try { mapa.fitBounds(cajaBusqueda()); } catch(e){} }
  }

  // Área que se barre. Se acota al casco urbano y no al área metropolitana
  // completa: una consulta de 33 km de lado a Overpass no vuelve (medido:
  // 103 s y respuesta vacía), y fuera del perímetro urbano casi no hay
  // entorno que evaluar.
  function cajaBusqueda(){
    var c = FS.cfg.CENTRO;
    var d = 0.035;                       // ~3,9 km a cada lado → 8 km de lado
    return [[c.lat - d, c.lng - d], [c.lat + d, c.lng + d]];
  }

  function chipUso(u){
    var activo = borrador.modo === 'mixto'
      ? borrador.usosMixto.indexOf(u.id) !== -1
      : u.id === borrador.usoId;
    var attr = borrador.modo === 'mixto' ? 'data-uso-mixto' : 'data-uso';
    return '<button type="button" class="fs-chip-uso' + (activo ? ' activa' : '') + '" ' +
      attr + '="' + u.id + '">' + u.icono + ' ' + esc(u.nombre) + '</button>';
  }

  /* ── Contador de unidades por uso ──────────────────────────────────────
     Lo que convierte una selección en un programa: no es lo mismo un local
     y doce apartamentos que doce locales y un apartamento. */
  function pintarCantidades(){
    var caja = document.getElementById('fs-cantidades');
    if (!caja) return;
    if (borrador.modo !== 'mixto' || !borrador.usosMixto.length || !USOS) {
      caja.innerHTML = ''; return;
    }
    var totalM2 = 0;
    var filas = borrador.usosMixto.map(function(id){
      var u = USOS.POR_ID[id] || MOTOR.PROGRAMA_POR_ID[id];
      if (!u) return '';
      var n = borrador.cantidades[id] || 1;
      var m2 = n * (u.m2 || 40);
      totalM2 += m2;
      return '<div class="fs-cant">' +
        '<span class="fs-cant-n">' + u.icono + ' ' + esc(u.nombre) + '</span>' +
        '<div class="fs-cant-ctl">' +
          '<button type="button" data-cant="-" data-id="' + id + '" aria-label="Quitar uno">−</button>' +
          '<b>' + n + '</b>' +
          '<button type="button" data-cant="+" data-id="' + id + '" aria-label="Agregar uno">+</button>' +
        '</div>' +
        '<span class="fs-cant-u">' + esc(u.unidad || 'unidades') + '<em>' +
          FS.util.numero(m2) + ' m²</em></span>' +
      '</div>';
    }).join('');

    caja.innerHTML = '<div class="fs-cant-caja">' + filas +
      '<div class="fs-cant-total"><span>Área construida estimada</span>' +
        '<b>' + FS.util.numero(totalM2) + ' m²</b></div>' +
      '<p class="fs-pista">Área aproximada según el tamaño típico de cada unidad. ' +
        'Sirve para dimensionar, no reemplaza un diseño arquitectónico.</p></div>';
  }
  // Solo los números cambian al pulsar +/−: la estructura de filas es la misma
  // mientras no se agregue ni quite un uso.
  function refrescarCifrasCantidades(){
    var caja = document.getElementById('fs-cantidades');
    if (!caja || !USOS) return;
    var totalM2 = 0;
    dom.todos('.fs-cant', caja).forEach(function(fila){
      var id = (fila.querySelector('[data-cant]') || {}).getAttribute
             ? fila.querySelector('[data-cant]').getAttribute('data-id') : null;
      if (!id) return;
      var u = USOS.POR_ID[id] || MOTOR.PROGRAMA_POR_ID[id] || {};
      var n = borrador.cantidades[id] || 1;
      var m2 = n * (u.m2 || 40);
      totalM2 += m2;
      var val = fila.querySelector('.fs-cant-ctl b');
      if (val) val.textContent = n;
      var area = fila.querySelector('.fs-cant-u em');
      if (area) area.textContent = FS.util.numero(m2) + ' m²';
    });
    var tot = caja.querySelector('.fs-cant-total b');
    if (tot) tot.textContent = FS.util.numero(totalM2) + ' m²';
  }

  // Marcar o desmarcar un uso del programa. Al marcarlo entra con una unidad:
  // un uso elegido sin cantidad no significaría nada al ponderar por área.
  function alternarUsoMixto(id){
    var i = borrador.usosMixto.indexOf(id);
    if (i === -1) { borrador.usosMixto.push(id); borrador.cantidades[id] = 1; }
    else { borrador.usosMixto.splice(i, 1); delete borrador.cantidades[id]; }
    pintarCantidades();
    refrescarBoton();
  }

  function usoActual(){
    return MOTOR.PROGRAMA_POR_ID[borrador.usoId] || MOTOR.PROGRAMA[0];
  }

  var borrador = {
    punto: null, direccion: '', radioM: FS.cfg.RADIO_INICIAL,
    usoId: MOTOR.PROGRAMA[0].id, nombre: '', modo: 'simple', usosMixto: [],
    // Cuántas unidades de cada uso lleva el proyecto: { local_comercial: 3 }.
    // Es lo que convierte "marqué tres casillas" en un programa con tamaño.
    cantidades: {},
    // 'predio' = tengo el lote y quiero saber si sirve.
    // 'zona'   = tengo el negocio y quiero saber dónde ponerlo.
    pregunta: 'predio'
  };
  var USOS = window.FUXORASCOPE_USOS || null;
  var PROSPECCION = window.FUXORASCOPE_PROSPECCION || null;
  var resultadoZonas = null;
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

          // Las dos preguntas que sabe responder el producto. Se ponen antes
          // que todo porque cambian el resto del formulario: si el cliente no
          // tiene lote, pedirle una dirección no tiene sentido.
          '<div class="fs-modo" role="tablist" aria-label="Tipo de análisis">' +
            '<button type="button" role="tab" class="fs-modo-op' +
              (borrador.pregunta === 'predio' ? ' activa' : '') + '" data-pregunta="predio">' +
              '<b>📍 Tengo el lote</b><span>¿Sirve para lo que quiero montar?</span></button>' +
            '<button type="button" role="tab" class="fs-modo-op' +
              (borrador.pregunta === 'zona' ? ' activa' : '') + '" data-pregunta="zona">' +
              '<b>🔎 Busco dónde</b><span>¿En qué parte de la ciudad lo pongo?</span></button>' +
          '</div>' +

          '<div class="fs-paso" data-solo="predio">' +
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
            // Con 148 usos una rejilla plana es inservible: se busca o se
            // abre la familia. El buscador va primero porque quien ya sabe
            // qué quiere no debería tener que encontrar su categoría.
            '<div class="fs-usos-buscar">' +
              '<input id="fs-buscar-uso" type="text" autocomplete="off" ' +
                'placeholder="Busca el negocio… (ej. granizado, barbería, taller)" />' +
            '</div>' +
            '<div class="fs-usos" id="fs-usos" ' + (borrador.modo === 'mixto' ? 'hidden' : '') + '>' +
            '</div>' +
            '<button type="button" id="fs-btn-combinar" class="fs-enlace-combinar" ' +
              (borrador.modo === 'mixto' ? 'hidden' : '') + '>' +
              '➕ Combinar varios usos en un mismo proyecto</button>' +

            '<div id="fs-cantidades"></div>' +

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
          '<p id="fs-trabajando-texto">Consultando el entorno…</p>' +
          // En el barrido de ciudad la espera es larga y con varios pasos:
          // callarlos haría parecer que se colgó.
          '<p class="fs-pista" id="fs-trabajando-paso"></p>' +
        '</div>' +

        '<div class="fs-zonas-pantalla" id="fs-zonas" hidden>' +
          '<div id="fs-zonas-cuerpo"></div>' +
          '<div class="fs-acciones">' +
            '<button type="button" class="fs-btn" id="fs-zonas-volver">↩️ Cambiar de negocio</button>' +
          '</div>' +
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

  /* ═══ Hoja inferior arrastrable (solo tiene efecto visual en móvil — en
     escritorio el agarre está oculto por CSS y estas funciones no hacen
     nada porque el elemento nunca recibe eventos de puntero) ═══════════ */
  function altoContenedorHoja(){
    var cont = dom.uno('.fs-estudio');
    return cont ? cont.clientHeight : window.innerHeight;
  }

  function fijarAlturaHoja(modo){
    var panel = dom.uno('#fs-panel');
    if (!panel) return;
    var total = altoContenedorHoja();
    var alturas = { recogida:130, media:Math.round(total * 0.52), expandida:total - 90 };
    panel.style.setProperty('--hoja-alto', (alturas[modo] || alturas.media) + 'px');
    panel.dataset.modo = modo;
  }

  function engancharArrastreHoja(){
    var agarre = dom.uno('.fs-panel-agarre');
    var panel = dom.uno('#fs-panel');
    if (!agarre || !panel) return;
    var arrancando = false, inicioY = 0, alturaInicio = 0;

    function empezar(y){
      arrancando = true;
      inicioY = y;
      alturaInicio = panel.getBoundingClientRect().height;
      panel.classList.add('fs-arrastrando');
    }
    function mover(y){
      if (!arrancando) return;
      var delta = inicioY - y; // arrastrar hacia arriba agranda la hoja
      var nuevo = Math.min(altoContenedorHoja() - 90, Math.max(110, alturaInicio + delta));
      panel.style.setProperty('--hoja-alto', nuevo + 'px');
    }
    function terminar(y){
      if (!arrancando) return;
      arrancando = false;
      panel.classList.remove('fs-arrastrando');

      // Un toque sin arrastre alterna entre media y expandida — igual que
      // en URBIS: un toque la abre del todo, arrastrar la deja donde se quiera.
      if (Math.abs(inicioY - y) < 6) {
        fijarAlturaHoja(panel.dataset.modo === 'expandida' ? 'media' : 'expandida');
        return;
      }

      var total = altoContenedorHoja();
      var actual = panel.getBoundingClientRect().height;
      var puntos = [
        { n:'recogida', v:130 },
        { n:'media', v: total * 0.52 },
        { n:'expandida', v: total - 90 }
      ];
      var mejor = puntos.reduce(function(a, b){
        return Math.abs(b.v - actual) < Math.abs(a.v - actual) ? b : a;
      });
      fijarAlturaHoja(mejor.n);
    }

    agarre.addEventListener('pointerdown', function(ev){
      empezar(ev.clientY);
      try { agarre.setPointerCapture(ev.pointerId); } catch(e){}
    });
    agarre.addEventListener('pointermove', function(ev){ mover(ev.clientY); });
    agarre.addEventListener('pointerup', function(ev){ terminar(ev.clientY); });
    agarre.addEventListener('pointercancel', function(ev){ terminar(ev.clientY); });

    fijarAlturaHoja('media');
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

    // En "busco dónde" no hace falta predio: lo que se busca es justamente eso.
    if (borrador.pregunta === 'zona') {
      b.disabled = faltaUso;
      b.textContent = faltaUso ? 'Elige al menos un uso' : 'Buscar dónde montarlo';
      return;
    }
    b.disabled = !borrador.punto || faltaUso;
    b.textContent = !borrador.punto ? 'Marca el predio para continuar' :
                     faltaUso ? 'Elige al menos un uso' : 'Analizar viabilidad';
  }

  function mostrar(cual){
    ['fs-formulario','fs-trabajando','fs-fallo','fs-resultado','fs-zonas'].forEach(function(id){
      var el = dom.uno('#' + id);
      if (el) el.hidden = (id !== cual);
    });
    var panel = dom.uno('#fs-panel');
    if (panel) panel.scrollTop = 0;
    // En móvil, el resultado se ve mejor con la hoja expandida — se abre
    // sola, pero se puede volver a recoger arrastrando o con un toque.
    if (cual === 'fs-resultado' || cual === 'fs-zonas') fijarAlturaHoja('expandida');
  }

  /* ── Resultado del barrido ───────────────────────────────────────────── */
  var capaZonas = null;

  function pintarZonas(res){
    var G = window.FUXORASCOPE_GRAFICOS;
    var caja = dom.uno('#fs-zonas-cuerpo');
    if (!caja) return;
    var uso = (USOS && USOS.POR_ID[res.info.usoId]) || MOTOR.PROGRAMA_POR_ID[res.info.usoId] || {};
    var top = res.top;

    if (!top.length) {
      caja.innerHTML = '<div class="fs-bloque"><h3>Sin zonas suficientes</h3>' +
        '<p class="fs-pista">No encontramos suficiente entorno construido para comparar. ' +
        'Prueba con un radio mayor.</p></div>';
      return;
    }

    var mejor = top[0];
    var maxIdx = mejor.indice;

    // Ranking como barras: es una comparación de magnitud entre pocas
    // opciones, que es justo lo que una barra ordenada resuelve mejor.
    var filas = top.map(function(z, i){
      var w = maxIdx ? (z.indice / maxIdx) * 100 : 0;
      var col = z.indice >= 70 ? '#1f9d55' : z.indice >= 50 ? '#d99a12' : '#e05a4a';
      return '<button type="button" class="fs-zona" data-zona="' + i + '">' +
        '<span class="fs-zona-pos">' + (i + 1) + '</span>' +
        '<span class="fs-zona-body">' +
          '<b>' + esc(z.nombre || 'Zona sin nombre') + '</b>' +
          (z.comuna ? '<small>' + esc(z.comuna) + '</small>' : '') +
          '<span class="fs-zona-riel"><i style="width:' + w.toFixed(1) + '%;background:' + col + '"></i></span>' +
          '<small class="fs-zona-datos">' + FS.util.numero(z.habitantes) + ' habitantes cerca · ' +
            z.puntos + ' negocios en el radio</small>' +
        '</span>' +
        '<span class="fs-zona-idx" style="color:' + col + '">' + z.indice + '</span>' +
      '</button>';
    }).join('');

    caja.innerHTML =
      '<div class="fs-bloque">' +
        '<h3>Mejores zonas para ' + esc(uso.nombre || 'este negocio') + ' ' +
          (uso.icono || '') + '</h3>' +
        '<p class="fs-pista">Se evaluaron <b>' + res.info.evaluadas + ' zonas</b> del casco urbano ' +
          'con ' + FS.util.numero(res.info.elementos) + ' puntos de entorno, usando el mismo cálculo ' +
          'que el estudio de un solo predio. Toca una zona para estudiarla a fondo.</p>' +
        '<div class="fs-zonas">' + filas + '</div>' +
      '</div>' +
      '<div class="fs-bloque">' +
        '<h3>Por qué gana ' + esc(mejor.nombre || 'la primera') + '</h3>' +
        (G ? G.barras('Criterios de la zona ganadora', 'sobre 100', [
          { etiqueta:'Demanda',        n: Math.round(mejor.subindices.demanda) },
          { etiqueta:'Competencia',    n: Math.round(mejor.subindices.competencia) },
          { etiqueta:'Accesibilidad',  n: Math.round(mejor.subindices.acceso) },
          { etiqueta:'Entorno',        n: Math.round(mejor.subindices.entorno) },
          { etiqueta:'Complementos',   n: Math.round(mejor.subindices.complemento) }
        ], { mantenerOrden:true }) : '') +
        '<p class="fs-pista">La población es una <b>estimación por sector censal</b>, no el dato ' +
          'exacto de manzana: sirve para ordenar zonas, no como cifra final. Al abrir una zona ' +
          'se recalcula con el detalle fino.</p>' +
      '</div>';

    // Pintar en el mapa
    if (mapa) {
      if (capaZonas) { try { mapa.removeLayer(capaZonas); } catch(e){} }
      capaZonas = L.layerGroup().addTo(mapa);
      top.forEach(function(z, i){
        var col = z.indice >= 70 ? '#1f9d55' : z.indice >= 50 ? '#d99a12' : '#e05a4a';
        L.circle([z.lat, z.lng], {
          radius: res.info.radio, color: col, weight: 2,
          fillColor: col, fillOpacity: i === 0 ? .26 : .12
        }).addTo(capaZonas);
        L.marker([z.lat, z.lng], {
          icon: L.divIcon({ className:'fs-zona-pin', html:'<span>' + (i + 1) + '</span>',
                            iconSize:[26,26], iconAnchor:[13,13] })
        }).addTo(capaZonas).bindPopup(
          '<b>' + esc(z.nombre || 'Zona') + '</b><br>Índice ' + z.indice + ' · ' + esc(z.nivel));
      });
      try { mapa.fitBounds(capaZonas.getBounds(), { padding:[30,30] }); } catch(e){}
    }

  }

  // Se enlaza una sola vez: #fs-zonas-cuerpo es el mismo nodo en cada
  // barrido, así que reenlazar en cada pintado apilaría listeners.
  function enlazarZonas(raiz){
    var cuerpo = dom.uno('#fs-zonas-cuerpo', raiz);
    if (cuerpo) dom.enlazar(cuerpo, {
      'click [data-zona]': function(ev, b){
        var z = resultadoZonas && resultadoZonas.top[Number(b.getAttribute('data-zona'))];
        if (!z) return;
        // Estudiar la zona a fondo = volver al modo normal con el punto puesto.
        borrador.pregunta = 'predio';
        limpiarZonas();
        fijarPredio(z.lat, z.lng, z.nombre || 'Zona sugerida');
        analizar();
      }
    });
    var volver = dom.uno('#fs-zonas-volver', raiz);
    if (volver) volver.addEventListener('click', function(){
      limpiarZonas();
      mostrar('fs-formulario');
    });
  }

  function limpiarZonas(){
    if (capaZonas && mapa) { try { mapa.removeLayer(capaZonas); } catch(e){} }
    capaZonas = null;
  }

  /* ── Modo "busco dónde": barrer la ciudad ───────────────────────────── */
  function buscarZonas(){
    if (!PROSPECCION) return;
    var usoId = borrador.modo === 'mixto' && borrador.usosMixto.length
      ? borrador.usosMixto[0] : borrador.usoId;
    var b = cajaBusqueda();
    mostrar('fs-trabajando');

    var paso = dom.uno('#fs-trabajando-paso');
    var avisar = function(m){ if (paso) paso.textContent = m; };

    PROSPECCION.evaluar({
      caja: { sur:b[0][0], oeste:b[0][1], norte:b[1][0], este:b[1][1] },
      radio: borrador.radioM,
      paso: Math.max(300, Math.round(borrador.radioM * 0.8)),
      usoId: usoId
    }, avisar)
    .then(function(r){
      var grupos = PROSPECCION.agrupar(r.zonas, Math.max(600, borrador.radioM * 1.4));
      var top = grupos.slice(0, 8);
      avisar('Identificando los barrios…');
      return PROSPECCION.nombrar(top, 8).then(function(){
        resultadoZonas = { info: r, top: top };
        pintarZonas(resultadoZonas);
        mostrar('fs-zonas');
      });
    })
    .catch(function(err){
      dom.uno('#fs-fallo-texto').textContent = (err && err.message) ||
        'No pudimos barrer la ciudad. Intenta de nuevo en un momento.';
      mostrar('fs-fallo');
    });
  }

  function analizar(){
    if (borrador.pregunta === 'zona') return buscarZonas();
    if (!borrador.punto) return;
    borrador.nombre = (dom.uno('#fs-nombre') || {}).value || '';
    mostrar('fs-trabajando');

    // La pantalla de carga solo dice "Consultando el entorno…", fijo — no
    // se le pasan los avisos internos de cada paso (fuente, reintentos,
    // etc.) para no filtrar de dónde sale la información mientras carga.
    var avisar = function(){};

    DATOS.recolectar(borrador.punto, borrador.radioM, avisar)
      .then(function(paquete){
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
        centro: borrador.punto, usos: borrador.usosMixto, poblacion: poblacion,
        cantidades: borrador.cantidades
      });
      // Se reutiliza calcularIndice en modo 'general' solo para obtener el
      // inventario del entorno (porCategoria, vías) — el índice de esa
      // llamada se descarta, el que manda es el ponderado por área del programa.
      var entorno = MOTOR.calcularIndice({
        elementos: paquete.elementos, radioM: borrador.radioM,
        centro: borrador.punto, tipoNegocio: 'general', poblacion: poblacion
      });
      mezclaUsos = MOTOR.indiceMezclaUsos(entorno.porCategoria);

      estudio = {
        modo: 'mixto',
        indice: programa.indiceConjunto, nivel: programa.nivel,
        porUso: programa.porUso, compatibilidad: programa.compatibilidad, areaTotal: programa.areaTotal,
        porCategoria: entorno.porCategoria, otrosDetalle: entorno.otrosDetalle, viasCercanas: entorno.viasCercanas,
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
            usos: borrador.usosMixto, poblacion: poblacion,
            cantidades: borrador.cantidades
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

  // Donut de la mezcla de usos del radio, con los mismos colores que ya usa
  // el mapa y su leyenda — para que el color signifique lo mismo en todas
  // partes de la pantalla, no solo en el mapa.
  function donutCategorias(porCategoria, censo, otrosDetalle){
    // "otro" se incluye como una categoría más, no se esconde: todo lo que
    // entra al cálculo de viabilidad debe poder verse en algún lado.
    var cats = Object.keys(porCategoria || {})
      .filter(function(c){ return porCategoria[c] > 0; })
      .sort(function(a, b){ return porCategoria[b] - porCategoria[a]; });
    var total = cats.reduce(function(s, c){ return s + porCategoria[c]; }, 0);
    if (!total) return '';

    var r = 54, circ = 2 * Math.PI * r, acumulado = 0;
    var segmentos = cats.map(function(c){
      var largo = circ * (porCategoria[c] / total);
      var svg = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + LECTURA.colorCategoria(c) +
        '" stroke-width="21" stroke-dasharray="' + largo.toFixed(1) + ' ' + (circ - largo).toFixed(1) +
        '" stroke-dashoffset="' + (-acumulado).toFixed(1) + '" transform="rotate(-90 70 70)"/>';
      acumulado += largo;
      return svg;
    }).join('');

    var leyenda = cats.slice(0, 10).map(function(c){
      var pct = Math.round(porCategoria[c] / total * 100);
      var esOtro = c === 'otro';
      return '<div class="fs-donut-fila' + (esOtro ? ' fs-donut-fila--otro' : '') + '"' +
          (esOtro ? ' id="fs-fila-otro" role="button" tabindex="0"' : '') + '>' +
        '<i style="background:' + LECTURA.colorCategoria(c) + '"></i>' +
        '<span>' + esc(LECTURA.NOMBRE_CATEGORIA[c] || c) + (esOtro ? ' — ver detalle ▾' : '') + '</span>' +
        '<b>' + pct + '%</b></div>';
    }).join('');

    var detalleOtros = '';
    if (otrosDetalle && Object.keys(otrosDetalle).length) {
      var filas = Object.keys(otrosDetalle)
        .sort(function(a, b){ return otrosDetalle[b] - otrosDetalle[a]; })
        .slice(0, 25);
      detalleOtros = '<div id="fs-detalle-otros" class="fs-detalle-otros" hidden>' +
        '<p class="fs-pista">Etiquetas que no están en el diccionario todavía. ' +
          'Sirve para saber qué falta agregar a la clasificación.</p>' +
        '<div class="fs-detalle-otros-lista">' +
          filas.map(function(etq){
            return '<div class="fs-detalle-otros-fila"><code>' + esc(etq) + '</code><b>' +
              otrosDetalle[etq] + '</b></div>';
          }).join('') +
        '</div>' +
      '</div>';
    }

    var notaVivienda = (censo && censo.viviendas)
      ? '<p class="fs-pista">🏠 El mapa no cuenta casas una por una: el número de viviendas del sector ' +
        '(' + FS.util.numero(censo.viviendas) + ') viene del Censo del DANE, no de este gráfico.</p>'
      : '';

    return '' +
      '<div class="fs-donut-envoltorio">' +
        '<svg viewBox="0 0 140 140" class="fs-donut" role="img" aria-label="Distribución de usos en el radio">' +
          '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="21"/>' +
          segmentos +
          '<text x="70" y="66" text-anchor="middle" class="fs-donut-num">' + total + '</text>' +
          '<text x="70" y="83" text-anchor="middle" class="fs-donut-pie">PUNTOS</text>' +
        '</svg>' +
        '<div class="fs-donut-leyenda">' + leyenda + '</div>' +
      '</div>' +
      detalleOtros +
      notaVivienda;
  }

  function enlazarDonut(raiz){
    var filaOtro = dom.uno('#fs-fila-otro', raiz);
    var detalle = dom.uno('#fs-detalle-otros', raiz);
    if (!filaOtro || !detalle) return;
    var alternar = function(){ detalle.hidden = !detalle.hidden; };
    filaOtro.addEventListener('click', alternar);
    filaOtro.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); }
    });
  }

  function pintarResultado(e){
    var lec = LECTURA.narrar(e, e.censo);
    var fuerzas = lec.señales.filter(function(s){ return s.tipo === 'fuerza'; });
    var riesgos = lec.señales.filter(function(s){ return s.tipo === 'riesgo'; });
    var datos   = lec.señales.filter(function(s){ return s.tipo === 'dato'; });

    var cats = Object.keys(e.porCategoria || {})
      .filter(function(c){ return e.porCategoria[c] > 0; })
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
        donutCategorias(e.porCategoria, e.censo, e.otrosDetalle) +
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
  // Color del badge según el puntaje de compatibilidad (0-100), no según
  // una tabla de niveles fija — se deriva del mismo número que ya trae `c`.
  function colorCompat(puntaje){
    return puntaje >= 70 ? '#1f9d55' : puntaje >= 45 ? '#16b3c9' : puntaje >= 20 ? '#c98a10' : '#c0392b';
  }

  function pintarResultadoMixto(e){
    var nivel = LECTURA.NIVELES[e.nivel] || LECTURA.NIVELES.Media;
    var cats = Object.keys(e.porCategoria || {})
      .filter(function(c){ return e.porCategoria[c] > 0; })
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
          '<button type="button" class="fs-btn" id="fs-pdf">Informe PDF</button>' +
          '<button type="button" class="fs-btn fs-btn--tenue" id="fs-nuevo">Nuevo estudio</button>' +
        '</div>' +
      '</div>' +

      '<div class="fs-bloque" id="fs-comparacion-radios" hidden></div>' +

      '<div class="fs-veredicto" style="--tono:' + nivel.color + '">' +
        medidor(e.indice, nivel.color) +
        '<div class="fs-veredicto-texto">' +
          '<b>' + esc(nivel.titulo) + ' del conjunto</b>' +
          '<p>Resultado de los ' + e.porUso.length + ' usos elegidos — cada uno se evalúa con su propio ' +
            'perfil de criterios, y el conjunto los promedia <b>según el área que ocupa cada uno</b>, ' +
            'no por partes iguales' +
            (e.areaTotal ? ' (' + FS.util.numero(e.areaTotal) + ' m² en total)' : '') + '.</p>' +
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
              '<small>' + esc(u.nivel) +
                (u.unidades > 1 ? ' · ' + u.unidades + ' ' + esc(u.unidad) : '') +
                (u.participacion ? ' · ' + u.participacion + '% del área' : '') +
              '</small></div>';
          }).join('') +
        '</div>' +
      '</div>' +

      (e.compatibilidad.length ? '<div class="fs-bloque">' +
        '<h3>Compatibilidad entre los usos elegidos</h3>' +
        '<p class="fs-nota-pdf" style="border:none;padding-top:0">Se calcula por cercanía de horario, ' +
          'impacto y público entre cada pareja — no es un concepto de uso del suelo oficial, ' +
          'eso solo lo emite Planeación Municipal.</p>' +
        '<div class="fs-compatibilidad">' +
          e.compatibilidad.map(function(c){
            return '<div class="fs-compat-fila">' +
              '<div class="fs-compat-cab">' +
                '<div class="fs-compat-par">' + esc(c.a) + ' + ' + esc(c.b) + '</div>' +
                '<span class="fs-compat-badge" style="--tono:' + colorCompat(c.puntaje) + '">' +
                  esc(c.etiqueta) + ' · ' + c.puntaje + '</span>' +
              '</div>' +
              '<p>' + esc(c.motivo) + '</p></div>';
          }).join('') +
        '</div>' +
      '</div>' : '') +

      (e.censo ? bloqueCenso(e.censo) : '') +

      '<div class="fs-bloque">' +
        '<h3>Qué hay en el radio <small>' + FS.util.numero(e.totalPuntos) + ' puntos leídos</small></h3>' +
        donutCategorias(e.porCategoria, e.censo, e.otrosDetalle) +
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

    enlazarResultadoMixto();
  }

  function enlazarResultadoMixto(){
    var raiz = dom.uno('#fs-resultado');
    enlazarDonut(raiz);

    dom.uno('#fs-nuevo', raiz).addEventListener('click', function(){
      FS.estado.fijar({ estudio: null });
      mostrar('fs-formulario');
    });

    var btnComparar = dom.uno('#fs-comparar-radios', raiz);
    if (btnComparar) btnComparar.addEventListener('click', function(ev){ compararRadios(ev.currentTarget); });

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

  function bloqueCenso(c){
    var G = window.FUXORASCOPE_GRAFICOS;
    var filas = [
      { et:'Habitantes en el radio', v: FS.util.numero(c.habitantes) },
      c.viviendas ? { et:'Viviendas', v: FS.util.numero(c.viviendas) } : null,
      c.personasPorVivienda ? { et:'Personas por vivienda', v: c.personasPorVivienda } : null,
      c.estrato ? { et:'Estrato predominante', v: c.estrato.predominante +
        ' (promedio ' + c.estrato.promedio + ')' } : null,
      { et:'Detalle del dato', v: c.nivel === 'manzana' ? 'Manzana censal' : 'Sector censal (aproximado)' }
    ].filter(Boolean);

    var tabla = '' +
      '<div class="fs-tabla">' +
        filas.map(function(f){
          return '<div class="fs-tabla-fila"><span>' + esc(f.et) + '</span><b>' + esc(f.v) + '</b></div>';
        }).join('') +
      '</div>';

    // ── Gráficas demográficas ──────────────────────────────────────────
    // Cada corte del censo con su propia gráfica. Si una dimensión no vino
    // en los datos simplemente no se dibuja: una barra en cero se leería
    // como "aquí no hay nadie", que es distinto de "el censo no lo informa".
    var g = '';
    var d = c.demografia;
    if (G && d) {
      if (d.sexo) {
        g += G.comparadas(
          { etiqueta:'Hombres', n:d.sexo.hombres, color:G.COLORES.hombre },
          { etiqueta:'Mujeres', n:d.sexo.mujeres, color:G.COLORES.mujer }
        );
      }
      if (d.etapas) g += G.etapas(d.etapas);
      if (d.edades) g += G.histograma(d.edades.rangos, d.edades.total);

      if (d.educacion) {
        var uni = d.educacion.filter(function(x){
          return x.etiqueta === 'Universitaria' || x.etiqueta === 'Posgrado';
        }).reduce(function(s, x){ return s + x.n; }, 0);
        var totEd = d.educacion.reduce(function(s, x){ return s + x.n; }, 0);
        g += G.barras('Nivel educativo alcanzado', 'personas de 5 años o más', d.educacion, {
          lectura: totEd ? '<b>' + G.pct(uni, totEd) + '%</b> tiene estudios universitarios o de posgrado. ' +
            'Es el dato que mejor anticipa capacidad de gasto y tipo de oferta que funciona.' : ''
        });
      }

      if (d.alfabetismo) {
        g += G.anillo('Alfabetismo', d.alfabetismo.pct, 'sabe leer',
          G.COLORES.ninos,
          FS.util.numero(d.alfabetismo.si) + ' personas saben leer y escribir; ' +
          FS.util.numero(d.alfabetismo.no) + ' no. Marca qué tan gráfica debe ser la señalización.');
      }

      if (c.estrato && c.estrato.reparto) {
        g += G.estratos(c.estrato.reparto, colorEstrato);
      }
    }

    var aviso = (G && !d)
      ? '<p class="fs-g-lectura">El censo no entregó el detalle demográfico para este radio. ' +
        'Suele pasar en zonas rurales o con muy pocas manzanas censadas.</p>'
      : '';

    return '' +
      '<div class="fs-bloque">' +
        '<h3>Población según el Censo 2018 <small>DANE</small></h3>' +
        tabla + aviso + g +
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
    enlazarDonut(raiz);

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

    // Selector de usos: familias plegables, chips y buscador.
    pintarSelectorUsos('');
    var buscarUso = dom.uno('#fs-buscar-uso', raiz);
    if (buscarUso) {
      var relojUso = null;
      buscarUso.addEventListener('input', function(){
        clearTimeout(relojUso);
        relojUso = setTimeout(function(){ pintarSelectorUsos(buscarUso.value); }, 160);
      });
    }

    dom.enlazar(dom.uno('#fs-usos', raiz), {
      'click [data-familia]': function(ev, b){
        var id = b.getAttribute('data-familia');
        familiaAbierta = (familiaAbierta === id) ? null : id;
        pintarSelectorUsos(buscarUso ? buscarUso.value : '');
      },
      'click [data-uso]': function(ev, b){
        borrador.usoId = b.getAttribute('data-uso');
        pintarSelectorUsos(buscarUso ? buscarUso.value : '');
      },
      'click [data-uso-mixto]': function(ev, b){
        alternarUsoMixto(b.getAttribute('data-uso-mixto'));
        pintarSelectorUsos(buscarUso ? buscarUso.value : '');
      }
    });

    // Contador de unidades
    var cajaCant = dom.uno('#fs-cantidades', raiz);
    if (cajaCant) {
      cajaCant.addEventListener('click', function(ev){
        var b = ev.target.closest('[data-cant]');
        if (!b) return;
        var id = b.getAttribute('data-id');
        var n = borrador.cantidades[id] || 1;
        n += (b.getAttribute('data-cant') === '+' ? 1 : -1);
        borrador.cantidades[id] = Math.max(1, Math.min(999, n));
        // Se actualizan solo las cifras: repintar el bloque entero le quitaría
        // el foco al botón en cada toque, y sumar 40 unidades sería imposible.
        refrescarCifrasCantidades();
      });
    }

    // Cambio entre las dos preguntas del producto
    var modo = dom.uno('.fs-modo', raiz);
    if (modo) {
      modo.addEventListener('click', function(ev){
        var b = ev.target.closest('[data-pregunta]');
        if (!b) return;
        borrador.pregunta = b.getAttribute('data-pregunta');
        dom.todos('.fs-modo-op', raiz).forEach(function(o){
          o.classList.toggle('activa', o === b);
        });
        aplicarPregunta(raiz);
        refrescarBoton();
      });
    }
    aplicarPregunta(raiz);

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
    // Los chips del combinador y los del catálogo hacen exactamente lo mismo:
    // una sola función evita que uno de los dos se quede sin actualizar las
    // cantidades, que fue justo lo que pasó cuando estaban duplicados.
    dom.enlazar(dom.uno('#fs-usos-chips', raiz), {
      'click [data-uso-mixto]': function(ev, b){
        alternarUsoMixto(b.getAttribute('data-uso-mixto'));
        b.classList.toggle('activa');
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
      enlazarZonas(raiz);
      engancharArrastreHoja();

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

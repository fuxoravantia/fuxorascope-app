/* FuxoraScope · Gráficas (src/graficos.js)
   ─────────────────────────────────────────────────────────────────────────
   SVG escrito a mano: sin librerías, sin dependencias de red y con control
   total del contraste sobre el fondo oscuro del producto.

   Reglas que se siguen aquí:
   · Toda serie lleva su cifra escrita. El cliente no debe medir a ojo.
   · El color identifica; la etiqueta explica. Nunca solo color — quien no
     distingue matices tiene que poder leer lo mismo.
   · Un eje. Nunca dos escalas en la misma gráfica.
   · Si un dato no existe, se dice; no se dibuja una barra en cero como si
     fuera un valor medido.
   ───────────────────────────────────────────────────────────────────────── */
(function(){
  'use strict';

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function num(n){
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits:0 });
  }
  function pct(parte, total){
    if (!total) return 0;
    return Math.round((parte * 1000) / total) / 10;
  }

  /* Paleta de datos. Tonos verificados sobre --panel #12242f: todos por
     encima de 3:1 como marca, y las etiquetas van en texto claro aparte. */
  var C = {
    hombre:   '#3FA9F5',
    mujer:    '#F58FC2',
    ninos:    '#5BD1A8',
    jovenes:  '#16b3c9',
    adultos:  '#4C8BF5',
    mayores:  '#C9A227',
    barra:    '#16b3c9',
    barra2:   '#7fe9f7',
    riel:     'rgba(255,255,255,.10)',
    texto:    '#eaf5fa',
    texto2:   '#b6d4e2',
    texto3:   '#8fb2c4'
  };

  /* ── Comparación de dos grupos (hombres vs mujeres) ───────────────────
     Barra apilada horizontal: la comparación es parte-de-un-todo, así que
     lo que importa es el reparto, no dos barras sueltas que obliguen a
     restar mentalmente. */
  function comparadas(a, b){
    var total = a.n + b.n;
    if (!total) return '';
    var pa = pct(a.n, total), pb = Math.round((100 - pa) * 10) / 10;
    var wa = (a.n / total) * 100;

    return '' +
    '<div class="fs-g">' +
      '<div class="fs-g-cab">' +
        '<h4>' + esc(a.etiqueta) + ' y ' + esc(b.etiqueta) + '</h4>' +
        '<span>' + num(total) + ' personas</span>' +
      '</div>' +
      '<div class="fs-duo" role="img" aria-label="' +
          esc(a.etiqueta) + ' ' + pa + ' por ciento, ' + esc(b.etiqueta) + ' ' + pb + ' por ciento">' +
        '<span class="fs-duo-a" style="width:' + wa.toFixed(2) + '%;background:' + a.color + '"></span>' +
        '<span class="fs-duo-b" style="background:' + b.color + '"></span>' +
      '</div>' +
      '<div class="fs-duo-pie">' +
        '<div><i style="background:' + a.color + '"></i>' +
          '<b>' + pa + '%</b><span>' + esc(a.etiqueta) + ' · ' + num(a.n) + '</span></div>' +
        '<div class="fs-der"><span>' + esc(b.etiqueta) + ' · ' + num(b.n) + '</span>' +
          '<b>' + pb + '%</b><i style="background:' + b.color + '"></i></div>' +
      '</div>' +
    '</div>';
  }

  /* ── Etapas de vida ───────────────────────────────────────────────────
     Cuatro tarjetas con su proporción. Responde de un vistazo si el sector
     es de familias jóvenes, de población trabajadora o envejecida. */
  function etapas(lista){
    var total = lista.reduce(function(s, e){ return s + e.n; }, 0);
    if (!total) return '';
    var iconos = { ninos:'🧒', jovenes:'🧑', adultos:'👨‍💼', mayores:'🧓' };

    var tarjetas = lista.map(function(e){
      var p = pct(e.n, total);
      var col = C[e.id] || C.barra;
      return '' +
      '<div class="fs-etapa" style="--c:' + col + '">' +
        '<span class="fs-etapa-ico" aria-hidden="true">' + (iconos[e.id] || '•') + '</span>' +
        '<b class="fs-etapa-p">' + p + '%</b>' +
        '<span class="fs-etapa-n">' + esc(e.etiqueta) + '</span>' +
        '<span class="fs-etapa-r">' + esc(e.rango) + '</span>' +
        '<span class="fs-etapa-v">' + num(e.n) + ' personas</span>' +
        '<span class="fs-etapa-riel"><i style="width:' + p + '%"></i></span>' +
      '</div>';
    }).join('');

    // Lectura automática. Se construye DESDE el grupo dominante para que no
    // se contradiga: antes podía decir "adultos es el grupo mayoritario" y
    // acto seguido "sector envejecido", que es leerlo al revés.
    var mayor = lista.slice().sort(function(x, y){ return y.n - x.n; })[0];
    var pMayor = pct(mayor.n, total);
    var porId = {};
    lista.forEach(function(e){ porId[e.id] = pct(e.n, total); });

    var loQuePesa = {
      ninos:   'pesan colegios, parques y comercio de barrio',
      jovenes: 'pesan la oferta de estudio, ocio y transporte público',
      adultos: 'pesan los horarios extendidos y la oferta para llevar',
      mayores: 'pesan la cercanía a salud, la farmacia y el acceso sin escaleras'
    };
    var lectura = '<b>' + esc(mayor.etiqueta) + '</b> es el grupo más numeroso (' + pMayor +
      '%): ' + loQuePesa[mayor.id] + '.';

    // Señal secundaria, solo si de verdad destaca y no es ya el grupo mayor.
    if (mayor.id !== 'mayores' && porId.mayores >= 20) {
      lectura += ' Aun así, ' + porId.mayores + '% supera los 60 años: conviene no descuidar la accesibilidad.';
    } else if (mayor.id !== 'ninos' && porId.ninos >= 24) {
      lectura += ' Además hay una proporción alta de niños (' + porId.ninos + '%).';
    }

    return '' +
    '<div class="fs-g">' +
      '<div class="fs-g-cab"><h4>Quién vive aquí, por edad</h4>' +
        '<span>' + num(total) + ' personas</span></div>' +
      '<div class="fs-etapas">' + tarjetas + '</div>' +
      '<p class="fs-g-lectura">' + lectura + '</p>' +
    '</div>';
  }

  /* ── Histograma de edades ─────────────────────────────────────────────
     Los 21 quinquenios completos, para quien quiere el detalle fino. Se
     etiqueta solo el pico: un número sobre cada barra sería ruido. */
  function histograma(rangos, total){
    var vivos = rangos.filter(function(r){ return r.n > 0; });
    if (vivos.length < 3) return '';
    var max = Math.max.apply(null, vivos.map(function(r){ return r.n; }));
    var W = 640, H = 190, mB = 30, mT = 18;
    var ancho = W / rangos.length;

    var barras = rangos.map(function(r, i){
      var h = max ? (H - mB - mT) * (r.n / max) : 0;
      var x = i * ancho + 1.5;
      var w = ancho - 3;
      var y = H - mB - h;
      var esPico = r.n === max;
      var out = '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + Math.max(0, h).toFixed(1) + '" rx="3" fill="' +
        (esPico ? C.barra2 : C.barra) + '" opacity="' + (esPico ? 1 : .68) + '"><title>' +
        esc(r.etiqueta) + ' años: ' + num(r.n) + ' personas</title></rect>';
      if (esPico) {
        out += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) +
          '" text-anchor="middle" fill="' + C.texto + '" font-size="12" font-weight="700">' +
          num(r.n) + '</text>';
      }
      // Solo una etiqueta de cada cuatro: si no, se pisan
      if (i % 4 === 0) {
        out += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 10) +
          '" text-anchor="middle" fill="' + C.texto3 + '" font-size="10">' +
          esc(r.etiqueta.split('–')[0]) + '</text>';
      }
      return out;
    }).join('');

    var pico = vivos.filter(function(r){ return r.n === max; })[0];

    return '' +
    '<div class="fs-g">' +
      '<div class="fs-g-cab"><h4>Edad en detalle</h4><span>rangos de 5 años</span></div>' +
      '<svg class="fs-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
        'aria-label="Histograma de edad. El grupo más numeroso es ' + esc(pico.etiqueta) +
        ' años con ' + num(pico.n) + ' personas.">' +
        '<line x1="0" y1="' + (H - mB) + '" x2="' + W + '" y2="' + (H - mB) +
          '" stroke="rgba(255,255,255,.14)" stroke-width="1"/>' +
        barras +
      '</svg>' +
      '<p class="fs-g-lectura">El grupo más numeroso es el de <b>' + esc(pico.etiqueta) +
        ' años</b> (' + num(pico.n) + ' personas, ' + pct(pico.n, total) + '% del sector).</p>' +
    '</div>';
  }

  /* ── Barras horizontales ordenadas ────────────────────────────────────
     Para comparar magnitudes con nombres largos (nivel educativo). Una sola
     serie, así que un solo tono: colorear cada barra distinto gastaría el
     canal de identidad en repetir lo que ya dice el largo. */
  function barras(titulo, sub, lista, opciones){
    var o = opciones || {};
    var vivos = lista.filter(function(x){ return x.n > 0; });
    if (!vivos.length) return '';
    var orden = o.mantenerOrden ? vivos.slice()
      : vivos.slice().sort(function(a, b){ return b.n - a.n; });
    var max = Math.max.apply(null, orden.map(function(x){ return x.n; }));
    var total = lista.reduce(function(s, x){ return s + x.n; }, 0);

    var filas = orden.map(function(x){
      var w = max ? (x.n / max) * 100 : 0;
      var p = pct(x.n, total);
      return '' +
      '<div class="fs-fila">' +
        '<span class="fs-fila-n">' + esc(x.etiqueta) + '</span>' +
        '<span class="fs-fila-riel"><i style="width:' + w.toFixed(1) + '%;background:' +
          (x.color || o.color || C.barra) + '"></i></span>' +
        '<b class="fs-fila-v">' + num(x.n) + '<em>' + p + '%</em></b>' +
      '</div>';
    }).join('');

    return '' +
    '<div class="fs-g">' +
      '<div class="fs-g-cab"><h4>' + esc(titulo) + '</h4>' +
        (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' +
      '<div class="fs-filas">' + filas + '</div>' +
      (o.lectura ? '<p class="fs-g-lectura">' + o.lectura + '</p>' : '') +
    '</div>';
  }

  /* ── Anillo de proporción ─────────────────────────────────────────────
     Una razón contra su total (alfabetismo). Un anillo, no una torta de dos
     porciones: lo que se lee es el porcentaje del centro. */
  function anillo(titulo, valor, etiqueta, color, pie){
    var r = 46, circ = 2 * Math.PI * r;
    var falta = circ * (1 - Math.min(100, Math.max(0, valor)) / 100);
    return '' +
    '<div class="fs-g fs-g-anillo">' +
      '<svg viewBox="0 0 120 120" role="img" aria-label="' + esc(titulo) + ': ' + valor + ' por ciento">' +
        '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + C.riel + '" stroke-width="12"/>' +
        '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="12" ' +
          'stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' +
          falta.toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
        '<text x="60" y="57" text-anchor="middle" fill="' + C.texto +
          '" font-size="25" font-weight="700">' + valor + '%</text>' +
        '<text x="60" y="76" text-anchor="middle" fill="' + C.texto3 +
          '" font-size="10">' + esc(etiqueta) + '</text>' +
      '</svg>' +
      '<div class="fs-anillo-txt"><h4>' + esc(titulo) + '</h4>' +
        (pie ? '<p>' + esc(pie) + '</p>' : '') + '</div>' +
    '</div>';
  }

  /* ── Reparto de estrato ───────────────────────────────────────────────
     Usa exactamente los mismos colores que el mapa, para que el color
     signifique lo mismo en toda la pantalla. */
  function estratos(reparto, colorDe){
    var claves = Object.keys(reparto || {}).sort();
    if (!claves.length) return '';
    var total = claves.reduce(function(s, k){ return s + reparto[k]; }, 0);
    if (!total) return '';

    var seg = claves.map(function(k){
      var w = (reparto[k] / total) * 100;
      return '<span style="width:' + w.toFixed(2) + '%;background:' + colorDe(Number(k)) +
        '" title="Estrato ' + k + ': ' + reparto[k] + ' manzanas"></span>';
    }).join('');

    var leyenda = claves.map(function(k){
      return '<span><i style="background:' + colorDe(Number(k)) + '"></i>Estrato ' + k +
        ' · ' + pct(reparto[k], total) + '%</span>';
    }).join('');

    return '' +
    '<div class="fs-g">' +
      '<div class="fs-g-cab"><h4>Estrato de las manzanas</h4>' +
        '<span>' + total + ' manzanas</span></div>' +
      '<div class="fs-apilada" role="img" aria-label="Reparto de estrato por manzana">' + seg + '</div>' +
      '<div class="fs-leyenda">' + leyenda + '</div>' +
    '</div>';
  }

  window.FUXORASCOPE_GRAFICOS = {
    comparadas: comparadas,
    etapas: etapas,
    histograma: histograma,
    barras: barras,
    anillo: anillo,
    estratos: estratos,
    COLORES: C,
    num: num,
    pct: pct
  };
})();

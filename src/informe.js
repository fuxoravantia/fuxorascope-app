/* FuxoraScope · INFORME (src/informe.js)
   ─────────────────────────────────────────────────────────────────────────
   Genera el entregable: dos páginas tamaño carta que el cliente puede
   imprimir, guardar como PDF o enviar por correo.

   Se arma como un documento independiente en una ventana aparte, con sus
   propios estilos de impresión. Esa separación es deliberada: el informe no
   hereda nada del CSS de la aplicación, así que un cambio de interfaz nunca
   puede descuadrar un entregable que ya está en manos de un cliente.

   Página 1 — el veredicto: índice grande, qué lo sostiene, qué lo frena.
   Página 2 — el sustento: criterios, censo, inventario del radio, fuentes. */
(function(){
  'use strict';

  var LECTURA = window.FUXORASCOPE_LECTURA;

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function miles(n){ return Number(n || 0).toLocaleString('es-CO'); }

  function fechaLarga(iso){
    var d = new Date(iso || Date.now());
    return d.toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' });
  }

  function medidor(indice, color){
    var r = 78, circ = 2 * Math.PI * r;
    var resto = circ * (1 - Math.min(100, Math.max(0, indice)) / 100);
    return '' +
      '<svg viewBox="0 0 190 190" class="medidor">' +
        '<circle cx="95" cy="95" r="' + r + '" fill="none" stroke="#e3ecf2" stroke-width="19"/>' +
        '<circle cx="95" cy="95" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="19" ' +
          'stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" ' +
          'stroke-dashoffset="' + resto.toFixed(1) + '" transform="rotate(-90 95 95)"/>' +
        '<text x="95" y="90" text-anchor="middle" class="medidor-num">' + indice + '</text>' +
        '<text x="95" y="118" text-anchor="middle" class="medidor-pie">DE 100</text>' +
      '</svg>';
  }

  function construir(e){
    var lec = LECTURA.narrar(e, e.censo);
    var fuerzas = lec.señales.filter(function(s){ return s.tipo === 'fuerza'; });
    var riesgos = lec.señales.filter(function(s){ return s.tipo === 'riesgo'; });
    var datos   = lec.señales.filter(function(s){ return s.tipo === 'dato'; });

    var cats = Object.keys(e.porCategoria || {})
      .filter(function(c){ return c !== 'otro'; })
      .sort(function(a, b){ return e.porCategoria[b] - e.porCategoria[a]; });

    var cabecera =
      '<header class="cab">' +
        '<div class="cab-marca">' +
          '<svg viewBox="0 0 48 48" width="30" height="30" class="cab-logo">' +
            '<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".35"/>' +
            '<circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".6"/>' +
            '<circle cx="24" cy="24" r="4.5" fill="currentColor"/>' +
            '<path d="M24 3v6M24 39v6M3 24h6M39 24h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
          '</svg>' +
          '<div><b>FuxoraScope</b><small>Análisis de viabilidad de implantación</small></div>' +
        '</div>' +
        '<div class="cab-fecha">' + esc(fechaLarga(e.fecha)) + '</div>' +
      '</header>';

    /* ── Página 1 ── */
    var pagina1 =
      '<section class="hoja"><div class="contenido">' +
        cabecera +
        '<h1>' + esc(e.nombre) + '</h1>' +
        '<p class="subtitulo">' + esc(e.usoNombre) + ' · radio de ' + miles(e.radioM) + ' m' +
          (e.direccion ? ' · ' + esc(e.direccion) : '') + '</p>' +

        '<div class="veredicto" style="--tono:' + lec.color + '">' +
          '<div class="veredicto-medidor">' + medidor(e.indice, lec.color) + '</div>' +
          '<div class="veredicto-texto">' +
            '<span class="etiqueta">Dictamen</span>' +
            '<h2>' + esc(lec.titulo) + '</h2>' +
            '<p>' + esc(lec.resumen) + '</p>' +
            '<div class="veredicto-pilares">' +
              '<div><span>Lo que más lo sostiene</span><b>' + esc(lec.sostiene.nombre) + '</b>' +
                '<i>' + lec.sostiene.valor + '/100</i></div>' +
              '<div><span>Lo que más lo frena</span><b>' + esc(lec.frena.nombre) + '</b>' +
                '<i>' + lec.frena.valor + '/100</i></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="dos-columnas">' +
          '<div class="caja caja--verde">' +
            '<h3>A favor</h3>' +
            (fuerzas.length
              ? '<ul>' + fuerzas.map(function(s){ return '<li>' + esc(s.texto) + '</li>'; }).join('') + '</ul>'
              : '<p class="vacio">Ningún criterio alcanza el umbral de fortaleza.</p>') +
          '</div>' +
          '<div class="caja caja--roja">' +
            '<h3>A vigilar</h3>' +
            (riesgos.length
              ? '<ul>' + riesgos.map(function(s){ return '<li>' + esc(s.texto) + '</li>'; }).join('') + '</ul>'
              : '<p class="vacio">Ningún criterio cae por debajo del umbral de riesgo.</p>') +
          '</div>' +
        '</div>' +

        '<div class="caja">' +
          '<h3>Qué significa esto</h3>' +
          lec.parrafos.map(function(p){ return '<p>' + esc(p) + '</p>'; }).join('') +
        '</div>' +

        '<footer class="pie"><span>FuxoraScope · Informe de viabilidad</span><span>Página 1 de 2</span></footer>' +
      '</div></section>';

    /* ── Página 2 ── */
    var filasCenso = e.censo ? [
      { et:'Habitantes en el radio', v: miles(e.censo.habitantes) },
      e.censo.viviendas ? { et:'Viviendas', v: miles(e.censo.viviendas) } : null,
      e.censo.personasPorVivienda ? { et:'Personas por vivienda', v: e.censo.personasPorVivienda } : null,
      e.censo.estrato ? { et:'Estrato predominante', v: e.censo.estrato.predominante +
        ' · promedio ' + e.censo.estrato.promedio } : null,
      { et:'Nivel de detalle', v: e.censo.nivel === 'manzana' ? 'Manzana censal' : 'Sector censal (aproximado)' }
    ].filter(Boolean) : [];

    var pagina2 =
      '<section class="hoja"><div class="contenido">' +
        cabecera +
        '<h1 class="h1-menor">Sustento del dictamen</h1>' +
        '<p class="subtitulo">' + esc(e.nombre) + '</p>' +

        '<div class="caja">' +
          '<h3>Cómo se compone el índice</h3>' +
          '<p class="nota">Cada criterio se califica de 0 a 100 y entra al índice con el peso que le ' +
            'corresponde al uso evaluado. Los pesos cambian según el tipo de proyecto.</p>' +
          lec.criterios.map(function(c){
            return '<div class="barra">' +
                     '<div class="barra-cab"><b>' + esc(c.nombre) + '</b>' +
                       '<span>' + c.valor + '/100 · peso ' + c.peso + '%</span></div>' +
                     '<div class="barra-riel"><span style="width:' + c.valor + '%"></span></div>' +
                   '</div>';
          }).join('') +
        '</div>' +

        (filasCenso.length
          ? '<div class="dos-columnas">' +
              '<div class="caja">' +
                '<h3>Población · Censo 2018 (DANE)</h3>' +
                '<table class="tabla">' +
                  filasCenso.map(function(f){
                    return '<tr><td>' + esc(f.et) + '</td><td><b>' + esc(f.v) + '</b></td></tr>';
                  }).join('') +
                '</table>' +
              '</div>' +
              '<div class="caja">' +
                '<h3>Contexto</h3>' +
                (datos.length
                  ? '<ul>' + datos.map(function(s){ return '<li>' + esc(s.texto) + '</li>'; }).join('') + '</ul>'
                  : '<p class="vacio">Sin lecturas adicionales.</p>') +
              '</div>' +
            '</div>'
          : '<div class="caja"><h3>Población</h3>' +
              '<p class="vacio">El censo no devolvió datos para este radio. El índice se calculó ' +
              'solo con el entorno construido.</p></div>') +

        '<div class="caja">' +
          '<h3>Inventario del radio <small>' + miles(e.totalPuntos) + ' puntos leídos · ' +
            (e.viasCercanas || 0) + ' tramos de vía relevantes</small></h3>' +
          '<div class="fichas">' +
            // Se muestran las 12 categorías más presentes: más allá de eso
            // las fichas empujan la hoja fuera de la página y el resto aporta
            // muy poco al criterio del lector.
            cats.slice(0, 12).map(function(c){
              return '<div class="ficha"><b>' + e.porCategoria[c] + '</b>' +
                     '<span>' + esc(LECTURA.NOMBRE_CATEGORIA[c] || c) + '</span></div>';
            }).join('') +
          '</div>' +
          (cats.length > 12
            ? '<p class="nota">Y ' + (cats.length - 12) + ' categorías más con presencia menor.</p>'
            : '') +
        '</div>' +

        '<div class="caja caja--fuentes">' +
          '<h3>Origen de los datos</h3>' +
          (e.procedencia || []).map(function(f){
            return '<p><b>' + esc(f.nombre) + '</b> — ' +
                   esc(f.disponible ? f.aporta : 'no disponible en esta consulta') +
                   '<br><span class="licencia">' + esc(f.licencia) + '</span></p>';
          }).join('') +
          '<p class="nota">Coordenadas del predio: ' + Number(e.lat).toFixed(5) + ', ' +
            Number(e.lng).toFixed(5) + '. Este informe evalúa condiciones de entorno; ' +
            'no sustituye estudios de suelo, norma urbana ni factibilidad financiera.</p>' +
        '</div>' +

        '<footer class="pie"><span>FuxoraScope · Informe de viabilidad</span><span>Página 2 de 2</span></footer>' +
      '</div></section>';

    return { cuerpo: pagina1 + pagina2, titulo: e.nombre };
  }

  var ESTILOS = '' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:"Segoe UI",system-ui,Arial,sans-serif;background:#65798a;color:#16242e;' +
      '-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    // Altura fija (no min-height): el ajuste automático necesita un alto de
    // referencia estable para medir cuánto sobra o falta.
    '.hoja{width:21.6cm;height:27.9cm;margin:16px auto;background:#fff;padding:1.5cm 1.6cm 1.1cm;' +
      'overflow:hidden;box-shadow:0 6px 26px rgba(0,0,0,.3)}' +
    '.contenido{display:flex;flex-direction:column;height:100%;transform-origin:top center}' +
    '.cab{display:flex;justify-content:space-between;align-items:center;border-bottom:2.5px solid #0b6e8f;' +
      'padding-bottom:9px;margin-bottom:16px}' +
    '.cab-marca{display:flex;align-items:center;gap:9px;color:#0b6e8f}' +
    '.cab-marca b{display:block;font-size:15pt;letter-spacing:.3px;color:#0b3d52}' +
    '.cab-marca small{display:block;font-size:7.6pt;color:#4a6a7c}' +
    '.cab-fecha{font-size:8.4pt;color:#4a6a7c}' +
    'h1{font-size:20pt;color:#0b2b3a;line-height:1.18}' +
    '.h1-menor{font-size:16pt}' +
    '.subtitulo{font-size:9.6pt;color:#4a6a7c;margin:4px 0 15px}' +
    '.veredicto{display:flex;gap:20px;align-items:center;border:2px solid var(--tono);border-radius:13px;' +
      'padding:16px 18px;background:#f6fafc;margin-bottom:14px}' +
    '.veredicto-medidor{flex:0 0 130px}' +
    '.medidor{width:130px;height:130px;display:block}' +
    '.medidor-num{font-size:52px;font-weight:800;fill:#0b2b3a}' +
    '.medidor-pie{font-size:13px;font-weight:700;fill:#6b8697;letter-spacing:2px}' +
    '.veredicto-texto{flex:1}' +
    '.etiqueta{display:inline-block;background:var(--tono);color:#fff;font-size:7.4pt;font-weight:700;' +
      'letter-spacing:1.4px;padding:3px 9px;border-radius:20px;text-transform:uppercase}' +
    '.veredicto-texto h2{font-size:17pt;color:var(--tono);margin:7px 0 5px}' +
    '.veredicto-texto p{font-size:10pt;line-height:1.5;color:#2c4351}' +
    '.veredicto-pilares{display:flex;gap:12px;margin-top:11px}' +
    '.veredicto-pilares div{flex:1;background:#fff;border:1px solid #d5e3ec;border-radius:9px;padding:8px 10px}' +
    '.veredicto-pilares span{display:block;font-size:7.4pt;color:#6b8697;text-transform:uppercase;letter-spacing:.6px}' +
    '.veredicto-pilares b{display:block;font-size:10pt;color:#0b2b3a;margin-top:2px}' +
    '.veredicto-pilares i{font-style:normal;font-size:8.6pt;color:#0b6e8f;font-weight:700}' +
    '.dos-columnas{display:flex;gap:12px;margin-bottom:12px}' +
    '.dos-columnas>*{flex:1;margin-bottom:0}' +
    '.caja{border:1px solid #d5e3ec;border-radius:11px;padding:12px 14px;margin-bottom:12px;background:#fff}' +
    '.caja h3{font-size:11pt;color:#0b3d52;margin-bottom:7px;display:flex;justify-content:space-between;align-items:baseline}' +
    '.caja h3 small{font-weight:500;font-size:8pt;color:#6b8697}' +
    '.caja p{font-size:9.6pt;line-height:1.55;color:#2c4351;margin-bottom:6px}' +
    '.caja p:last-child{margin-bottom:0}' +
    '.caja ul{list-style:none}' +
    '.caja li{font-size:9.4pt;line-height:1.5;color:#2c4351;padding-left:15px;position:relative;margin-bottom:5px}' +
    '.caja li:before{content:"";position:absolute;left:0;top:6px;width:6px;height:6px;border-radius:50%;background:#0b6e8f}' +
    '.caja--verde{border-color:#a9d9bd;background:#f3fbf6}' +
    '.caja--verde h3{color:#166b3c}.caja--verde li:before{background:#1f9d55}' +
    '.caja--roja{border-color:#efc0b8;background:#fdf5f3}' +
    '.caja--roja h3{color:#9a2f22}.caja--roja li:before{background:#c0392b}' +
    '.caja--fuentes{background:#f6fafc}' +
    '.vacio{color:#6b8697;font-style:italic}' +
    '.nota{font-size:8.4pt;color:#5a7688;line-height:1.5}' +
    '.licencia{font-size:8pt;color:#6b8697}' +
    '.barra{margin-bottom:9px}' +
    '.barra-cab{display:flex;justify-content:space-between;font-size:9.2pt;margin-bottom:3px;color:#2c4351}' +
    '.barra-cab span{color:#5a7688;font-size:8.4pt}' +
    '.barra-riel{height:9px;background:#e3ecf2;border-radius:6px;overflow:hidden}' +
    '.barra-riel span{display:block;height:100%;background:linear-gradient(90deg,#0b6e8f,#16b3c9);border-radius:6px}' +
    '.tabla{width:100%;border-collapse:collapse}' +
    '.tabla td{font-size:9.4pt;padding:5px 0;border-bottom:1px solid #e8f0f5;color:#2c4351}' +
    '.tabla td:last-child{text-align:right;color:#0b2b3a}' +
    '.tabla tr:last-child td{border-bottom:none}' +
    '.fichas{display:flex;flex-wrap:wrap;gap:8px}' +
    '.ficha{border:1px solid #d5e3ec;border-radius:9px;padding:7px 11px;min-width:96px;background:#f6fafc}' +
    '.ficha b{display:block;font-size:14pt;color:#0b6e8f;line-height:1}' +
    '.ficha span{display:block;font-size:8pt;color:#5a7688;margin-top:2px}' +
    '.pie{margin-top:auto;padding-top:9px;border-top:1px solid #e3ecf2;display:flex;' +
      'justify-content:space-between;font-size:7.8pt;color:#6b8697}' +
    '.barra-acciones{position:sticky;top:0;z-index:9;background:#0d1b26;padding:11px 16px;display:flex;' +
      'gap:9px;align-items:center;justify-content:center}' +
    '.barra-acciones b{color:#fff;font-size:13px;margin-right:auto}' +
    '.barra-acciones button{border:none;border-radius:8px;padding:9px 17px;font-size:13px;font-weight:600;cursor:pointer}' +
    '.b-imprimir{background:#16b3c9;color:#04222c}' +
    '.b-cerrar{background:#1e3d4f;color:#dbeaf2}' +
    '@media print{body{background:#fff}.barra-acciones{display:none}' +
      '.hoja{margin:0;box-shadow:none;page-break-after:always}' +
      '.hoja:last-child{page-break-after:auto}}' +
    '@page{size:letter;margin:0}';

  /* Ajuste automático: si el contenido de una hoja sobrepasa el alto de la
     página, se reduce proporcionalmente hasta que cabe. Es la garantía de
     que un informe NUNCA sale recortado, pase lo que pase con la cantidad
     de datos que devuelva el análisis. Va incrustado en el documento del
     informe porque tiene que correr allí, no en la aplicación. */
  var AJUSTE = '' +
    '(function(){' +
      'function ajustar(){' +
        'var hojas = document.querySelectorAll(".hoja");' +
        'for (var i = 0; i < hojas.length; i++) {' +
          'var hoja = hojas[i], caja = hoja.querySelector(".contenido");' +
          'if (!caja) continue;' +
          'caja.style.transform = "none"; caja.style.width = "";' +
          'var estilo = getComputedStyle(hoja);' +
          'var disponible = hoja.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);' +
          'var alto = caja.scrollHeight;' +
          'if (alto <= disponible + 1) continue;' +
          'var k = disponible / alto;' +
          'caja.style.width = (100 / k) + "%";' +
          'caja.style.transform = "scale(" + k + ")";' +
        '}' +
      '}' +
      'window.addEventListener("load", ajustar);' +
      'window.addEventListener("beforeprint", ajustar);' +
      'setTimeout(ajustar, 120);' +
    '})();';

  function abrir(estudio){
    if (!estudio) return;
    var doc = construir(estudio);
    var ventana = window.open('', '_blank');
    if (!ventana) {
      window.FS.aviso('El navegador bloqueó la ventana del informe. Permite las ventanas emergentes.', 'error');
      return;
    }
    ventana.document.write(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
      '<title>' + esc(doc.titulo) + ' · FuxoraScope</title>' +
      '<style>' + ESTILOS + '</style></head><body>' +
        '<div class="barra-acciones">' +
          '<b>Informe listo</b>' +
          '<button class="b-imprimir" onclick="window.print()">Guardar como PDF / Imprimir</button>' +
          '<button class="b-cerrar" onclick="window.close()">Cerrar</button>' +
        '</div>' + doc.cuerpo +
        '<script>' + AJUSTE + '<\/script>' +
      '</body></html>'
    );
    ventana.document.close();
  }

  // `construir` y `ESTILOS` se exponen para poder previsualizar o incrustar
  // el informe sin abrir una ventana nueva (útil en pruebas y a futuro para
  // un envío por correo desde el servidor).
  window.FUXORASCOPE_INFORME = { abrir: abrir, construir: construir, ESTILOS: ESTILOS, AJUSTE: AJUSTE };
})();

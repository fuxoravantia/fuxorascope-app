/* FuxoraScope · LECTURA (src/lectura.js)
   ─────────────────────────────────────────────────────────────────────────
   El motor produce números; este módulo los convierte en un dictamen que un
   gerente puede leer sin saber de urbanismo.

   Está separado del motor a propósito: la interpretación cambia con el
   mercado y con lo que el cliente quiere oír, mientras el cálculo debe
   permanecer estable y auditable. Se pueden reescribir todos los textos de
   aquí sin tocar una sola fórmula, y al revés.

   Las lecturas no son frases sueltas: cada una declara la condición numérica
   que la activa, de modo que el informe siempre puede señalar POR QUÉ dijo
   lo que dijo. */
(function(){
  'use strict';

  var NIVELES = {
    Alta:  { titulo:'Viabilidad alta',  color:'#1f9d55',
             resumen:'El entorno sostiene el proyecto. Vale la pena avanzar a estudio de detalle.' },
    Media: { titulo:'Viabilidad media', color:'#c98a10',
             resumen:'El entorno funciona, con condiciones. Hay que corregir uno o dos frentes antes de comprometer capital.' },
    Baja:  { titulo:'Viabilidad baja',  color:'#c0392b',
             resumen:'El entorno hoy no sostiene este uso. Conviene revisar el uso propuesto o buscar otro predio.' }
  };

  var NOMBRE_CRITERIO = {
    demanda:     'Demanda potencial',
    competencia: 'Espacio frente a la competencia',
    acceso:      'Accesibilidad',
    entorno:     'Riqueza del entorno',
    complemento: 'Usos complementarios'
  };

  var NOMBRE_CATEGORIA = {
    comercio_ancla:'grandes superficies', comercio_barrio:'comercio de barrio',
    ferreteria_construccion:'ferretería y materiales', automotriz:'sector automotriz',
    servicio_personal:'servicios personales', financiero:'servicios financieros',
    gastronomia:'gastronomía', hoteleria:'hotelería', entretenimiento:'entretenimiento',
    turismo:'turismo y cultura', oficinas_cercanas:'oficinas',
    salud_mayor:'hospitales y clínicas', salud_menor:'salud de proximidad',
    educacion_superior:'educación superior', educacion_basica:'colegios y jardines',
    institucional:'equipamiento institucional', espacio_publico:'espacio público',
    transporte_publico:'transporte y movilidad', otro:'otros usos'
  };

  /* ── Lecturas por criterio ────────────────────────────────────────────
     Cada entrada dice: en qué criterio mira, con qué umbral se dispara, si
     es una fortaleza o un riesgo, y qué frase produce. */
  var LECTURAS = [
    { criterio:'demanda', minimo:65, tipo:'fuerza',
      texto:'Hay masa de público suficiente alrededor: el proyecto no depende de atraer gente desde lejos.' },
    { criterio:'demanda', maximo:35, tipo:'riesgo',
      texto:'La demanda cercana es delgada. El proyecto tendría que traer clientes de otros sectores para llenarse.' },

    { criterio:'competencia', minimo:70, tipo:'fuerza',
      texto:'Queda espacio de mercado: la oferta parecida en el radio es escasa.' },
    { criterio:'competencia', maximo:40, tipo:'riesgo',
      texto:'El sector ya está bien servido por negocios del mismo tipo. Entrar exige una diferencia clara de precio, producto o servicio.' },

    { criterio:'acceso', minimo:70, tipo:'fuerza',
      texto:'El predio está sobre una vía de jerarquía alta o con transporte cerca: llegar es fácil y el local se ve.' },
    { criterio:'acceso', maximo:40, tipo:'riesgo',
      texto:'La accesibilidad es el punto débil. Sin vía principal ni transporte cerca, el proyecto depende de quien ya vive al lado.' },

    { criterio:'entorno', minimo:65, tipo:'fuerza',
      texto:'El entorno es activo y variado: eso sostiene el flujo de personas durante el día.' },
    { criterio:'entorno', maximo:35, tipo:'riesgo',
      texto:'El entorno tiene poca actividad urbana. Es un sector que aún no genera movimiento propio.' },

    { criterio:'complemento', minimo:60, tipo:'fuerza',
      texto:'Hay usos vecinos que atraen justo al público del proyecto: se aprovecha un flujo que ya existe.' },
    { criterio:'complemento', maximo:30, tipo:'riesgo',
      texto:'Faltan usos que arrastren público hacia el sector. El proyecto tendría que generar su propia atracción.' }
  ];

  function aplicaLectura(l, sub){
    var v = sub[l.criterio];
    if (v == null) return false;
    if (l.minimo != null && v < l.minimo) return false;
    if (l.maximo != null && v > l.maximo) return false;
    return true;
  }

  /* ── Lecturas del censo ──────────────────────────────────────────────── */
  function lecturasCenso(censo){
    if (!censo) return [];
    var out = [];
    var h = censo.habitantes;

    if (h >= 15000) out.push({ tipo:'fuerza', texto:'El censo registra ' + miles(h) +
      ' habitantes en el radio: es un sector densamente poblado.' });
    else if (h >= 5000) out.push({ tipo:'dato', texto:'El censo registra ' + miles(h) +
      ' habitantes en el radio, una base de población media.' });
    else out.push({ tipo:'riesgo', texto:'El censo registra apenas ' + miles(h) +
      ' habitantes en el radio: la población residente es baja.' });

    if (censo.nivel === 'sector') out.push({ tipo:'dato',
      texto:'La cifra viene de sector censal, no de manzana: el predio está fuera del perímetro urbano fino, así que es una aproximación más gruesa.' });

    if (censo.estrato) {
      var e = censo.estrato.predominante;
      var perfil = e <= 2 ? 'de capacidad de gasto limitada, sensible al precio'
                : e === 3 ? 'de clase media, el segmento más amplio de la ciudad'
                : e === 4 ? 'de clase media-alta, con capacidad de gasto sostenida'
                : 'de estrato alto, con alta capacidad de gasto';
      out.push({ tipo:'dato', texto:'Estrato predominante ' + e + ': un público ' + perfil + '.' });
    }

    if (censo.personasPorVivienda) out.push({ tipo:'dato',
      texto:'Cerca de ' + censo.personasPorVivienda + ' personas por vivienda' +
            (censo.personasPorVivienda >= 3.6 ? ', hogares grandes: pesa el consumo familiar.'
                                              : ', hogares pequeños: pesa el consumo individual.') });
    return out;
  }

  function miles(n){ return Number(n || 0).toLocaleString('es-CO'); }

  /* ── Dictamen completo ───────────────────────────────────────────────── */
  function narrar(resultado, censo){
    var nivel = NIVELES[resultado.nivel] || NIVELES.Media;
    var sub = resultado.subindices;

    var señales = LECTURAS
      .filter(function(l){ return aplicaLectura(l, sub); })
      .map(function(l){
        return { tipo:l.tipo, criterio:NOMBRE_CRITERIO[l.criterio], texto:l.texto };
      })
      .concat(lecturasCenso(censo));

    // El criterio que más y el que menos aporta al índice final, ponderados.
    var pesos = resultado.pesosUsados;
    var aportes = Object.keys(sub).map(function(k){
      return { criterio:k, nombre:NOMBRE_CRITERIO[k], valor:sub[k], aporte: sub[k] * (pesos[k] || 0) };
    }).sort(function(a, b){ return b.aporte - a.aporte; });

    var sostiene = aportes[0];
    var frena    = aportes[aportes.length - 1];

    var cats = Object.keys(resultado.porCategoria || {})
      .filter(function(c){ return c !== 'otro'; })
      .sort(function(a, b){ return resultado.porCategoria[b] - resultado.porCategoria[a]; })
      .slice(0, 3);

    var parrafos = [];
    parrafos.push('Con un índice de ' + resultado.indice + ' sobre 100, el predio obtiene una ' +
      nivel.titulo.toLowerCase() + ' para el uso evaluado. ' + nivel.resumen);

    parrafos.push('Lo que más sostiene el resultado es ' + sostiene.nombre.toLowerCase() +
      ' (' + sostiene.valor + '/100). Lo que más lo frena es ' + frena.nombre.toLowerCase() +
      ' (' + frena.valor + '/100): ahí está el frente a trabajar antes de comprometer capital.');

    if (cats.length) {
      parrafos.push('En el radio de ' + miles(resultado.radioM) + ' metros predomina ' +
        cats.map(function(c){
          return (NOMBRE_CATEGORIA[c] || c) + ' (' + resultado.porCategoria[c] + ')';
        }).join(', ') + '. Ese es el carácter actual del sector, y es contra ese carácter que el proyecto va a competir o a complementarse.');
    }

    if (resultado.viasCercanas)
      parrafos.push('Se identificaron ' + resultado.viasCercanas + ' tramos de vía de jerarquía relevante en el entorno inmediato, ' +
        'lo que define cómo se llega al predio y cuánta exposición tiene el frente.');

    return {
      titulo: nivel.titulo,
      color: nivel.color,
      resumen: nivel.resumen,
      parrafos: parrafos,
      señales: señales,
      sostiene: sostiene,
      frena: frena,
      criterios: aportes.map(function(a){
        return { nombre:a.nombre, valor:a.valor, peso:Math.round((pesos[a.criterio] || 0) * 100) };
      })
    };
  }

  window.FUXORASCOPE_LECTURA = {
    narrar: narrar,
    NOMBRE_CRITERIO: NOMBRE_CRITERIO,
    NOMBRE_CATEGORIA: NOMBRE_CATEGORIA,
    NIVELES: NIVELES
  };
})();

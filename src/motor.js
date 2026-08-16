/* FuxoraScope · MOTOR DE VIABILIDAD (src/motor.js)
   ─────────────────────────────────────────────────────────────────────────
   Núcleo del producto. Metodología propia, distinta de cualquier motor
   heurístico basado en reglas por categoría fija:

   1) CATEGORÍAS por diccionario directo (no por reglas regex encadenadas).
      Cada etiqueta de origen mapea a una categoría con una sola búsqueda,
      así que agregar o corregir una categoría es un cambio de una línea en
      el diccionario, no reordenar una cadena de prioridades.

   2) INFLUENCIA POR DECAIMIENTO DE DISTANCIA, no conteo binario. Un punto
      dentro del radio no vale "1" solo por estar adentro: su peso cae con
      la distancia real al lote (función de decaimiento exponencial), así
      que el entorno inmediato pesa más que el borde del radio.

   3) ÍNDICE MULTICRITERIO CONFIGURABLE. Los criterios (demanda, competencia,
      accesibilidad, entorno, complementariedad) se combinan con una matriz
      de pesos que puede variar por tipo de negocio, en vez de un único
      reparto de pesos fijo para cualquier proyecto.

   Sin dependencias externas. Funciones puras, sin DOM, testeables desde
   consola — igual que cualquier motor de cálculo serio debe serlo. */
(function(){
  'use strict';

  // ── 1) Diccionario de categorías ─────────────────────────────────────────
  // Búsqueda directa por etiqueta de origen -> categoría FuxoraScope. Si una
  // etiqueta no está en el diccionario, cae en 'otro' sin romper el cálculo.
  const CATEGORIAS = {
    // comercio de gran formato
    supermarket:'comercio_ancla', mall:'comercio_ancla', department_store:'comercio_ancla',
    wholesale:'comercio_ancla', furniture:'comercio_ancla',
    // comercio de proximidad
    convenience:'comercio_barrio', kiosk:'comercio_barrio', bakery:'comercio_barrio',
    clothes:'comercio_barrio', greengrocer:'comercio_barrio', butcher:'comercio_barrio',
    seafood:'comercio_barrio', alcohol:'comercio_barrio', beverages:'comercio_barrio',
    confectionery:'comercio_barrio', pastry:'comercio_barrio', deli:'comercio_barrio',
    variety_store:'comercio_barrio', general:'comercio_barrio', shoes:'comercio_barrio',
    stationery:'comercio_barrio', books:'comercio_barrio', electronics:'comercio_barrio',
    mobile_phone:'comercio_barrio', jewelry:'comercio_barrio', hifi:'comercio_barrio',
    toys:'comercio_barrio', sports:'comercio_barrio', florist:'comercio_barrio',
    gift:'comercio_barrio', bicycle:'comercio_barrio', pet:'comercio_barrio',
    // ferretería y materiales: marcan un sector de actividad, no de consumo diario
    hardware:'ferreteria_construccion', paint:'ferreteria_construccion',
    doityourself:'ferreteria_construccion', building_materials:'ferreteria_construccion',
    trade:'ferreteria_construccion', glaziery:'ferreteria_construccion',
    // automotriz: en Cúcuta pesa mucho y define el carácter de corredores enteros
    car_repair:'automotriz', car_parts:'automotriz', tyres:'automotriz', car:'automotriz',
    car_wash:'automotriz', motorcycle:'automotriz', motorcycle_repair:'automotriz',
    // servicios a la persona
    hairdresser:'servicio_personal', laundry:'servicio_personal', beauty:'servicio_personal',
    tailor:'servicio_personal', dry_cleaning:'servicio_personal', massage:'servicio_personal',
    copyshop:'servicio_personal', locksmith:'servicio_personal', nail_salon:'servicio_personal',
    // financiero
    bank:'financiero', atm:'financiero', bureau_de_change:'financiero',
    money_transfer:'financiero', insurance:'financiero',
    // gastronomía
    restaurant:'gastronomia', fast_food:'gastronomia', cafe:'gastronomia', bar:'gastronomia',
    pub:'gastronomia', ice_cream:'gastronomia', food_court:'gastronomia', biergarten:'gastronomia',
    // hotelería
    hotel:'hoteleria', motel:'hoteleria', hostel:'hoteleria',
    guest_house:'hoteleria', apartment:'hoteleria',
    // entretenimiento
    cinema:'entretenimiento', theatre:'entretenimiento', nightclub:'entretenimiento',
    casino:'entretenimiento', fitness_centre:'entretenimiento', gym:'entretenimiento',
    // turismo
    attraction:'turismo', museum:'turismo', gallery:'turismo', viewpoint:'turismo', artwork:'turismo',
    // salud
    hospital:'salud_mayor', clinic:'salud_mayor',
    pharmacy:'salud_menor', dentist:'salud_menor', doctors:'salud_menor',
    veterinary:'salud_menor', chemist:'salud_menor', optician:'salud_menor',
    laboratory:'salud_menor', physiotherapist:'salud_menor',
    // educación
    university:'educacion_superior', college:'educacion_superior',
    language_school:'educacion_superior', music_school:'educacion_superior',
    school:'educacion_basica', kindergarten:'educacion_basica', driving_school:'educacion_basica',
    // institucional
    townhall:'institucional', police:'institucional', courthouse:'institucional',
    post_office:'institucional', place_of_worship:'institucional',
    community_centre:'institucional', library:'institucional', fire_station:'institucional',
    // espacio público y deporte
    park:'espacio_publico', playground:'espacio_publico', sports_centre:'espacio_publico',
    pitch:'espacio_publico', stadium:'espacio_publico', garden:'espacio_publico',
    common:'espacio_publico', swimming_pool:'espacio_publico', track:'espacio_publico',
    // movilidad (alimenta sobre todo el criterio de acceso)
    bus_stop:'transporte_publico', bus_station:'transporte_publico', station:'transporte_publico',
    platform:'transporte_publico', taxi:'transporte_publico', fuel:'transporte_publico',
    parking:'transporte_publico', bicycle_rental:'transporte_publico', car_sharing:'transporte_publico'
  };
  const JERARQUIA_VIAL = { trunk:100, primary:88, secondary:68, tertiary:48 };

  // Solo estas etiquetas describen el USO de un lugar. Consultar el
  // diccionario contra cualquier etiqueta (incluido `name`) haría que un
  // negocio llamado "Hotel Génova" se clasificara como hotelería aunque
  // fuera una peluquería. El orden es el de prioridad: si un punto tiene
  // amenity y shop a la vez, manda amenity.
  const ETIQUETAS_DE_USO = ['amenity', 'shop', 'healthcare', 'leisure', 'tourism', 'office'];

  function categoriaDe(tags){
    if (!tags) return 'otro';
    for (let i = 0; i < ETIQUETAS_DE_USO.length; i++) {
      const valor = tags[ETIQUETAS_DE_USO[i]];
      if (!valor) continue;
      const c = CATEGORIAS[valor];
      if (c) return c;
      // `office=lawyer`, `office=company`… cualquier oficina cuenta como tal
      // aunque el tipo puntual no esté en el diccionario.
      if (ETIQUETAS_DE_USO[i] === 'office') return 'oficinas_cercanas';
    }
    return 'otro';
  }

  // ── Geometría ────────────────────────────────────────────────────────────
  function distanciaM(a, b){
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad) * Math.cos(b.lat*rad) * Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // ── 2) Influencia por decaimiento de distancia ──────────────────────────
  // peso(d) = e^(-d / tau). Con tau = radio/3, un punto en el centro pesa
  // ~1.0, uno en el borde del radio pesa ~0.05 — así el entorno inmediato
  // domina el cálculo sin descartar del todo lo que está más lejos.
  function pesoPorDistancia(distM, radioM){
    const tau = Math.max(1, radioM / 3);
    return Math.exp(-distM / tau);
  }

  // ── Perfil de criterios por tipo de negocio ─────────────────────────────
  // Matriz configurable: cada tipo de negocio pondera distinto el mismo
  // conjunto de criterios. Se puede sumar un tipo nuevo sin tocar el motor.
  const PERFILES = {
    comercio:      { demanda:.30, competencia:.20, acceso:.20, entorno:.10, complemento:.20 },
    gastronomia:   { demanda:.25, competencia:.25, acceso:.20, entorno:.15, complemento:.15 },
    salud:         { demanda:.35, competencia:.15, acceso:.25, entorno:.10, complemento:.15 },
    oficinas:      { demanda:.20, competencia:.10, acceso:.30, entorno:.15, complemento:.25 },
    general:       { demanda:.28, competencia:.18, acceso:.22, entorno:.12, complemento:.20 }
  };

  // Categorías que actúan como "competencia directa" según el tipo de
  // negocio propuesto — matriz simple, ampliable sin tocar el cálculo.
  const COMPETENCIA_POR_TIPO = {
    comercio: ['comercio_ancla', 'comercio_barrio'],
    gastronomia: ['gastronomia'],
    salud: ['salud_mayor', 'salud_menor'],
    oficinas: ['oficinas_cercanas'],
    general: []
  };
  // Categorías que suman como "complemento" (atraen público que también
  // consume el negocio propuesto) — igualmente ampliable por fila.
  const COMPLEMENTO_POR_TIPO = {
    comercio:    ['educacion_superior', 'salud_mayor', 'transporte_publico',
                  'financiero', 'entretenimiento'],
    gastronomia: ['oficinas_cercanas', 'educacion_superior', 'espacio_publico',
                  'hoteleria', 'entretenimiento', 'turismo'],
    salud:       ['educacion_superior', 'transporte_publico', 'financiero', 'salud_mayor'],
    oficinas:    ['gastronomia', 'financiero', 'transporte_publico', 'hoteleria'],
    general:     ['transporte_publico', 'espacio_publico', 'comercio_barrio', 'educacion_basica']
  };

  // ── 3) Cálculo del índice ────────────────────────────────────────────────
  // entrada = { elementos, radioM, centro, tipoNegocio, poblacion }
  // elementos: [{ tags, lat, lng }] ya resueltos a coordenadas.
  function calcularIndice(entrada){
    const radioM = entrada.radioM, centro = entrada.centro;
    const tipo = PERFILES[entrada.tipoNegocio] ? entrada.tipoNegocio : 'general';
    const perfil = PERFILES[tipo];
    const competenciaCats = COMPETENCIA_POR_TIPO[tipo] || [];
    const complementoCats = COMPLEMENTO_POR_TIPO[tipo] || [];

    let sumaInfluenciaTotal = 0, sumaCompetencia = 0, sumaComplemento = 0;
    let mejorVia = 0, nVias = 0, transporte = 0;
    const porCategoria = {};

    (entrada.elementos || []).forEach(el => {
      if (el.lat == null || el.lng == null) return;
      const d = distanciaM(centro, el);
      if (d > radioM) return;
      const peso = pesoPorDistancia(d, radioM);

      if (el.tags && el.tags.highway && JERARQUIA_VIAL[el.tags.highway]) {
        nVias++;
        const puntajeVia = JERARQUIA_VIAL[el.tags.highway] * pesoPorDistancia(d, radioM * 1.5);
        if (puntajeVia > mejorVia) mejorVia = puntajeVia;
        return;
      }

      const cat = categoriaDe(el.tags);
      porCategoria[cat] = (porCategoria[cat] || 0) + 1;
      sumaInfluenciaTotal += peso;
      if (competenciaCats.indexOf(cat) !== -1) sumaCompetencia += peso;
      if (complementoCats.indexOf(cat) !== -1) sumaComplemento += peso;
      if (cat === 'transporte_publico') transporte += peso;
    });

    // Cada subíndice se normaliza a 0-100 con una función de saturación
    // logística suave (evita que un solo valor extremo dispare el índice).
    const saturar = (x, escala) => Math.round(100 * (1 - Math.exp(-x / escala)));

    const iDemanda = saturar(
      (entrada.poblacion || 0) / 1000 + sumaInfluenciaTotal * 0.5, 12);
    const iCompetencia = 100 - saturar(sumaCompetencia, 3);   // menos competencia = mejor
    const iAcceso = Math.round(Math.min(100, mejorVia * 0.9 + transporte * 8));
    const iEntorno = saturar(sumaInfluenciaTotal - sumaCompetencia, 10);
    const iComplemento = saturar(sumaComplemento, 4);

    const indiceFinal = Math.round(
      perfil.demanda * iDemanda +
      perfil.competencia * iCompetencia +
      perfil.acceso * iAcceso +
      perfil.entorno * iEntorno +
      perfil.complemento * iComplemento
    );

    const nivel = indiceFinal >= 70 ? 'Alta' : indiceFinal >= 45 ? 'Media' : 'Baja';

    return {
      tipoNegocio: tipo,
      indice: indiceFinal,
      nivel,
      subindices: { demanda:iDemanda, competencia:iCompetencia, acceso:iAcceso,
                    entorno:iEntorno, complemento:iComplemento },
      pesosUsados: perfil,
      porCategoria,
      viasCercanas: nVias,
      radioM
    };
  }

  window.FUXORASCOPE_MOTOR = {
    categoriaDe, distanciaM, pesoPorDistancia, calcularIndice,
    CATEGORIAS, PERFILES, COMPETENCIA_POR_TIPO, COMPLEMENTO_POR_TIPO
  };
})();

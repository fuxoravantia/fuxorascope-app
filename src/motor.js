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
    // comercio
    supermarket:'comercio_ancla', mall:'comercio_ancla', department_store:'comercio_ancla',
    convenience:'comercio_barrio', kiosk:'comercio_barrio', bakery:'comercio_barrio',
    clothes:'comercio_barrio', hairdresser:'servicio_personal', laundry:'servicio_personal',
    bank:'financiero', atm:'financiero',
    restaurant:'gastronomia', fast_food:'gastronomia', cafe:'gastronomia', bar:'gastronomia',
    // salud
    hospital:'salud_mayor', clinic:'salud_mayor', pharmacy:'salud_menor', dentist:'salud_menor',
    doctors:'salud_menor', veterinary:'salud_menor',
    // educación
    university:'educacion_superior', college:'educacion_superior',
    school:'educacion_basica', kindergarten:'educacion_basica',
    // institucional
    townhall:'institucional', police:'institucional', courthouse:'institucional',
    post_office:'institucional',
    // vivienda / ocio
    park:'espacio_publico', playground:'espacio_publico', sports_centre:'espacio_publico',
    // movilidad (no se cuenta como "punto", alimenta el criterio de acceso)
    bus_stop:'transporte_publico', fuel:'transporte_publico', parking:'transporte_publico'
  };
  const JERARQUIA_VIAL = { trunk:100, primary:88, secondary:68, tertiary:48 };

  function categoriaDe(tags){
    if (!tags) return 'otro';
    for (const clave in tags) {
      const c = CATEGORIAS[tags[clave]];
      if (c) return c;
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
    oficinas: [],
    general: []
  };
  // Categorías que suman como "complemento" (atraen público que también
  // consume el negocio propuesto) — igualmente ampliable por fila.
  const COMPLEMENTO_POR_TIPO = {
    comercio: ['educacion_superior', 'salud_mayor', 'transporte_publico'],
    gastronomia: ['oficinas_cercanas', 'educacion_superior', 'espacio_publico'],
    salud: ['educacion_superior', 'transporte_publico'],
    oficinas: ['gastronomia', 'financiero', 'transporte_publico'],
    general: ['transporte_publico', 'espacio_publico']
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

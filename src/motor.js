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
    // vida nocturna (antes mezclado con "entretenimiento" genérico: separarlo
    // importa porque compite por un público y un horario muy distintos al
    // resto del entretenimiento)
    nightclub:'vida_nocturna', casino:'vida_nocturna', stripclub:'vida_nocturna',
    // deporte y recreación activa
    fitness_centre:'deporte_recreacion', gym:'deporte_recreacion', yoga:'deporte_recreacion',
    sports_centre:'deporte_recreacion', pitch:'deporte_recreacion', stadium:'deporte_recreacion',
    swimming_pool:'deporte_recreacion', track:'deporte_recreacion', dance:'deporte_recreacion',
    // cultura y turismo
    cinema:'cultura_turismo', theatre:'cultura_turismo', attraction:'cultura_turismo',
    museum:'cultura_turismo', gallery:'cultura_turismo', viewpoint:'cultura_turismo',
    artwork:'cultura_turismo', arts_centre:'cultura_turismo',
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
    // espacio público (pasivo: parques y plazas, distinto del deporte activo)
    park:'espacio_publico', playground:'espacio_publico', garden:'espacio_publico', common:'espacio_publico',
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

  // Para cuando categoriaDe() devuelve 'otro': qué etiqueta concreta se
  // quedó sin mapear (ej. "shop=optician"), para poder auditarlo — nada
  // debe caer en "otros usos" sin que se pueda ver de qué se trata.
  function etiquetaCruda(tags){
    if (!tags) return 'sin etiquetas';
    for (let i = 0; i < ETIQUETAS_DE_USO.length; i++) {
      const valor = tags[ETIQUETAS_DE_USO[i]];
      if (valor) return ETIQUETAS_DE_USO[i] + '=' + valor;
    }
    return tags.name ? 'sin categoría OSM (solo nombre: "' + tags.name + '")' : 'sin etiquetas de uso';
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
                  'financiero', 'deporte_recreacion', 'cultura_turismo'],
    gastronomia: ['oficinas_cercanas', 'educacion_superior', 'espacio_publico',
                  'hoteleria', 'vida_nocturna', 'cultura_turismo', 'deporte_recreacion'],
    salud:       ['educacion_superior', 'transporte_publico', 'financiero', 'salud_mayor'],
    oficinas:    ['gastronomia', 'financiero', 'transporte_publico', 'hoteleria'],
    general:     ['transporte_publico', 'espacio_publico', 'comercio_barrio', 'educacion_basica']
  };

  // ── Catálogo de usos combinables ────────────────────────────────────────
  // Lo que el diccionario de arriba clasifica solo (126 etiquetas → 21
  // categorías) es el ENTORNO real que se lee del mapa. Este catálogo es
  // distinto: son los usos que un cliente puede PROPONER para su propio
  // predio y combinar en un mismo proyecto (ej. comercio + gastronomía en
  // un mismo edificio). Cada uno se apoya en un PERFIL de pesos ya definido
  // arriba para el índice — y en cuatro atributos propios (ver más abajo)
  // que alimentan la compatibilidad entre usos.
  //
  // flujo:       cuánto público atrae (0 = casi nadie, 1 = mucho tráfico)
  // horario:     franja en la que opera (0 = diurno, 1 = nocturno)
  // ruido:       impacto sobre el vecino (0 = silencioso, 1 = alto impacto)
  // formalidad:  ritmo de la actividad (0 = rápido/casual, 1 = pausado/serio)
  const PROGRAMA = [
    { id:'local_comercial', nombre:'Local comercial',     icono:'🛍️', perfil:'comercio',
      flujo:.60, horario:.40, ruido:.30, formalidad:.50 },
    { id:'supermercado',    nombre:'Supermercado',        icono:'🛒', perfil:'comercio',
      flujo:.80, horario:.40, ruido:.30, formalidad:.40 },
    { id:'ferreteria',      nombre:'Ferretería',          icono:'🔧', perfil:'comercio',
      flujo:.40, horario:.30, ruido:.40, formalidad:.30 },
    { id:'taller',          nombre:'Taller automotriz',   icono:'🔩', perfil:'comercio',
      flujo:.30, horario:.30, ruido:.70, formalidad:.20 },
    { id:'peluqueria',      nombre:'Peluquería / spa',    icono:'💇', perfil:'comercio',
      flujo:.40, horario:.40, ruido:.20, formalidad:.50 },
    { id:'lavanderia',      nombre:'Lavandería',          icono:'🧺', perfil:'comercio',
      flujo:.30, horario:.40, ruido:.30, formalidad:.30 },
    { id:'restaurante',     nombre:'Restaurante',         icono:'🍽️', perfil:'gastronomia',
      flujo:.70, horario:.50, ruido:.50, formalidad:.50 },
    { id:'cafeteria',       nombre:'Cafetería',           icono:'☕', perfil:'gastronomia',
      flujo:.60, horario:.35, ruido:.30, formalidad:.45 },
    { id:'bar',             nombre:'Bar',                 icono:'🍹', perfil:'gastronomia',
      flujo:.60, horario:.75, ruido:.70, formalidad:.30 },
    { id:'discoteca',       nombre:'Discoteca / rumba',   icono:'🎶', perfil:'gastronomia',
      flujo:.60, horario:.95, ruido:.95, formalidad:.10 },
    { id:'panaderia',       nombre:'Panadería',           icono:'🥖', perfil:'gastronomia',
      flujo:.50, horario:.25, ruido:.25, formalidad:.40 },
    { id:'consultorio',     nombre:'Consultorio médico',  icono:'🩺', perfil:'salud',
      flujo:.30, horario:.40, ruido:.10, formalidad:.85 },
    { id:'drogueria',       nombre:'Droguería',           icono:'💊', perfil:'salud',
      flujo:.50, horario:.45, ruido:.15, formalidad:.50 },
    { id:'odontologia',     nombre:'Consultorio odontológico', icono:'🦷', perfil:'salud',
      flujo:.25, horario:.40, ruido:.10, formalidad:.85 },
    { id:'veterinaria',     nombre:'Veterinaria',         icono:'🐾', perfil:'salud',
      flujo:.30, horario:.40, ruido:.25, formalidad:.60 },
    { id:'oficina',         nombre:'Oficina',             icono:'💼', perfil:'oficinas',
      flujo:.35, horario:.35, ruido:.15, formalidad:.80 },
    { id:'coworking',       nombre:'Coworking',           icono:'🧑‍💻', perfil:'oficinas',
      flujo:.40, horario:.40, ruido:.20, formalidad:.70 },
    { id:'banco',           nombre:'Banco / financiero',  icono:'🏦', perfil:'oficinas',
      flujo:.50, horario:.35, ruido:.15, formalidad:.85 },
    { id:'notaria',         nombre:'Notaría / trámites',  icono:'📋', perfil:'oficinas',
      flujo:.25, horario:.35, ruido:.10, formalidad:.90 },
    { id:'hotel',           nombre:'Hotel',               icono:'🏨', perfil:'general',
      flujo:.50, horario:.55, ruido:.30, formalidad:.70 },
    { id:'gimnasio',        nombre:'Gimnasio',            icono:'🏋️', perfil:'general',
      flujo:.50, horario:.50, ruido:.50, formalidad:.30 },
    { id:'colegio',         nombre:'Colegio',             icono:'🏫', perfil:'general',
      flujo:.60, horario:.20, ruido:.40, formalidad:.70 },
    { id:'guarderia',       nombre:'Guardería',           icono:'🧸', perfil:'general',
      flujo:.40, horario:.20, ruido:.35, formalidad:.60 },
    { id:'academia',        nombre:'Academia / instituto',icono:'🎓', perfil:'general',
      flujo:.40, horario:.30, ruido:.20, formalidad:.70 },
    { id:'parque',          nombre:'Parque / recreación', icono:'🌳', perfil:'general',
      flujo:.60, horario:.45, ruido:.35, formalidad:.10 },
    { id:'iglesia',         nombre:'Templo / iglesia',    icono:'⛪', perfil:'general',
      flujo:.40, horario:.30, ruido:.30, formalidad:.60 },
    { id:'bodega',          nombre:'Bodega / almacenamiento', icono:'📦', perfil:'general',
      flujo:.15, horario:.30, ruido:.30, formalidad:.30 },
    { id:'vivienda',        nombre:'Vivienda',            icono:'🏠', perfil:'general',
      flujo:.20, horario:.50, ruido:.10, formalidad:.50 }
  ];
  const PROGRAMA_POR_ID = {};
  PROGRAMA.forEach(u => { PROGRAMA_POR_ID[u.id] = u; });

  /* ── Compatibilidad entre usos: geometría de atributos, no tabla ─────────
     No hay ninguna matriz ni lista de parejas decidida de antemano. La
     compatibilidad de cada combinación se CALCULA a partir de qué tan cerca
     o lejos están sus cuatro atributos — igual que se mide una distancia
     entre dos puntos, no como se consulta una casilla en una tabla. Agregar
     un uso nuevo al catálogo no exige decidir su compatibilidad contra
     ninguno de los otros 28: basta con darle sus cuatro números y la fórmula
     hace el resto.

     El diseño se inspira en la lógica del Plan de Ordenamiento Territorial
     (todo uso se evalúa frente al carácter de su entorno, en niveles que van
     de "refuerza" a "genera conflicto"), pero el resultado NO es, ni
     pretende ser, un concepto de uso del suelo oficial — eso solo lo emite
     la autoridad de planeación municipal (Art. 71, Acuerdo 0083 de 2001). */
  function puntajeVector(idA, idB){
    const a = PROGRAMA_POR_ID[idA], b = PROGRAMA_POR_ID[idB];
    if (!a || !b) return null;

    const solapeHorario = 1 - Math.abs(a.horario - b.horario);          // 0-1: comparten franja horaria
    const brechaRuido = Math.abs(a.ruido - b.ruido);
    const choqueRuido = Math.max(0, brechaRuido - 0.3) / 0.7;            // solo penaliza brechas grandes
    const mismoPerfil = a.perfil === b.perfil ? 1 : 0;                   // compiten por el mismo público
    const arrastreFlujo = (a.flujo + b.flujo) / 2 * (1 - mismoPerfil);   // tráfico compartido, sectores distintos

    const puntaje = 50
      + 25 * solapeHorario
      - 30 * choqueRuido
      + 15 * arrastreFlujo
      - 20 * mismoPerfil;

    return { a, b, puntaje: Math.round(Math.max(0, Math.min(100, puntaje))) };
  }

  const NIVEL_COMPATIBILIDAD = [
    { min:70, etiqueta:'Se refuerzan',        motivo:'comparten horario y atraen público que además consume del otro — un flujo que ya existe se aprovecha dos veces.' },
    { min:45, etiqueta:'Conviven bien',       motivo:'no chocan en horario ni en impacto: pueden funcionar en el mismo predio sin pisarse.' },
    { min:20, etiqueta:'Revisar antes',       motivo:'compiten por el mismo público o tienen impactos (ruido, horario) difíciles de conciliar — conviene separarlos o escalonarlos.' },
    { min:0,  etiqueta:'Poco recomendable',   motivo:'la diferencia de horario o de impacto es grande: uno probablemente perjudica al otro si comparten el mismo predio.' }
  ];
  function nivelDe(puntaje){
    return NIVEL_COMPATIBILIDAD.find(n => puntaje >= n.min);
  }

  function compatibilidadPar(idA, idB){
    const r = puntajeVector(idA, idB);
    if (!r) return { puntaje:50, etiqueta:'Sin evaluar', motivo:'Combinación no evaluada.' };
    const nivel = nivelDe(r.puntaje);
    return { a:r.a.nombre, b:r.b.nombre, puntaje:r.puntaje, etiqueta:nivel.etiqueta, motivo:nivel.motivo };
  }
  function compatibilidadPrograma(ids){
    const pares = [];
    for (let i = 0; i < ids.length; i++){
      for (let j = i + 1; j < ids.length; j++) pares.push(compatibilidadPar(ids[i], ids[j]));
    }
    return pares;
  }

  // ── Cálculo de un programa de varios usos ───────────────────────────────
  // Cada uso se evalúa con el PERFIL de pesos que le corresponde (reutiliza
  // calcularIndice tal cual); el índice conjunto es el promedio simple de
  // los usos elegidos — a propósito no es una suma ponderada por "importancia
  // de negocio" como en un motor de recomendación: aquí todos los usos que
  // el cliente decidió combinar pesan igual en el veredicto del conjunto.
  function calcularPrograma(entrada){
    const ids = entrada.usos || [];
    const porUso = ids.map(id => {
      const def = PROGRAMA_POR_ID[id] || { id, nombre:id, icono:'✨', perfil:'general' };
      const r = calcularIndice({
        elementos: entrada.elementos, radioM: entrada.radioM, centro: entrada.centro,
        tipoNegocio: def.perfil, poblacion: entrada.poblacion
      });
      return { id:def.id, nombre:def.nombre, icono:def.icono, indice:r.indice, nivel:r.nivel };
    });
    const indiceConjunto = porUso.length
      ? Math.round(porUso.reduce((s, u) => s + u.indice, 0) / porUso.length)
      : 0;
    const nivel = indiceConjunto >= 70 ? 'Alta' : indiceConjunto >= 45 ? 'Media' : 'Baja';
    return { porUso, indiceConjunto, nivel, compatibilidad: compatibilidadPrograma(ids) };
  }

  // ── Indicador: mezcla de usos del sector ────────────────────────────────
  // Diversidad de Shannon sobre las categorías presentes en el radio,
  // normalizada a 0-100. Un sector con todo en una sola categoría da 0
  // (monofuncional); repartido parejo entre muchas categorías se acerca a
  // 100 (mezclado). Es una lectura distinta del índice de viabilidad: mide
  // el SECTOR, no el proyecto propuesto.
  function indiceMezclaUsos(porCategoria){
    const cats = Object.keys(porCategoria || {}).filter(c => c !== 'otro');
    const total = cats.reduce((s, c) => s + porCategoria[c], 0);
    if (!total || cats.length < 2) return 0;
    const entropia = -cats.reduce((s, c) => {
      const p = porCategoria[c] / total;
      return s + p * Math.log(p);
    }, 0);
    const maximo = Math.log(cats.length);
    return Math.round(100 * (entropia / maximo));
  }

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
    // Nada de lo que entra al cálculo debe quedar sin poder auditarse: cada
    // punto que cae en "otro" queda registrado aquí con su etiqueta cruda,
    // para poder verlo en el resultado en vez de que desaparezca.
    const otrosDetalle = {};

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
      if (cat === 'otro') {
        const etq = etiquetaCruda(el.tags);
        otrosDetalle[etq] = (otrosDetalle[etq] || 0) + 1;
      }
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
      otrosDetalle,
      viasCercanas: nVias,
      radioM
    };
  }

  window.FUXORASCOPE_MOTOR = {
    categoriaDe, etiquetaCruda, distanciaM, pesoPorDistancia, calcularIndice,
    calcularPrograma, compatibilidadPrograma, indiceMezclaUsos,
    CATEGORIAS, PERFILES, COMPETENCIA_POR_TIPO, COMPLEMENTO_POR_TIPO,
    PROGRAMA, PROGRAMA_POR_ID
  };
})();

/* FuxoraScope · CATÁLOGO DE USOS (src/usos.js)
   ─────────────────────────────────────────────────────────────────────────
   Los usos que un cliente puede PROPONER para su predio. Distinto del
   diccionario de CATEGORIAS en motor.js, que clasifica lo que ya EXISTE
   alrededor y se lee del mapa.

   POR QUÉ ESTE ARCHIVO EXISTE
   El motor calcula la compatibilidad entre dos usos a partir de cuatro
   números, no de una tabla de parejas. Por eso pasar de 28 a 148 usos no
   obliga a decidir 10.878 combinaciones: basta con darle a cada uso sus
   cuatro atributos y la fórmula hace el resto. Sacarlo a un archivo propio
   mantiene motor.js como motor de cálculo y deja el catálogo como dato
   editable — agregar un uso es una línea, no tocar lógica.

   LOS CUATRO ATRIBUTOS (0 a 1)
   flujo       cuánto público atrae            0 = casi nadie   · 1 = mucho tráfico
   horario     franja en que opera             0 = diurno       · 1 = nocturno
   ruido       impacto sobre el vecino         0 = silencioso   · 1 = alto impacto
   formalidad  ritmo de la actividad           0 = rápido/casual· 1 = pausado/serio

   CAMPOS DE APOYO
   grupo    familia para agrupar en la interfaz (no afecta el cálculo)
   perfil   matriz de pesos del índice, ya definida en motor.js
   unidad   qué se cuenta cuando el cliente dice "cuántos" (locales, mesas,
            habitaciones, consultorios…). Es lo que permite sumar un programa.
   m2       área típica de UNA unidad, para estimar cuánto cabe en el predio.

   CRITERIO DE LA SELECCIÓN
   Formatos realmente frecuentes en Cúcuta y su área metropolitana, una
   economía de frontera con ~45.000 empresas, fuerte peso de comercio y
   manufactura, alta informalidad y mucho movimiento de divisas, encomiendas
   y motocicletas. No es un listado académico de actividades económicas:
   son los negocios que de verdad se abren aquí.
   ───────────────────────────────────────────────────────────────────────── */
(function(){
  'use strict';

  var GRUPOS = [
    { id:'bebidas',     nombre:'Bebidas y heladería',      icono:'🥤' },
    { id:'gastronomia', nombre:'Gastronomía',              icono:'🍽️' },
    { id:'alimentos',   nombre:'Alimentos y abarrotes',    icono:'🛒' },
    { id:'comercio',    nombre:'Comercio general',         icono:'🛍️' },
    { id:'moda',        nombre:'Moda y accesorios',        icono:'👕' },
    { id:'hogar',       nombre:'Hogar, ferretería y obra', icono:'🔧' },
    { id:'automotriz',  nombre:'Automotriz y motos',       icono:'🏍️' },
    { id:'salud',       nombre:'Salud',                    icono:'🩺' },
    { id:'belleza',     nombre:'Belleza y cuidado',        icono:'💇' },
    { id:'educacion',   nombre:'Educación',                icono:'🎓' },
    { id:'oficinas',    nombre:'Oficinas y servicios',     icono:'💼' },
    { id:'financiero',  nombre:'Financiero y frontera',    icono:'💱' },
    { id:'ocio',        nombre:'Ocio, deporte y cultura',  icono:'🎯' },
    { id:'alojamiento', nombre:'Alojamiento',              icono:'🏨' },
    { id:'logistica',   nombre:'Logística e industria',    icono:'📦' },
    { id:'tecnologia',  nombre:'Tecnología',               icono:'💻' },
    { id:'mascotas',    nombre:'Mascotas',                 icono:'🐾' },
    { id:'vivienda',    nombre:'Vivienda',                 icono:'🏠' }
  ];

  // u(id, nombre, icono, grupo, perfil, flujo, horario, ruido, formalidad, unidad, m2)
  function u(id, nombre, icono, grupo, perfil, fl, ho, ru, fo, unidad, m2){
    return { id:id, nombre:nombre, icono:icono, grupo:grupo, perfil:perfil,
             flujo:fl, horario:ho, ruido:ru, formalidad:fo,
             unidad:unidad || 'unidades', m2:m2 || 40 };
  }

  var USOS = [

    /* ═══ BEBIDAS Y HELADERÍA ═══════════════════════════════════════════
       El caso que abrió esta lista. Nótese que "granizados" NO es un uso:
       el de café y el alcohólico se comportan distinto —horario, ruido y
       vecino tolerable— y meterlos en la misma casilla daría el mismo
       veredicto para dos negocios que no compiten ni conviven igual. */
    u('granizados_alcohol','Granizados con licor','🍹','bebidas','gastronomia', .55,.70,.45,.15,'puntos de venta',25),
    u('granizados_cafe','Granizados y café frío','🧋','bebidas','gastronomia', .55,.35,.20,.30,'puntos de venta',25),
    u('granizados_fruta','Granizados y raspados de fruta','🍧','bebidas','gastronomia', .60,.40,.20,.15,'puntos de venta',20),
    u('micheladas','Micheladas y cerveza preparada','🍺','bebidas','gastronomia', .55,.75,.55,.15,'puntos de venta',30),
    u('jugos_naturales','Jugos naturales y batidos','🥤','bebidas','gastronomia', .55,.30,.20,.25,'puntos de venta',25),
    u('heladeria','Heladería','🍦','bebidas','gastronomia', .60,.45,.20,.30,'locales',45),
    u('yogurteria','Yogurtería y helado suave','🍨','bebidas','gastronomia', .55,.45,.20,.30,'locales',40),
    u('cafe_especialidad','Café de especialidad','☕','bebidas','gastronomia', .50,.30,.25,.55,'locales',60),
    u('te_bubble','Bubble tea y bebidas asiáticas','🧋','bebidas','gastronomia', .55,.45,.20,.30,'locales',35),
    u('agua_hielo','Expendio de agua y hielo','🧊','bebidas','comercio', .35,.30,.30,.20,'puntos de venta',30),
    u('licorera','Licorera / estanco','🍾','bebidas','comercio', .45,.70,.45,.25,'locales',40),
    u('cerveceria_artesanal','Cervecería artesanal','🍻','bebidas','gastronomia', .55,.75,.60,.35,'locales',90),

    /* ═══ GASTRONOMÍA ═══════════════════════════════════════════════════ */
    u('restaurante','Restaurante de mesa','🍽️','gastronomia','gastronomia', .70,.50,.50,.50,'mesas',6),
    u('restaurante_menu','Restaurante de menú del día','🍛','gastronomia','gastronomia', .75,.30,.45,.30,'mesas',5),
    u('asadero','Asadero de pollo','🍗','gastronomia','gastronomia', .70,.55,.55,.25,'locales',80),
    u('parrilla','Parrilla y carnes','🥩','gastronomia','gastronomia', .60,.65,.55,.55,'mesas',7),
    u('comida_rapida','Comida rápida','🍔','gastronomia','gastronomia', .75,.65,.50,.15,'locales',50),
    u('pizzeria','Pizzería','🍕','gastronomia','gastronomia', .65,.65,.45,.35,'locales',70),
    u('arepas_desayunos','Arepas y desayunos','🫓','gastronomia','gastronomia', .70,.15,.40,.20,'locales',35),
    u('empanadas','Empanadas y fritos','🥟','gastronomia','gastronomia', .70,.40,.40,.10,'puntos de venta',20),
    u('panaderia','Panadería y repostería','🥖','gastronomia','gastronomia', .65,.25,.30,.35,'locales',70),
    u('pasteleria','Pastelería y tortas','🎂','gastronomia','gastronomia', .45,.35,.25,.50,'locales',50),
    u('comida_venezolana','Comida venezolana','🇻🇪','gastronomia','gastronomia', .65,.50,.45,.30,'locales',55),
    u('marisqueria','Cevichería y mariscos','🦐','gastronomia','gastronomia', .55,.45,.45,.50,'mesas',6),
    u('food_truck','Food truck / carro de comida','🚚','gastronomia','gastronomia', .60,.70,.50,.10,'unidades',15),
    u('cocina_oculta','Cocina oculta (solo domicilios)','📱','gastronomia','gastronomia', .15,.55,.35,.30,'cocinas',35),

    /* ═══ ALIMENTOS Y ABARROTES ═════════════════════════════════════════ */
    u('supermercado','Supermercado','🛒','alimentos','comercio', .80,.40,.30,.40,'locales',400),
    u('minimercado','Minimercado de barrio','🏪','alimentos','comercio', .65,.40,.25,.25,'locales',90),
    u('tienda_barrio','Tienda de barrio','🏬','alimentos','comercio', .60,.40,.25,.15,'locales',35),
    u('fruver','Fruver / verdulería','🥬','alimentos','comercio', .60,.25,.30,.15,'locales',60),
    u('carniceria','Carnicería','🥩','alimentos','comercio', .55,.25,.35,.25,'locales',50),
    u('pescaderia','Pescadería','🐟','alimentos','comercio', .45,.25,.35,.25,'locales',45),
    u('granero','Granero y víveres al por mayor','🌾','alimentos','comercio', .50,.25,.40,.25,'locales',120),
    u('salsamentaria','Salsamentaria y quesos','🧀','alimentos','comercio', .50,.35,.25,.35,'locales',45),
    u('reposteria_insumos','Insumos de repostería','🧁','alimentos','comercio', .35,.30,.20,.35,'locales',55),
    u('distribuidora_alimentos','Distribuidora de alimentos','📦','alimentos','comercio', .30,.25,.45,.30,'bodegas',200),

    /* ═══ COMERCIO GENERAL ══════════════════════════════════════════════ */
    u('local_comercial','Local comercial (uso libre)','🛍️','comercio','comercio', .60,.40,.30,.50,'locales',60),
    u('variedades','Variedades / todo a precio bajo','🎁','comercio','comercio', .60,.40,.25,.15,'locales',70),
    u('papeleria','Papelería y útiles','✏️','comercio','comercio', .50,.30,.20,.35,'locales',45),
    u('libreria','Librería','📚','comercio','comercio', .35,.35,.15,.60,'locales',70),
    u('jugueteria','Juguetería','🧸','comercio','comercio', .45,.40,.25,.30,'locales',60),
    u('deportes_tienda','Artículos deportivos','⚽','comercio','comercio', .45,.40,.25,.35,'locales',70),
    u('floristeria','Floristería','💐','comercio','comercio', .40,.35,.15,.45,'locales',35),
    u('regalos','Regalos y detalles','🎀','comercio','comercio', .45,.40,.20,.35,'locales',40),
    u('bebe_tienda','Todo para el bebé','🍼','comercio','comercio', .40,.35,.20,.45,'locales',60),
    u('miscelanea','Miscelánea','🧵','comercio','comercio', .50,.35,.20,.20,'locales',35),
    u('cacharreria','Cacharrería','🪣','comercio','comercio', .50,.30,.30,.15,'locales',60),
    u('mayorista_san_andresito','Comercio mayorista tipo San Andresito','🏗️','comercio','comercio', .65,.30,.45,.20,'locales',80),

    /* ═══ MODA Y ACCESORIOS ═════════════════════════════════════════════ */
    u('ropa','Tienda de ropa','👕','moda','comercio', .55,.45,.25,.45,'locales',70),
    u('calzado','Calzado','👟','moda','comercio', .55,.45,.25,.40,'locales',60),
    u('ropa_deportiva','Ropa deportiva','🏃','moda','comercio', .50,.45,.25,.35,'locales',65),
    u('lenceria','Lencería','🩱','moda','comercio', .40,.45,.15,.45,'locales',45),
    u('joyeria','Joyería y relojería','💍','moda','comercio', .35,.40,.10,.70,'locales',35),
    u('accesorios','Bisutería y accesorios','👜','moda','comercio', .50,.45,.20,.30,'locales',30),
    u('sastreria','Sastrería y arreglos','🧵','moda','comercio', .30,.30,.25,.50,'locales',30),
    u('ropa_segunda','Ropa de segunda / usada','♻️','moda','comercio', .50,.35,.25,.15,'locales',60),

    /* ═══ HOGAR, FERRETERÍA Y OBRA ══════════════════════════════════════ */
    u('ferreteria','Ferretería','🔧','hogar','comercio', .45,.30,.40,.30,'locales',90),
    u('materiales_construccion','Materiales de construcción','🧱','hogar','comercio', .35,.25,.65,.25,'locales',250),
    u('pinturas','Pinturas y acabados','🎨','hogar','comercio', .35,.30,.35,.35,'locales',70),
    u('electricos','Materiales eléctricos','💡','hogar','comercio', .35,.30,.30,.35,'locales',60),
    u('muebles','Muebles y colchones','🛋️','hogar','comercio', .35,.35,.30,.45,'locales',180),
    u('electrodomesticos','Electrodomésticos','📺','hogar','comercio', .45,.40,.30,.45,'locales',120),
    u('vidrieria','Vidriería y aluminio','🪟','hogar','comercio', .25,.25,.65,.25,'talleres',90),
    u('deposito_agregados','Depósito de agregados','🪨','hogar','general', .20,.20,.80,.15,'depósitos',300),

    /* ═══ AUTOMOTRIZ Y MOTOS ════════════════════════════════════════════
       Cúcuta se mueve en moto. Separar moto de carro no es un capricho:
       cambia el tamaño del local, el ruido y el tipo de corredor donde
       funciona. */
    u('taller_moto','Taller de motos','🏍️','automotriz','comercio', .35,.30,.70,.15,'talleres',60),
    u('taller_auto','Taller automotriz','🔩','automotriz','comercio', .30,.30,.75,.20,'talleres',120),
    u('repuestos_moto','Repuestos de moto','⚙️','automotriz','comercio', .40,.30,.45,.20,'locales',50),
    u('repuestos_auto','Repuestos de carro','🔧','automotriz','comercio', .35,.30,.45,.25,'locales',80),
    u('llanteria','Llantería / montallantas','🛞','automotriz','comercio', .35,.35,.65,.15,'locales',70),
    u('lavadero','Lavadero de vehículos','🚿','automotriz','comercio', .35,.35,.55,.15,'bahías',30),
    u('estacion_servicio','Estación de servicio','⛽','automotriz','general', .55,.55,.50,.30,'islas',120),
    u('venta_motos','Concesionario de motos','🏍️','automotriz','comercio', .40,.35,.35,.50,'locales',200),
    u('parqueadero','Parqueadero','🅿️','automotriz','general', .45,.50,.35,.20,'cupos',15),

    /* ═══ SALUD ═════════════════════════════════════════════════════════ */
    u('drogueria','Droguería','💊','salud','salud', .55,.45,.15,.50,'locales',45),
    u('consultorio_medico','Consultorio médico','🩺','salud','salud', .30,.40,.10,.85,'consultorios',20),
    u('odontologia','Consultorio odontológico','🦷','salud','salud', .25,.40,.15,.85,'unidades',18),
    u('laboratorio_clinico','Laboratorio clínico','🧪','salud','salud', .35,.30,.15,.80,'locales',80),
    u('optica','Óptica','👓','salud','salud', .35,.40,.10,.65,'locales',50),
    u('centro_medico','Centro médico / IPS','🏥','salud','salud', .55,.40,.20,.85,'consultorios',22),
    u('fisioterapia','Fisioterapia y rehabilitación','🦵','salud','salud', .30,.35,.20,.70,'salas',25),
    u('psicologia','Consultorio psicológico','🧠','salud','salud', .20,.40,.05,.85,'consultorios',16),
    u('imagenologia','Imágenes diagnósticas','🩻','salud','salud', .35,.35,.25,.85,'salas',40),
    u('ortopedia_insumos','Insumos ortopédicos','🩼','salud','salud', .25,.35,.15,.65,'locales',55),

    /* ═══ BELLEZA Y CUIDADO ═════════════════════════════════════════════ */
    u('peluqueria','Peluquería','💇','belleza','comercio', .45,.40,.25,.45,'sillas',6),
    u('barberia','Barbería','💈','belleza','comercio', .45,.50,.30,.30,'sillas',6),
    u('unas','Salón de uñas','💅','belleza','comercio', .40,.45,.20,.40,'puestos',4),
    u('spa','Spa y masajes','🧖','belleza','comercio', .30,.45,.10,.70,'cabinas',12),
    u('estetica','Centro de estética','✨','belleza','salud', .35,.45,.15,.70,'cabinas',14),
    u('tatuajes','Estudio de tatuajes','🖋️','belleza','comercio', .30,.60,.25,.35,'puestos',10),
    u('cosmeticos','Cosméticos y perfumería','💄','belleza','comercio', .50,.45,.20,.45,'locales',45),

    /* ═══ EDUCACIÓN ═════════════════════════════════════════════════════ */
    u('colegio','Colegio','🏫','educacion','general', .60,.20,.45,.70,'aulas',50),
    u('jardin_infantil','Jardín infantil','🧸','educacion','general', .40,.20,.40,.60,'aulas',40),
    u('instituto_tecnico','Instituto técnico','🎓','educacion','general', .45,.35,.25,.70,'aulas',50),
    u('academia_idiomas','Academia de idiomas','🗣️','educacion','general', .40,.40,.20,.65,'aulas',35),
    u('preicfes','Preicfes y refuerzo escolar','📖','educacion','general', .35,.35,.20,.65,'aulas',35),
    u('escuela_musica','Escuela de música','🎵','educacion','general', .30,.45,.55,.50,'salas',25),
    u('escuela_conduccion','Escuela de conducción','🚗','educacion','general', .35,.35,.35,.55,'aulas',40),

    /* ═══ OFICINAS Y SERVICIOS ══════════════════════════════════════════ */
    u('oficina','Oficina','💼','oficinas','oficinas', .35,.35,.15,.80,'puestos',8),
    u('coworking','Coworking','🧑‍💻','oficinas','oficinas', .40,.40,.20,.70,'puestos',7),
    u('notaria','Notaría','📋','oficinas','oficinas', .40,.35,.10,.90,'ventanillas',12),
    u('abogados','Oficina de abogados','⚖️','oficinas','oficinas', .25,.35,.10,.90,'puestos',10),
    u('contadores','Oficina contable','🧾','oficinas','oficinas', .25,.35,.10,.85,'puestos',9),
    u('inmobiliaria','Inmobiliaria','🏘️','oficinas','oficinas', .35,.35,.15,.70,'puestos',10),
    u('agencia_viajes','Agencia de viajes','✈️','oficinas','oficinas', .35,.35,.15,.60,'puestos',10),
    u('call_center','Call center','🎧','oficinas','oficinas', .30,.60,.30,.60,'puestos',5),
    u('copias_papeleria','Centro de copiado e impresión','🖨️','oficinas','comercio', .50,.30,.30,.35,'locales',30),

    /* ═══ FINANCIERO Y FRONTERA ═════════════════════════════════════════
       Bloque propio por la realidad de Cúcuta: el cambio de divisas, los
       giros y las encomiendas son actividades de primer orden aquí, no una
       nota al pie del sector financiero. */
    u('banco','Banco','🏦','financiero','oficinas', .55,.35,.15,.85,'ventanillas',12),
    u('casa_cambio','Casa de cambio','💱','financiero','oficinas', .55,.40,.15,.70,'ventanillas',8),
    u('giros_remesas','Giros y remesas','💸','financiero','oficinas', .55,.40,.15,.60,'ventanillas',8),
    u('corresponsal','Corresponsal bancario','🏧','financiero','comercio', .55,.40,.15,.45,'puntos',10),
    u('prestamos','Crédito y microcrédito','📈','financiero','oficinas', .35,.35,.15,.80,'puestos',9),
    u('seguros','Agencia de seguros','🛡️','financiero','oficinas', .30,.35,.10,.85,'puestos',9),
    u('compraventa','Compraventa y empeño','💰','financiero','comercio', .40,.40,.20,.40,'locales',45),

    /* ═══ OCIO, DEPORTE Y CULTURA ═══════════════════════════════════════ */
    u('bar','Bar','🍹','ocio','gastronomia', .60,.75,.70,.30,'mesas',6),
    u('discoteca','Discoteca','🎶','ocio','gastronomia', .60,.95,.95,.10,'locales',250),
    u('billares','Billares','🎱','ocio','gastronomia', .45,.75,.60,.20,'mesas',12),
    u('gimnasio','Gimnasio','🏋️','ocio','general', .50,.50,.50,.30,'locales',250),
    u('crossfit','Box de crossfit / funcional','🤸','ocio','general', .40,.50,.65,.25,'locales',200),
    u('cancha_sintetica','Cancha sintética','⚽','ocio','general', .50,.70,.55,.20,'canchas',600),
    u('sala_juegos','Sala de juegos / arcade','🕹️','ocio','general', .50,.65,.55,.15,'locales',90),
    u('cine','Cine','🎬','ocio','general', .65,.70,.45,.40,'salas',300),
    u('centro_cultural','Centro cultural / galería','🖼️','ocio','general', .35,.45,.25,.65,'salas',120),

    /* ═══ ALOJAMIENTO ═══════════════════════════════════════════════════ */
    u('hotel','Hotel','🏨','alojamiento','general', .50,.55,.30,.70,'habitaciones',22),
    u('hostal','Hostal','🛏️','alojamiento','general', .40,.55,.30,.45,'camas',8),
    u('aparta_hotel','Aparta-hotel','🏢','alojamiento','general', .35,.55,.20,.70,'apartamentos',45),
    u('motel','Motel','🌙','alojamiento','general', .30,.85,.25,.35,'habitaciones',28),
    u('alquiler_corto','Alquiler corto tipo Airbnb','🗝️','alojamiento','general', .25,.55,.20,.50,'apartamentos',55),

    /* ═══ LOGÍSTICA E INDUSTRIA ═════════════════════════════════════════ */
    u('bodega','Bodega de almacenamiento','📦','logistica','general', .15,.30,.30,.30,'bodegas',300),
    u('encomiendas','Encomiendas y paquetería','📮','logistica','comercio', .50,.35,.35,.35,'puntos',40),
    u('mensajeria','Mensajería y domicilios','🛵','logistica','general', .35,.50,.45,.25,'bases',60),
    u('transporte_carga','Patio de transporte de carga','🚛','logistica','general', .15,.35,.75,.20,'patios',600),
    u('taller_industrial','Taller industrial / metalmecánica','🏭','logistica','general', .15,.30,.85,.20,'talleres',200),
    u('confeccion','Taller de confección','🧵','logistica','general', .20,.35,.45,.35,'talleres',120),
    u('reciclaje','Centro de acopio y reciclaje','♻️','logistica','general', .20,.25,.65,.15,'centros',250),

    /* ═══ TECNOLOGÍA ════════════════════════════════════════════════════ */
    u('celulares','Venta y reparación de celulares','📱','tecnologia','comercio', .60,.45,.25,.30,'locales',30),
    u('computo','Cómputo y accesorios','💻','tecnologia','comercio', .45,.40,.20,.45,'locales',50),
    u('servicio_tecnico','Servicio técnico electrónico','🔌','tecnologia','comercio', .30,.35,.35,.40,'talleres',40),
    u('internet_juegos','Café internet y videojuegos','🖥️','tecnologia','general', .45,.55,.40,.20,'equipos',3),
    u('domotica_seguridad','Cámaras y seguridad electrónica','📹','tecnologia','comercio', .25,.35,.20,.60,'locales',50),

    /* ═══ MASCOTAS ══════════════════════════════════════════════════════ */
    u('veterinaria','Veterinaria','🐾','mascotas','salud', .30,.40,.25,.60,'consultorios',18),
    u('pet_shop','Pet shop','🦴','mascotas','comercio', .40,.40,.25,.35,'locales',55),
    u('guarderia_mascotas','Guardería canina','🐕','mascotas','general', .25,.35,.60,.25,'locales',120),

    /* ═══ VIVIENDA ══════════════════════════════════════════════════════ */
    u('vivienda_unifamiliar','Vivienda unifamiliar','🏠','vivienda','general', .15,.50,.10,.50,'casas',90),
    u('apartamentos','Edificio de apartamentos','🏢','vivienda','general', .25,.50,.15,.55,'apartamentos',65),
    u('vis','Vivienda de interés social','🏘️','vivienda','general', .30,.50,.20,.45,'unidades',48),
    u('estudiantil','Residencia estudiantil','🎒','vivienda','general', .30,.60,.30,.35,'habitaciones',16),
    u('adulto_mayor','Hogar geriátrico','🧓','vivienda','salud', .20,.45,.15,.75,'camas',20),
    u('mixto_comercio_vivienda','Mixto: comercio abajo, vivienda arriba','🏬','vivienda','general', .45,.50,.30,.50,'unidades',60)
  ];

  var POR_ID = {};
  USOS.forEach(function(x){ POR_ID[x.id] = x; });

  function porGrupo(){
    return GRUPOS.map(function(g){
      return {
        grupo: g,
        usos: USOS.filter(function(x){ return x.grupo === g.id; })
      };
    }).filter(function(x){ return x.usos.length; });
  }

  function buscar(texto){
    var t = String(texto || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!t) return USOS;
    return USOS.filter(function(x){
      var n = x.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return n.indexOf(t) !== -1 || x.id.indexOf(t) !== -1;
    });
  }

  window.FUXORASCOPE_USOS = {
    GRUPOS: GRUPOS,
    USOS: USOS,
    POR_ID: POR_ID,
    porGrupo: porGrupo,
    buscar: buscar,
    total: USOS.length
  };
})();

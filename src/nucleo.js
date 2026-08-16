/* FuxoraScope · NÚCLEO (src/nucleo.js)
   ─────────────────────────────────────────────────────────────────────────
   La aplicación es una sola página. Este archivo es la infraestructura que
   la sostiene, y define la arquitectura del producto:

     · ESTADO REACTIVO   — un único objeto de estado. Nadie toca el DOM para
       "avisar" de un cambio: se cambia el estado y las vistas suscritas se
       repintan solas. Elimina el desfase entre lo que la app cree y lo que
       el usuario ve.

     · VISTAS DECLARATIVAS — cada pantalla es una función que devuelve HTML
       y, opcionalmente, un `montar()` que engancha eventos. No hay marcado
       de pantallas escondido en el index.html: la interfaz vive junto a la
       lógica que la gobierna.

     · RUTAS POR HASH    — #/entrar, #/estudio, #/mis-estudios. Cada pantalla
       tiene URL propia y puede declararse privada; el enrutador es el único
       lugar donde se decide si hay sesión suficiente para entrar.

     · CLIENTE DE API    — una sola función habla con el backend. Si todavía
       no hay backend configurado, el mismo cliente responde desde un backend
       simulado en el navegador, así la interfaz completa se puede probar y
       demostrar sin instalar nada.

   Sin dependencias, sin compilación, sin framework externo. */
(function(){
  'use strict';

  var CFG = window.FS_CONFIG;

  /* ═══ 1. Estado reactivo ═══════════════════════════════════════════════ */
  function crearEstado(inicial){
    var datos = Object.assign({}, inicial);
    var oyentes = [];
    return {
      obtener: function(clave){ return clave ? datos[clave] : datos; },
      fijar: function(parcial){
        var cambio = false;
        Object.keys(parcial).forEach(function(k){
          if (datos[k] !== parcial[k]) { datos[k] = parcial[k]; cambio = true; }
        });
        if (cambio) oyentes.forEach(function(fn){ try { fn(datos); } catch(e){ console.error(e); } });
        return datos;
      },
      suscribir: function(fn){
        oyentes.push(fn);
        return function(){ oyentes = oyentes.filter(function(f){ return f !== fn; }); };
      }
    };
  }

  var estado = crearEstado({
    cuenta: null,        // { cuenta_id, correo, nombre, empresa, ... } o null
    token: null,
    cargando: false,
    ruta: '',
    estudio: null,       // resultado del último análisis
    entorno: null        // elementos crudos del entorno, para recalcular sin red
  });

  /* ═══ 2. Ayudas de DOM ═════════════════════════════════════════════════ */
  var dom = {
    uno: function(sel, raiz){ return (raiz || document).querySelector(sel); },
    todos: function(sel, raiz){ return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); },
    escapar: function(v){
      return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
      });
    },
    // Enlaza eventos por selector dentro de una raíz: evita cientos de
    // addEventListener sueltos y sobrevive a los repintados.
    enlazar: function(raiz, mapa){
      Object.keys(mapa).forEach(function(clave){
        var corte = clave.indexOf(' ');
        var tipo = clave.slice(0, corte);
        var sel  = clave.slice(corte + 1);
        raiz.addEventListener(tipo, function(ev){
          var destino = ev.target.closest(sel);
          if (destino && raiz.contains(destino)) mapa[clave](ev, destino);
        });
      });
    }
  };

  /* ═══ 3. Avisos ════════════════════════════════════════════════════════ */
  function aviso(mensaje, tipo){
    var caja = dom.uno('#fs-avisos');
    if (!caja) return;
    var el = document.createElement('div');
    el.className = 'fs-aviso fs-aviso--' + (tipo || 'info');
    el.textContent = mensaje;
    caja.appendChild(el);
    setTimeout(function(){ el.classList.add('sale'); }, 4200);
    setTimeout(function(){ el.remove(); }, 4700);
  }

  /* ═══ 4. Cliente de API ════════════════════════════════════════════════ */
  function llamar(accion, datos){
    var cuerpo = Object.assign({ accion: accion }, datos || {});
    var token = estado.obtener('token');
    if (token && !cuerpo.token) cuerpo.token = token;
    cuerpo.agente = navigator.userAgent;

    if (!CFG.hayBackend()) return demo.responder(cuerpo);

    var control = new AbortController();
    var reloj = setTimeout(function(){ control.abort(); }, CFG.TIEMPO_ESPERA_MS);

    // text/plain evita la petición previa (preflight) que Apps Script rechaza.
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
      redirect: 'follow'
    })
    .then(function(r){ return r.json(); })
    .catch(function(err){
      return { ok:false, error: err.name === 'AbortError'
        ? 'El servidor tardó demasiado. Revisa tu conexión e inténtalo otra vez.'
        : 'No pudimos conectar con el servidor.' };
    })
    .then(function(res){ clearTimeout(reloj); return res; });
  }

  /* ═══ 5. Backend simulado (modo demostración) ══════════════════════════
     Réplica local del contrato del backend real, guardada en este navegador.
     Existe para que la interfaz se pueda usar y mostrar antes de instalar
     Apps Script. No envía correos: el código de verificación se muestra en
     pantalla. No usa contraseñas seguras — es una maqueta, no producción. */
  var demo = (function(){
    function leer(){
      try { return JSON.parse(localStorage.getItem(CFG.CLAVE_DEMO) || '{}'); }
      catch(e){ return {}; }
    }
    function guardar(b){ localStorage.setItem(CFG.CLAVE_DEMO, JSON.stringify(b)); }
    function base(){
      var b = leer();
      if (!b.cuentas)  b.cuentas = [];
      if (!b.estudios) b.estudios = [];
      return b;
    }
    function correoDe(v){ return String(v || '').trim().toLowerCase(); }
    function buscar(b, correo){
      return b.cuentas.filter(function(c){ return c.correo === correoDe(correo); })[0] || null;
    }
    function publica(c){
      return { cuenta_id:c.cuenta_id, correo:c.correo, nombre:c.nombre, empresa:c.empresa || '',
               cargo:c.cargo || '', telefono:c.telefono || '', plan:'demostración', rol:'cliente' };
    }
    function sesionDe(c){ return { ok:true, token:'demo.' + c.cuenta_id, cuenta:publica(c), demo:true }; }
    function porToken(b, token){
      var id = String(token || '').replace(/^demo\./, '');
      return b.cuentas.filter(function(c){ return c.cuenta_id === id; })[0] || null;
    }

    var acciones = {
      ping: function(){ return { ok:true, demo:true }; },

      registrar: function(b, p){
        var correo = correoDe(p.correo);
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(correo)) return { ok:false, error:'El correo no parece válido.', campo:'correo' };
        if (String(p.nombre || '').trim().length < 3)       return { ok:false, error:'Escribe tu nombre completo.', campo:'nombre' };
        if (String(p.clave || '').length < 8)               return { ok:false, error:'La contraseña debe tener al menos 8 caracteres.', campo:'clave' };
        var previa = buscar(b, correo);
        if (previa && previa.estado === 'activa')
          return { ok:false, error:'Ya existe una cuenta con este correo. Inicia sesión.', campo:'correo', codigo:'YA_EXISTE' };
        var codigo = String(Math.floor(100000 + Math.random() * 900000));
        var reg = previa || { cuenta_id:'demo_' + Date.now().toString(36), correo:correo };
        reg.nombre = String(p.nombre || '').trim();
        reg.empresa = String(p.empresa || '').trim();
        reg.cargo = String(p.cargo || '').trim();
        reg.telefono = String(p.telefono || '').trim();
        reg.clave = String(p.clave || '');
        reg.estado = 'pendiente';
        reg.codigo = codigo;
        if (!previa) b.cuentas.push(reg);
        guardar(b);
        return { ok:true, demo:true, codigo_demo:codigo,
                 mensaje:'Modo demostración: tu código es ' + codigo };
      },

      confirmar: function(b, p){
        var c = buscar(b, p.correo);
        if (!c) return { ok:false, error:'No encontramos esa cuenta.' };
        if (String(c.codigo) !== String(p.codigo || '').replace(/\D+/g, ''))
          return { ok:false, error:'El código no coincide.', campo:'codigo' };
        c.estado = 'activa'; c.codigo = '';
        guardar(b);
        return sesionDe(c);
      },

      reenviar: function(b, p){
        var c = buscar(b, p.correo);
        if (!c) return { ok:false, error:'No encontramos esa cuenta.' };
        c.codigo = String(Math.floor(100000 + Math.random() * 900000));
        guardar(b);
        return { ok:true, demo:true, codigo_demo:c.codigo, mensaje:'Tu código es ' + c.codigo };
      },

      entrar: function(b, p){
        var c = buscar(b, p.correo);
        if (!c || c.clave !== String(p.clave || '')) return { ok:false, error:'Correo o contraseña incorrectos.' };
        if (c.estado === 'pendiente') return { ok:false, error:'Falta confirmar tu correo.', codigo:'PENDIENTE', correo:c.correo };
        return sesionDe(c);
      },

      recuperar: function(b, p){
        var c = buscar(b, p.correo);
        if (!c) return { ok:true, mensaje:'Si el correo está registrado, te llegará un código.' };
        c.codigo = String(Math.floor(100000 + Math.random() * 900000));
        guardar(b);
        return { ok:true, demo:true, codigo_demo:c.codigo, mensaje:'Tu código es ' + c.codigo };
      },

      restablecer: function(b, p){
        var c = buscar(b, p.correo);
        if (!c) return { ok:false, error:'No encontramos esa cuenta.' };
        if (String(c.codigo) !== String(p.codigo || '').replace(/\D+/g, ''))
          return { ok:false, error:'El código no coincide.', campo:'codigo' };
        if (String(p.clave || '').length < 8) return { ok:false, error:'La contraseña debe tener al menos 8 caracteres.', campo:'clave' };
        c.clave = String(p.clave); c.estado = 'activa'; c.codigo = '';
        guardar(b);
        return sesionDe(c);
      },

      sesion: function(b, p){
        var c = porToken(b, p.token);
        return c ? { ok:true, cuenta:publica(c) } : { ok:false, error:'Sesión inválida.', codigo:'SESION_INVALIDA' };
      },

      salir: function(){ return { ok:true }; },

      perfil: function(b, p){
        var c = porToken(b, p.token);
        if (!c) return { ok:false, error:'Sesión inválida.', codigo:'SESION_INVALIDA' };
        ['nombre','empresa','cargo','telefono'].forEach(function(k){
          if (p[k] !== undefined) c[k] = String(p[k]).trim();
        });
        guardar(b);
        return { ok:true, cuenta:publica(c) };
      },

      guardar_estudio: function(b, p){
        var c = porToken(b, p.token);
        if (!c) return { ok:false, error:'Sesión inválida.', codigo:'SESION_INVALIDA' };
        var r = p.estudio || {};
        var id = p.estudio_id || 'est_' + Date.now().toString(36);
        b.estudios = b.estudios.filter(function(e){ return e.estudio_id !== id; });
        b.estudios.push({ estudio_id:id, cuenta_id:c.cuenta_id, creado:new Date().toISOString(), datos:r });
        guardar(b);
        return { ok:true, estudio_id:id };
      },

      listar_estudios: function(b, p){
        var c = porToken(b, p.token);
        if (!c) return { ok:false, error:'Sesión inválida.', codigo:'SESION_INVALIDA' };
        var lista = b.estudios
          .filter(function(e){ return e.cuenta_id === c.cuenta_id; })
          .map(function(e){
            return { estudio_id:e.estudio_id, nombre:e.datos.nombre, lat:e.datos.lat, lng:e.datos.lng,
                     radioM:e.datos.radioM, tipoNegocio:e.datos.tipoNegocio,
                     indice:e.datos.indice, nivel:e.datos.nivel, creado:e.creado };
          })
          .sort(function(a, z){ return String(z.creado).localeCompare(String(a.creado)); });
        return { ok:true, estudios:lista };
      },

      abrir_estudio: function(b, p){
        var e = b.estudios.filter(function(x){ return x.estudio_id === p.estudio_id; })[0];
        return e ? { ok:true, estudio:e.datos } : { ok:false, error:'Estudio no encontrado.' };
      },

      borrar_estudio: function(b, p){
        b.estudios = b.estudios.filter(function(x){ return x.estudio_id !== p.estudio_id; });
        guardar(b);
        return { ok:true };
      }
    };

    return {
      responder: function(cuerpo){
        var fn = acciones[cuerpo.accion];
        var resultado = fn ? fn(base(), cuerpo) : { ok:false, error:'Acción desconocida: ' + cuerpo.accion };
        // Retardo mínimo para que la interfaz se comporte igual que con red real.
        return new Promise(function(res){ setTimeout(function(){ res(resultado); }, 260); });
      }
    };
  })();

  /* ═══ 6. Sesión persistente ════════════════════════════════════════════ */
  var sesion = {
    guardar: function(token, cuenta){
      estado.fijar({ token: token, cuenta: cuenta });
      try { localStorage.setItem(CFG.CLAVE_SESION, JSON.stringify({ token: token, cuenta: cuenta })); } catch(e){}
    },
    recuperar: function(){
      try {
        var s = JSON.parse(localStorage.getItem(CFG.CLAVE_SESION) || 'null');
        if (s && s.token) { estado.fijar({ token: s.token, cuenta: s.cuenta || null }); return true; }
      } catch(e){}
      return false;
    },
    cerrar: function(){
      llamar('salir', {});
      estado.fijar({ token: null, cuenta: null, estudio: null, entorno: null });
      try { localStorage.removeItem(CFG.CLAVE_SESION); } catch(e){}
      ruta.ir('entrar');
    },
    activa: function(){ return !!estado.obtener('token'); }
  };

  /* ═══ 7. Enrutador ═════════════════════════════════════════════════════ */
  var ruta = (function(){
    var vistas = {};
    var actual = null;
    var limpiar = null;   // función de desmontaje de la vista anterior

    function nombreActual(){
      var h = (location.hash || '').replace(/^#\/?/, '');
      return h.split('?')[0] || '';
    }
    function parametros(){
      var h = (location.hash || '');
      var i = h.indexOf('?');
      var out = {};
      if (i === -1) return out;
      h.slice(i + 1).split('&').forEach(function(par){
        var p = par.split('=');
        if (p[0]) out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
      return out;
    }

    function pintar(){
      var nombre = nombreActual() || (sesion.activa() ? 'estudio' : 'entrar');
      var vista = vistas[nombre];

      if (!vista) { location.hash = '#/' + (sesion.activa() ? 'estudio' : 'entrar'); return; }
      if (vista.privada && !sesion.activa()) { location.hash = '#/entrar'; return; }
      if (vista.publica && sesion.activa() && vista.saltarSiEntro) { location.hash = '#/estudio'; return; }

      if (typeof limpiar === 'function') { try { limpiar(); } catch(e){ console.error(e); } }
      limpiar = null;
      actual = nombre;
      estado.fijar({ ruta: nombre });

      var raiz = dom.uno('#fs-vista');
      raiz.innerHTML = vista.plantilla(parametros(), estado.obtener());
      raiz.scrollTop = 0;
      document.body.setAttribute('data-vista', nombre);
      if (typeof vista.montar === 'function') limpiar = vista.montar(raiz, parametros()) || null;
    }

    return {
      registrar: function(nombre, def){ vistas[nombre] = def; },
      ir: function(nombre, params){
        var q = params ? '?' + Object.keys(params).map(function(k){
          return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&') : '';
        var destino = '#/' + nombre + q;
        if (location.hash === destino) pintar(); else location.hash = destino;
      },
      actual: function(){ return actual; },
      iniciar: function(){
        window.addEventListener('hashchange', pintar);
        pintar();
      }
    };
  })();

  /* ═══ 8. Utilidades compartidas ════════════════════════════════════════ */
  var util = {
    fecha: function(iso){
      var d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' }) +
             ' · ' + d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    },
    numero: function(n){ return Number(n || 0).toLocaleString('es-CO'); },
    // Bloquea/desbloquea un botón mostrando trabajo en curso.
    ocupar: function(boton, texto){
      if (!boton) return function(){};
      var original = boton.innerHTML;
      boton.disabled = true;
      boton.innerHTML = '<span class="fs-girando"></span>' + (texto || 'Un momento…');
      return function(){ boton.disabled = false; boton.innerHTML = original; };
    }
  };

  window.FS = {
    cfg: CFG, estado: estado, dom: dom, api: { llamar: llamar },
    sesion: sesion, ruta: ruta, aviso: aviso, util: util
  };
})();

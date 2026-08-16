/* FuxoraScope · ACCESO (src/acceso.js)
   ─────────────────────────────────────────────────────────────────────────
   Pantallas de cuenta: ingresar, registrarse, confirmar el correo y
   recuperar la contraseña. Cada pantalla es una vista declarativa registrada
   en el enrutador del núcleo: devuelve su HTML y engancha sus eventos en
   `montar()`. Ninguna manipula el DOM de otra. */
(function(){
  'use strict';

  var FS = window.FS, dom = FS.dom, esc = dom.escapar;

  /* ── Piezas comunes ────────────────────────────────────────────────────── */
  function marca(subtitulo){
    return '' +
      '<div class="fs-marca">' +
        '<div class="fs-marca-simbolo" aria-hidden="true">' +
          '<svg viewBox="0 0 48 48" width="44" height="44">' +
            '<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".35"/>' +
            '<circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".6"/>' +
            '<circle cx="24" cy="24" r="4.5" fill="currentColor"/>' +
            '<path d="M24 3v6M24 39v6M3 24h6M39 24h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
          '</svg>' +
        '</div>' +
        '<div class="fs-marca-texto">' +
          '<b>FuxoraScope</b>' +
          '<small>' + esc(subtitulo || FS.cfg.LEMA) + '</small>' +
        '</div>' +
      '</div>';
  }

  function avisoDemo(){
    if (FS.cfg.hayBackend()) return '';
    return '<p class="fs-nota-demo">🧪 <b>Modo demostración.</b> Todavía no hay servidor conectado: ' +
           'las cuentas se guardan solo en este navegador y el código de verificación ' +
           'aparece en pantalla en vez de llegar por correo.</p>';
  }

  // Acceso de un clic para demostraciones: entra a una cuenta fija sin pedir
  // correo ni código. Solo tiene sentido mientras no hay backend real — con
  // servidor propio las cuentas deben ser cuentas de verdad.
  var CORREO_INVITADO = 'demo@fuxorascope.local';
  var CLAVE_INVITADA = 'demo12345demo';

  function botonInvitado(){
    if (FS.cfg.hayBackend()) return '';
    return '<button type="button" id="fs-btn-invitado" class="fs-btn fs-btn--grande fs-btn--invitado">' +
             '⚡ Entrar para la demostración (sin registro)' +
           '</button>';
  }

  function entrarInvitado(boton){
    var libre = FS.util.ocupar(boton, 'Entrando…');
    FS.api.llamar('entrar', { correo:CORREO_INVITADO, clave:CLAVE_INVITADA }).then(function(res){
      if (res.ok) { libre(); return entrarConSesion(res); }
      // Primera vez: la cuenta invitada todavía no existe, se crea y confirma sola.
      FS.api.llamar('registrar', {
        correo:CORREO_INVITADO, clave:CLAVE_INVITADA, nombre:'Invitado',
        empresa:'Demostración FuxoraScope'
      }).then(function(reg){
        if (!reg.ok) { libre(); return FS.aviso(reg.error || 'No se pudo entrar.', 'error'); }
        FS.api.llamar('confirmar', { correo:CORREO_INVITADO, codigo:reg.codigo_demo }).then(function(con){
          libre();
          if (con.ok) return entrarConSesion(con);
          FS.aviso(con.error || 'No se pudo entrar.', 'error');
        });
      });
    });
  }

  function campo(id, etiqueta, tipo, extra){
    extra = extra || {};
    return '' +
      '<label class="fs-campo" for="' + id + '">' +
        '<span class="fs-campo-nombre">' + esc(etiqueta) +
          (extra.opcional ? ' <em>(opcional)</em>' : '') + '</span>' +
        '<input id="' + id + '" name="' + id + '" type="' + tipo + '"' +
          (extra.autocompletar ? ' autocomplete="' + extra.autocompletar + '"' : '') +
          (extra.modo ? ' inputmode="' + extra.modo + '"' : '') +
          (extra.max ? ' maxlength="' + extra.max + '"' : '') +
          (extra.marcador ? ' placeholder="' + esc(extra.marcador) + '"' : '') + ' />' +
        (extra.ayuda ? '<small class="fs-campo-ayuda">' + esc(extra.ayuda) + '</small>' : '') +
        '<span class="fs-campo-error" data-error-de="' + id + '"></span>' +
      '</label>';
  }

  // Muestra el error del servidor bajo el campo correcto, o arriba si es general.
  function mostrarError(raiz, respuesta){
    dom.todos('.fs-campo-error', raiz).forEach(function(e){ e.textContent = ''; });
    var general = dom.uno('.fs-error-general', raiz);
    if (general) { general.textContent = ''; general.hidden = true; }

    var texto = respuesta.error || 'No se pudo completar la operación.';
    var destino = respuesta.campo && dom.uno('[data-error-de="' + respuesta.campo + '"]', raiz);
    if (destino) { destino.textContent = texto; return; }
    if (general) { general.textContent = texto; general.hidden = false; return; }
    FS.aviso(texto, 'error');
  }

  function valores(raiz){
    var out = {};
    dom.todos('input', raiz).forEach(function(i){ out[i.id] = i.value.trim(); });
    return out;
  }

  function entrarConSesion(res){
    FS.sesion.guardar(res.token, res.cuenta);
    FS.aviso('Hola, ' + (res.cuenta.nombre || '').split(' ')[0] + ' 👋', 'exito');
    FS.ruta.ir('estudio');
  }

  /* ── Vista: ingresar ───────────────────────────────────────────────────── */
  FS.ruta.registrar('entrar', {
    publica: true, saltarSiEntro: true,
    plantilla: function(){
      return '' +
      '<div class="fs-acceso">' +
        '<div class="fs-acceso-panel">' +
          marca() +
          '<h1>Entra a tu cuenta</h1>' +
          '<p class="fs-acceso-bajada">Estudios de viabilidad para constructoras e inversionistas.</p>' +
          botonInvitado() +
          (FS.cfg.hayBackend() ? '' : '<div class="fs-acceso-separador"><span>o entra con una cuenta</span></div>') +
          avisoDemo() +
          '<form id="fs-form-entrar" novalidate>' +
            '<p class="fs-error-general" hidden></p>' +
            campo('correo', 'Correo', 'email', { autocompletar:'email', marcador:'tucorreo@empresa.com' }) +
            campo('clave', 'Contraseña', 'password', { autocompletar:'current-password' }) +
            '<button type="submit" class="fs-btn fs-btn--principal">Entrar</button>' +
          '</form>' +
          '<div class="fs-acceso-pies">' +
            '<a href="#/recuperar">Olvidé mi contraseña</a>' +
            '<span>·</span>' +
            '<a href="#/registro">Crear una cuenta</a>' +
          '</div>' +
        '</div>' +
        '<aside class="fs-acceso-lado">' +
          '<h2>Antes de comprar el lote, mide el lote.</h2>' +
          '<ul>' +
            '<li><b>Entorno real</b> — comercios, salud, educación y vías alrededor del predio.</li>' +
            '<li><b>Peso por distancia</b> — lo que está a 50 m pesa más que lo que está a 480 m.</li>' +
            '<li><b>Censo oficial</b> — población y estructura del sector según el DANE.</li>' +
            '<li><b>Informe en PDF</b> — el veredicto y los datos que lo sustentan.</li>' +
          '</ul>' +
        '</aside>' +
      '</div>';
    },
    montar: function(raiz){
      var invitado = dom.uno('#fs-btn-invitado', raiz);
      if (invitado) invitado.addEventListener('click', function(ev){ entrarInvitado(ev.currentTarget); });

      var form = dom.uno('#fs-form-entrar', raiz);
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var v = valores(form);
        var libre = FS.util.ocupar(dom.uno('button[type=submit]', form), 'Entrando…');
        FS.api.llamar('entrar', { correo:v.correo, clave:v.clave }).then(function(res){
          libre();
          if (res.ok) return entrarConSesion(res);
          if (res.codigo === 'PENDIENTE') {
            FS.aviso('Falta confirmar tu correo.', 'info');
            return FS.ruta.ir('confirmar', { correo: res.correo || v.correo });
          }
          mostrarError(form, res);
        });
      });
      dom.uno('#correo', raiz).focus();
    }
  });

  /* ── Vista: registro ───────────────────────────────────────────────────── */
  FS.ruta.registrar('registro', {
    publica: true, saltarSiEntro: true,
    plantilla: function(){
      return '' +
      '<div class="fs-acceso">' +
        '<div class="fs-acceso-panel fs-acceso-panel--ancho">' +
          marca('Crea tu cuenta') +
          '<h1>Crear cuenta</h1>' +
          '<p class="fs-acceso-bajada">Te enviamos un código para confirmar el correo. Toma un minuto.</p>' +
          avisoDemo() +
          '<form id="fs-form-registro" novalidate>' +
            '<p class="fs-error-general" hidden></p>' +
            '<div class="fs-rejilla">' +
              campo('nombre', 'Nombre completo', 'text', { autocompletar:'name', max:'80' }) +
              campo('correo', 'Correo', 'email', { autocompletar:'email', marcador:'tucorreo@empresa.com' }) +
              campo('empresa', 'Empresa', 'text', { opcional:true, max:'80', marcador:'Constructora, inmobiliaria…' }) +
              campo('cargo', 'Cargo', 'text', { opcional:true, max:'60', marcador:'Gerente, arquitecto…' }) +
              campo('telefono', 'Teléfono', 'tel', { opcional:true, modo:'tel', autocompletar:'tel', max:'20' }) +
              campo('clave', 'Contraseña', 'password', { autocompletar:'new-password', ayuda:'Mínimo 8 caracteres.' }) +
            '</div>' +
            '<button type="submit" class="fs-btn fs-btn--principal">Crear cuenta</button>' +
          '</form>' +
          '<div class="fs-acceso-pies"><a href="#/entrar">Ya tengo cuenta</a></div>' +
        '</div>' +
      '</div>';
    },
    montar: function(raiz){
      var form = dom.uno('#fs-form-registro', raiz);
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var v = valores(form);
        var libre = FS.util.ocupar(dom.uno('button[type=submit]', form), 'Creando…');
        FS.api.llamar('registrar', v).then(function(res){
          libre();
          if (!res.ok) {
            if (res.codigo === 'YA_EXISTE') FS.ruta.ir('entrar');
            return mostrarError(form, res);
          }
          FS.aviso(res.mensaje || 'Revisa tu correo.', 'exito');
          FS.ruta.ir('confirmar', { correo: v.correo });
        });
      });
      dom.uno('#nombre', raiz).focus();
    }
  });

  /* ── Vista: confirmar correo ───────────────────────────────────────────── */
  FS.ruta.registrar('confirmar', {
    publica: true,
    plantilla: function(p){
      return '' +
      '<div class="fs-acceso">' +
        '<div class="fs-acceso-panel">' +
          marca('Confirma tu correo') +
          '<h1>Escribe tu código</h1>' +
          '<p class="fs-acceso-bajada">Enviamos 6 dígitos a <b>' + esc(p.correo || 'tu correo') + '</b>. ' +
            'Si no aparece, revisa la carpeta de spam.</p>' +
          '<form id="fs-form-confirmar" novalidate>' +
            '<p class="fs-error-general" hidden></p>' +
            '<input type="hidden" id="correo" value="' + esc(p.correo || '') + '" />' +
            '<label class="fs-campo fs-campo--codigo" for="codigo">' +
              '<span class="fs-campo-nombre">Código de verificación</span>' +
              '<input id="codigo" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" />' +
              '<span class="fs-campo-error" data-error-de="codigo"></span>' +
            '</label>' +
            '<button type="submit" class="fs-btn fs-btn--principal">Confirmar</button>' +
          '</form>' +
          '<div class="fs-acceso-pies">' +
            '<button type="button" class="fs-enlace" id="fs-reenviar">Reenviar código</button>' +
            '<span>·</span><a href="#/entrar">Volver</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    },
    montar: function(raiz, p){
      var form = dom.uno('#fs-form-confirmar', raiz);
      var caja = dom.uno('#codigo', raiz);
      caja.addEventListener('input', function(){ caja.value = caja.value.replace(/\D+/g, ''); });
      caja.focus();

      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var libre = FS.util.ocupar(dom.uno('button[type=submit]', form), 'Confirmando…');
        FS.api.llamar('confirmar', { correo: dom.uno('#correo', raiz).value, codigo: caja.value })
          .then(function(res){
            libre();
            if (res.ok) return entrarConSesion(res);
            if (res.codigo === 'YA_ACTIVA') return FS.ruta.ir('entrar');
            mostrarError(form, res);
          });
      });

      dom.uno('#fs-reenviar', raiz).addEventListener('click', function(ev){
        var libre = FS.util.ocupar(ev.currentTarget, 'Enviando…');
        FS.api.llamar('reenviar', { correo: dom.uno('#correo', raiz).value }).then(function(res){
          libre();
          FS.aviso(res.mensaje || (res.ok ? 'Código reenviado.' : res.error), res.ok ? 'exito' : 'error');
        });
      });
    }
  });

  /* ── Vista: recuperar contraseña ───────────────────────────────────────── */
  FS.ruta.registrar('recuperar', {
    publica: true,
    plantilla: function(){
      return '' +
      '<div class="fs-acceso">' +
        '<div class="fs-acceso-panel">' +
          marca('Recuperar acceso') +
          '<h1>¿Olvidaste la contraseña?</h1>' +
          '<p class="fs-acceso-bajada">Escribe tu correo y te enviamos un código para crear una nueva.</p>' +
          '<form id="fs-form-recuperar" novalidate>' +
            '<p class="fs-error-general" hidden></p>' +
            campo('correo', 'Correo', 'email', { autocompletar:'email' }) +
            '<button type="submit" class="fs-btn fs-btn--principal">Enviar código</button>' +
          '</form>' +
          '<div class="fs-acceso-pies"><a href="#/entrar">Volver a entrar</a></div>' +
        '</div>' +
      '</div>';
    },
    montar: function(raiz){
      var form = dom.uno('#fs-form-recuperar', raiz);
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var correo = dom.uno('#correo', raiz).value.trim();
        var libre = FS.util.ocupar(dom.uno('button[type=submit]', form), 'Enviando…');
        FS.api.llamar('recuperar', { correo: correo }).then(function(res){
          libre();
          if (!res.ok) return mostrarError(form, res);
          FS.aviso(res.mensaje || 'Revisa tu correo.', 'exito');
          FS.ruta.ir('restablecer', { correo: correo });
        });
      });
      dom.uno('#correo', raiz).focus();
    }
  });

  /* ── Vista: nueva contraseña ───────────────────────────────────────────── */
  FS.ruta.registrar('restablecer', {
    publica: true,
    plantilla: function(p){
      return '' +
      '<div class="fs-acceso">' +
        '<div class="fs-acceso-panel">' +
          marca('Nueva contraseña') +
          '<h1>Crea una contraseña nueva</h1>' +
          '<p class="fs-acceso-bajada">Usa el código que enviamos a <b>' + esc(p.correo || 'tu correo') + '</b>.</p>' +
          '<form id="fs-form-restablecer" novalidate>' +
            '<p class="fs-error-general" hidden></p>' +
            '<input type="hidden" id="correo" value="' + esc(p.correo || '') + '" />' +
            campo('codigo', 'Código de 6 dígitos', 'text', { modo:'numeric', max:'6', marcador:'000000' }) +
            campo('clave', 'Nueva contraseña', 'password', { autocompletar:'new-password', ayuda:'Mínimo 8 caracteres.' }) +
            '<button type="submit" class="fs-btn fs-btn--principal">Guardar y entrar</button>' +
          '</form>' +
          '<div class="fs-acceso-pies"><a href="#/entrar">Volver</a></div>' +
        '</div>' +
      '</div>';
    },
    montar: function(raiz){
      var form = dom.uno('#fs-form-restablecer', raiz);
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var v = valores(form);
        var libre = FS.util.ocupar(dom.uno('button[type=submit]', form), 'Guardando…');
        FS.api.llamar('restablecer', { correo:v.correo, codigo:v.codigo, clave:v.clave }).then(function(res){
          libre();
          if (res.ok) return entrarConSesion(res);
          mostrarError(form, res);
        });
      });
      dom.uno('#codigo', raiz).focus();
    }
  });

})();

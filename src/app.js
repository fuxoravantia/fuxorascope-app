/* FuxoraScope · APLICACIÓN (src/app.js)
   ─────────────────────────────────────────────────────────────────────────
   Arranque y armazón. Pinta la barra superior (que se repinta sola cuando
   cambia la sesión o la ruta), registra la pantalla de cuenta y enciende el
   enrutador.

   Este archivo va de último: cuando corre, las vistas ya se registraron. */
(function(){
  'use strict';

  var FS = window.FS, dom = FS.dom, esc = dom.escapar;

  /* ═══ Barra superior ═══════════════════════════════════════════════════ */
  function pintarCabecera(){
    var caja = dom.uno('#fs-cabecera');
    if (!caja) return;
    var cuenta = FS.estado.obtener('cuenta');
    var ruta = FS.estado.obtener('ruta');

    if (!cuenta) { caja.hidden = true; caja.innerHTML = ''; return; }
    caja.hidden = false;

    var enlaces = [
      { ruta:'estudio',      texto:'Nuevo estudio' },
      { ruta:'mis-estudios', texto:'Mis estudios' },
      { ruta:'cuenta',       texto:'Mi cuenta' }
    ];

    caja.innerHTML = '' +
      '<a class="fs-cab-marca" href="#/estudio">' +
        '<svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">' +
          '<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".35"/>' +
          '<circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".6"/>' +
          '<circle cx="24" cy="24" r="4.5" fill="currentColor"/>' +
          '<path d="M24 3v6M24 39v6M3 24h6M39 24h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>' +
        '<b>FuxoraScope</b>' +
      '</a>' +
      '<nav class="fs-cab-nav">' +
        enlaces.map(function(e){
          return '<a href="#/' + e.ruta + '"' + (ruta === e.ruta ? ' class="activo"' : '') + '>' +
                 esc(e.texto) + '</a>';
        }).join('') +
      '</nav>' +
      '<div class="fs-cab-cuenta">' +
        (FS.cfg.hayBackend() ? '' : '<span class="fs-etiqueta-demo" title="Sin servidor conectado">demo</span>') +
        '<span class="fs-cab-nombre">' + esc((cuenta.nombre || '').split(' ')[0]) + '</span>' +
        '<button type="button" id="fs-salir" class="fs-btn fs-btn--tenue fs-btn--chico">Salir</button>' +
      '</div>';

    dom.uno('#fs-salir', caja).addEventListener('click', function(){ FS.sesion.cerrar(); });
  }

  /* ═══ Vista: mi cuenta ═════════════════════════════════════════════════ */
  FS.ruta.registrar('cuenta', {
    privada: true,
    plantilla: function(_, est){
      var c = est.cuenta || {};
      function campo(id, etiqueta, valor, tipo){
        return '<label class="fs-campo" for="' + id + '">' +
                 '<span class="fs-campo-nombre">' + esc(etiqueta) + '</span>' +
                 '<input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '" />' +
               '</label>';
      }
      return '' +
      '<div class="fs-lista-pagina fs-lista-pagina--angosta">' +
        '<header class="fs-lista-cab"><h1>Mi cuenta</h1></header>' +
        '<div class="fs-tarjeta-plana">' +
          '<p class="fs-campo-fijo"><span>Correo</span><b>' + esc(c.correo) + '</b></p>' +
          '<p class="fs-campo-fijo"><span>Plan</span><b>' + esc(c.plan || 'prueba') + '</b></p>' +
          '<form id="fs-form-cuenta">' +
            campo('nombre', 'Nombre completo', c.nombre) +
            campo('empresa', 'Empresa', c.empresa) +
            campo('cargo', 'Cargo', c.cargo) +
            campo('telefono', 'Teléfono', c.telefono, 'tel') +
            '<button type="submit" class="fs-btn fs-btn--principal">Guardar cambios</button>' +
          '</form>' +
        '</div>' +
        '<p class="fs-pie-soporte">¿Dudas o algo no cuadra? Escríbenos a ' +
          '<a href="mailto:' + esc(FS.cfg.CORREO_SOPORTE) + '">' + esc(FS.cfg.CORREO_SOPORTE) + '</a>.</p>' +
      '</div>';
    },
    montar: function(raiz){
      var form = dom.uno('#fs-form-cuenta', raiz);
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var libre = FS.util.ocupar(dom.uno('button[type=submit]', form), 'Guardando…');
        FS.api.llamar('perfil', {
          nombre: dom.uno('#nombre', raiz).value,
          empresa: dom.uno('#empresa', raiz).value,
          cargo: dom.uno('#cargo', raiz).value,
          telefono: dom.uno('#telefono', raiz).value
        }).then(function(res){
          libre();
          if (!res.ok) return FS.aviso(res.error || 'No se pudo guardar.', 'error');
          FS.sesion.guardar(FS.estado.obtener('token'), res.cuenta);
          FS.aviso('Datos actualizados.', 'exito');
        });
      });
    }
  });

  /* ═══ Arranque ═════════════════════════════════════════════════════════ */
  function arrancar(){
    FS.estado.suscribir(pintarCabecera);

    var habia = FS.sesion.recuperar();
    FS.ruta.iniciar();
    pintarCabecera();

    // Con sesión guardada se revalida contra el servidor: si el token venció
    // o fue revocado, se cierra sin dejar al usuario en una pantalla muerta.
    if (habia) {
      FS.api.llamar('sesion', {}).then(function(res){
        if (res.ok) { FS.sesion.guardar(FS.estado.obtener('token'), res.cuenta); return; }
        if (res.codigo === 'SESION_INVALIDA') {
          FS.estado.fijar({ token:null, cuenta:null });
          try { localStorage.removeItem(FS.cfg.CLAVE_SESION); } catch(e){}
          FS.aviso('Tu sesión venció. Vuelve a entrar.', 'info');
          FS.ruta.ir('entrar');
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();

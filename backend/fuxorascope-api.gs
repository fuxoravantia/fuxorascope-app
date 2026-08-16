/* ═══════════════════════════════════════════════════════════════════════════
   FuxoraScope · API  (Google Apps Script)
   ───────────────────────────────────────────────────────────────────────────
   Backend completo del producto: cuentas, verificación por correo, sesiones
   con token firmado y almacenamiento de estudios.

   CÓMO INSTALARLO  (10 minutos, una sola vez)
   ───────────────────────────────────────────────────────────────────────────
   1. Entra a Google Drive con la cuenta  fuxoravantia@gmail.com
   2. Crea una hoja de cálculo nueva y llámala  "FuxoraScope · Base"
   3. Copia el ID de la hoja desde su URL:
        docs.google.com/spreadsheets/d/ ESTE_ES_EL_ID /edit
      y pégalo abajo en  FS_CFG.HOJA_ID
   4. En esa hoja: Extensiones → Apps Script
   5. Borra todo lo que traiga y pega ESTE archivo completo
   6. Guarda (💾) y ejecuta una vez la función  instalar
      → Google pedirá permisos: acepta (correo + hoja de cálculo)
   7. Implementar → Nueva implementación → tipo "Aplicación web"
        Ejecutar como:      Yo (fuxoravantia@gmail.com)
        Quién tiene acceso: Cualquier usuario
      → Implementar → copia la URL  https://script.google.com/macros/s/.../exec
   8. Pega esa URL en el archivo  src/config.js  del proyecto, en API_URL

   NOTA: cada vez que edites este script debes hacer
   "Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva → Implementar"
   para que los cambios salgan al aire. La URL no cambia.
   ═══════════════════════════════════════════════════════════════════════════ */

const FS_CFG = {
  HOJA_ID:        'PEGA_AQUI_EL_ID_DE_LA_HOJA',
  TAB_CUENTAS:    'cuentas',
  TAB_SESIONES:   'sesiones',
  TAB_ESTUDIOS:   'estudios',
  TAB_BITACORA:   'bitacora',
  PRODUCTO:       'FuxoraScope',
  DIAS_SESION:    30,
  MIN_CLAVE:      8,
  ITERACIONES:    600,   // repeticiones del hash de contraseña
  MIN_CODIGO:     20     // minutos de validez del código de verificación
};

const FS_COLS = {
  cuentas:  ['cuenta_id','correo','nombre','empresa','cargo','telefono','clave_hash','clave_sal',
             'estado','codigo','codigo_expira','creada','ultimo_ingreso','plan','rol'],
  sesiones: ['token_id','cuenta_id','creada','expira','activa','agente'],
  estudios: ['estudio_id','cuenta_id','nombre','lat','lng','radio_m','tipo_negocio',
             'indice','nivel','creado','payload'],
  bitacora: ['momento','cuenta_id','evento','detalle']
};

/* ── Punto de entrada ──────────────────────────────────────────────────────
   Un solo despachador. Toda petición es POST con {accion, ...}. Las acciones
   privadas exigen un token válido; el despachador lo resuelve una sola vez y
   se lo entrega ya verificado al manejador. */
const FS_PUBLICAS = ['registrar','confirmar','reenviar','entrar','recuperar','restablecer','ping'];

function doPost(e) {
  try {
    const cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const accion = String(cuerpo.accion || '').trim();
    if (!accion) return _resp({ ok:false, error:'Falta la acción.' });

    const manejador = FS_ACCIONES[accion];
    if (!manejador) return _resp({ ok:false, error:'Acción desconocida: ' + accion });

    if (FS_PUBLICAS.indexOf(accion) === -1) {
      const sesion = _verificarToken(cuerpo.token);
      if (!sesion.ok) return _resp({ ok:false, error:sesion.error, codigo:'SESION_INVALIDA' });
      return _resp(manejador(cuerpo, sesion.cuenta));
    }
    return _resp(manejador(cuerpo));
  } catch (err) {
    return _resp({ ok:false, error:'Error del servidor: ' + err });
  }
}

function doGet() {
  return _resp({ ok:true, producto:FS_CFG.PRODUCTO, mensaje:'API en línea.' });
}

/* ── Acciones ───────────────────────────────────────────────────────────── */
const FS_ACCIONES = {
  ping:        function(){ return { ok:true, hora:_ahora() }; },
  registrar:   accionRegistrar,
  confirmar:   accionConfirmar,
  reenviar:    accionReenviar,
  entrar:      accionEntrar,
  recuperar:   accionRecuperar,
  restablecer: accionRestablecer,
  sesion:      accionSesion,
  salir:       accionSalir,
  perfil:      accionPerfil,
  guardar_estudio: accionGuardarEstudio,
  listar_estudios: accionListarEstudios,
  abrir_estudio:   accionAbrirEstudio,
  borrar_estudio:  accionBorrarEstudio
};

/* ── 1. Registro ──────────────────────────────────────────────────────────
   Crea la cuenta en estado "pendiente" y envía un código de 6 dígitos.
   No devuelve token: primero hay que confirmar el correo. */
function accionRegistrar(c) {
  const correo   = _correo(c.correo);
  const nombre   = _texto(c.nombre);
  const empresa  = _texto(c.empresa);
  const cargo    = _texto(c.cargo);
  const telefono = _texto(c.telefono);
  const clave    = String(c.clave || '');

  if (!_correoValido(correo)) return { ok:false, error:'El correo no parece válido.', campo:'correo' };
  if (nombre.length < 3)      return { ok:false, error:'Escribe tu nombre completo.', campo:'nombre' };
  if (clave.length < FS_CFG.MIN_CLAVE)
    return { ok:false, error:'La contraseña debe tener al menos ' + FS_CFG.MIN_CLAVE + ' caracteres.', campo:'clave' };

  const hoja  = _tab(FS_CFG.TAB_CUENTAS);
  const filas = _filas(hoja);
  const previa = filas.filter(function(f){ return _correo(f.correo) === correo; })[0];

  // Si ya existe y está activa, no se puede volver a registrar.
  if (previa && String(previa.estado) === 'activa')
    return { ok:false, error:'Ya existe una cuenta con este correo. Inicia sesión.', campo:'correo', codigo:'YA_EXISTE' };

  const sal    = _sal();
  const codigo = _codigo();
  const expira = _sumarMinutos(FS_CFG.MIN_CODIGO);

  if (previa) {
    // Registro incompleto anterior: se sobrescribe con los datos nuevos.
    _escribir(hoja, previa._fila, {
      nombre:nombre, empresa:empresa, cargo:cargo, telefono:telefono,
      clave_hash:_hash(clave, sal), clave_sal:sal,
      estado:'pendiente', codigo:codigo, codigo_expira:expira
    });
  } else {
    _agregar(hoja, {
      cuenta_id:_id('cta'), correo:correo, nombre:nombre, empresa:empresa, cargo:cargo,
      telefono:telefono, clave_hash:_hash(clave, sal), clave_sal:sal,
      estado:'pendiente', codigo:codigo, codigo_expira:expira,
      creada:_ahora(), ultimo_ingreso:'', plan:'prueba', rol:'cliente'
    });
  }

  _enviarCodigo(correo, nombre, codigo, 'registro');
  _log('', 'registro', correo);
  return { ok:true, correo:_ocultar(correo), mensaje:'Te enviamos un código de 6 dígitos.' };
}

/* ── 2. Confirmar correo ────────────────────────────────────────────────── */
function accionConfirmar(c) {
  const correo = _correo(c.correo);
  const codigo = String(c.codigo || '').replace(/\D+/g, '');
  const hoja   = _tab(FS_CFG.TAB_CUENTAS);
  const cuenta = _buscarCuenta(hoja, correo);

  if (!cuenta) return { ok:false, error:'No encontramos esa cuenta.' };
  if (String(cuenta.estado) === 'activa')
    return { ok:false, error:'Esta cuenta ya estaba confirmada. Inicia sesión.', codigo:'YA_ACTIVA' };
  if (!codigo || String(cuenta.codigo) !== codigo)
    return { ok:false, error:'El código no coincide.', campo:'codigo' };
  if (_vencido(cuenta.codigo_expira))
    return { ok:false, error:'El código ya venció. Pide uno nuevo.', codigo:'VENCIDO' };

  _escribir(hoja, cuenta._fila, { estado:'activa', codigo:'', codigo_expira:'', ultimo_ingreso:_ahora() });
  _log(cuenta.cuenta_id, 'confirmacion', correo);
  return _abrirSesion(cuenta, c.agente);
}

/* ── 3. Reenviar código ─────────────────────────────────────────────────── */
function accionReenviar(c) {
  const correo = _correo(c.correo);
  const hoja   = _tab(FS_CFG.TAB_CUENTAS);
  const cuenta = _buscarCuenta(hoja, correo);
  if (!cuenta) return { ok:false, error:'No encontramos esa cuenta.' };
  if (String(cuenta.estado) === 'activa') return { ok:false, error:'Esta cuenta ya está confirmada.' };

  const codigo = _codigo();
  _escribir(hoja, cuenta._fila, { codigo:codigo, codigo_expira:_sumarMinutos(FS_CFG.MIN_CODIGO) });
  _enviarCodigo(correo, cuenta.nombre, codigo, 'registro');
  return { ok:true, mensaje:'Código reenviado.' };
}

/* ── 4. Ingresar ────────────────────────────────────────────────────────── */
function accionEntrar(c) {
  const correo = _correo(c.correo);
  const clave  = String(c.clave || '');
  const hoja   = _tab(FS_CFG.TAB_CUENTAS);
  const cuenta = _buscarCuenta(hoja, correo);

  if (!cuenta) return { ok:false, error:'Correo o contraseña incorrectos.' };
  if (String(cuenta.estado) === 'pendiente')
    return { ok:false, error:'Falta confirmar tu correo.', codigo:'PENDIENTE', correo:correo };
  if (String(cuenta.estado) === 'bloqueada')
    return { ok:false, error:'Esta cuenta está bloqueada. Escríbenos.' };
  if (_hash(clave, cuenta.clave_sal) !== String(cuenta.clave_hash))
    return { ok:false, error:'Correo o contraseña incorrectos.' };

  _escribir(hoja, cuenta._fila, { ultimo_ingreso:_ahora() });
  _log(cuenta.cuenta_id, 'ingreso', correo);
  return _abrirSesion(cuenta, c.agente);
}

/* ── 5. Recuperar contraseña ────────────────────────────────────────────── */
function accionRecuperar(c) {
  const correo = _correo(c.correo);
  const hoja   = _tab(FS_CFG.TAB_CUENTAS);
  const cuenta = _buscarCuenta(hoja, correo);
  // Respuesta idéntica exista o no la cuenta: no se filtra quién está registrado.
  if (cuenta && String(cuenta.estado) !== 'bloqueada') {
    const codigo = _codigo();
    _escribir(hoja, cuenta._fila, { codigo:codigo, codigo_expira:_sumarMinutos(FS_CFG.MIN_CODIGO) });
    _enviarCodigo(correo, cuenta.nombre, codigo, 'recuperacion');
  }
  return { ok:true, mensaje:'Si el correo está registrado, te llegará un código.' };
}

function accionRestablecer(c) {
  const correo = _correo(c.correo);
  const codigo = String(c.codigo || '').replace(/\D+/g, '');
  const clave  = String(c.clave || '');
  if (clave.length < FS_CFG.MIN_CLAVE)
    return { ok:false, error:'La contraseña debe tener al menos ' + FS_CFG.MIN_CLAVE + ' caracteres.', campo:'clave' };

  const hoja   = _tab(FS_CFG.TAB_CUENTAS);
  const cuenta = _buscarCuenta(hoja, correo);
  if (!cuenta) return { ok:false, error:'No encontramos esa cuenta.' };
  if (!codigo || String(cuenta.codigo) !== codigo) return { ok:false, error:'El código no coincide.', campo:'codigo' };
  if (_vencido(cuenta.codigo_expira)) return { ok:false, error:'El código ya venció. Pide uno nuevo.', codigo:'VENCIDO' };

  const sal = _sal();
  _escribir(hoja, cuenta._fila, {
    clave_hash:_hash(clave, sal), clave_sal:sal,
    estado:'activa', codigo:'', codigo_expira:'', ultimo_ingreso:_ahora()
  });
  _cerrarSesionesDe(cuenta.cuenta_id);   // cambiar la clave invalida sesiones viejas
  _log(cuenta.cuenta_id, 'restablecer', correo);
  return _abrirSesion(cuenta, c.agente);
}

/* ── 6. Sesión ──────────────────────────────────────────────────────────── */
function accionSesion(c, cuenta) { return { ok:true, cuenta:_publica(cuenta) }; }

function accionSalir(c, cuenta) {
  const hoja  = _tab(FS_CFG.TAB_SESIONES);
  const datos = _leerToken(c.token);
  if (datos) {
    const fila = _filas(hoja).filter(function(f){ return String(f.token_id) === datos.i; })[0];
    if (fila) _escribir(hoja, fila._fila, { activa:'no' });
  }
  return { ok:true };
}

function accionPerfil(c, cuenta) {
  const hoja = _tab(FS_CFG.TAB_CUENTAS);
  const fila = _filas(hoja).filter(function(f){ return String(f.cuenta_id) === cuenta.cuenta_id; })[0];
  if (!fila) return { ok:false, error:'Cuenta no encontrada.' };
  const cambios = {};
  ['nombre','empresa','cargo','telefono'].forEach(function(k){
    if (c[k] !== undefined) cambios[k] = _texto(c[k]);
  });
  if (Object.keys(cambios).length) _escribir(hoja, fila._fila, cambios);
  const actualizada = _filas(hoja).filter(function(f){ return String(f.cuenta_id) === cuenta.cuenta_id; })[0];
  return { ok:true, cuenta:_publica(actualizada) };
}

/* ── 7. Estudios ────────────────────────────────────────────────────────── */
function accionGuardarEstudio(c, cuenta) {
  const hoja = _tab(FS_CFG.TAB_ESTUDIOS);
  const r    = c.estudio || {};
  const id   = _texto(c.estudio_id) || _id('est');
  const reg  = {
    estudio_id:id, cuenta_id:cuenta.cuenta_id,
    nombre:_texto(r.nombre) || 'Estudio sin nombre',
    lat:r.lat || '', lng:r.lng || '', radio_m:r.radioM || '',
    tipo_negocio:_texto(r.tipoNegocio), indice:r.indice || 0, nivel:_texto(r.nivel),
    creado:_ahora(), payload:JSON.stringify(r).slice(0, 45000)
  };
  const previo = _filas(hoja).filter(function(f){
    return String(f.estudio_id) === id && String(f.cuenta_id) === cuenta.cuenta_id;
  })[0];
  if (previo) _escribir(hoja, previo._fila, reg); else _agregar(hoja, reg);
  return { ok:true, estudio_id:id };
}

function accionListarEstudios(c, cuenta) {
  const lista = _filas(_tab(FS_CFG.TAB_ESTUDIOS))
    .filter(function(f){ return String(f.cuenta_id) === cuenta.cuenta_id; })
    .map(function(f){
      return { estudio_id:f.estudio_id, nombre:f.nombre, lat:Number(f.lat), lng:Number(f.lng),
               radioM:Number(f.radio_m), tipoNegocio:f.tipo_negocio,
               indice:Number(f.indice), nivel:f.nivel, creado:f.creado };
    })
    .sort(function(a,b){ return String(b.creado).localeCompare(String(a.creado)); });
  return { ok:true, estudios:lista };
}

function accionAbrirEstudio(c, cuenta) {
  const fila = _filas(_tab(FS_CFG.TAB_ESTUDIOS)).filter(function(f){
    return String(f.estudio_id) === _texto(c.estudio_id) && String(f.cuenta_id) === cuenta.cuenta_id;
  })[0];
  if (!fila) return { ok:false, error:'Estudio no encontrado.' };
  try { return { ok:true, estudio:JSON.parse(fila.payload) }; }
  catch (err) { return { ok:false, error:'El estudio guardado está dañado.' }; }
}

function accionBorrarEstudio(c, cuenta) {
  const hoja = _tab(FS_CFG.TAB_ESTUDIOS);
  const fila = _filas(hoja).filter(function(f){
    return String(f.estudio_id) === _texto(c.estudio_id) && String(f.cuenta_id) === cuenta.cuenta_id;
  })[0];
  if (!fila) return { ok:false, error:'Estudio no encontrado.' };
  hoja.deleteRow(fila._fila);
  return { ok:true };
}

/* ═══ Sesiones con token firmado ═══════════════════════════════════════════
   El token viaja como  cuerpo.firma  donde cuerpo = base64({i,c,e}).
   La firma HMAC evita falsificaciones sin consultar la hoja; la fila en
   `sesiones` permite revocar (cerrar sesión, cambio de contraseña). */
function _abrirSesion(cuenta, agente) {
  const tokenId = _id('tok');
  const expira  = new Date(Date.now() + FS_CFG.DIAS_SESION * 864e5).toISOString();
  _agregar(_tab(FS_CFG.TAB_SESIONES), {
    token_id:tokenId, cuenta_id:cuenta.cuenta_id, creada:_ahora(),
    expira:expira, activa:'si', agente:String(agente || '').slice(0, 120)
  });
  const cuerpo = _b64({ i:tokenId, c:cuenta.cuenta_id, e:expira });
  return { ok:true, token:cuerpo + '.' + _firmar(cuerpo), cuenta:_publica(cuenta) };
}

function _leerToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2) return null;
  if (_firmar(partes[0]) !== partes[1]) return null;
  try { return JSON.parse(Utilities.newBlob(Utilities.base64Decode(partes[0])).getDataAsString()); }
  catch (err) { return null; }
}

function _verificarToken(token) {
  const datos = _leerToken(token);
  if (!datos)                      return { ok:false, error:'Sesión inválida.' };
  if (_vencido(datos.e))           return { ok:false, error:'Tu sesión venció. Vuelve a entrar.' };

  const sesion = _filas(_tab(FS_CFG.TAB_SESIONES)).filter(function(f){
    return String(f.token_id) === datos.i;
  })[0];
  if (!sesion || String(sesion.activa) !== 'si') return { ok:false, error:'Sesión cerrada.' };

  const cuenta = _filas(_tab(FS_CFG.TAB_CUENTAS)).filter(function(f){
    return String(f.cuenta_id) === datos.c;
  })[0];
  if (!cuenta)                            return { ok:false, error:'Cuenta no encontrada.' };
  if (String(cuenta.estado) !== 'activa') return { ok:false, error:'Cuenta inactiva.' };
  return { ok:true, cuenta:cuenta };
}

function _cerrarSesionesDe(cuentaId) {
  const hoja = _tab(FS_CFG.TAB_SESIONES);
  _filas(hoja).forEach(function(f){
    if (String(f.cuenta_id) === cuentaId && String(f.activa) === 'si')
      _escribir(hoja, f._fila, { activa:'no' });
  });
}

function _firmar(texto) {
  const bytes = Utilities.computeHmacSha256Signature(String(texto), _secreto());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function _secreto() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('FS_SECRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('FS_SECRETO', s); }
  return s;
}

/* ═══ Contraseñas ═════════════════════════════════════════════════════════
   SHA-256 con sal por cuenta, repetido FS_CFG.ITERACIONES veces para que
   probar contraseñas a la fuerza salga caro. */
function _hash(clave, sal) {
  let actual = String(sal) + '|' + String(clave);
  for (let i = 0; i < FS_CFG.ITERACIONES; i++) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, actual, Utilities.Charset.UTF_8);
    actual = bytes.map(function(b){ return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  return actual;
}
function _sal() { return Utilities.getUuid().replace(/-/g, ''); }
function _codigo() { return String(Math.floor(100000 + Math.random() * 900000)); }

/* ═══ Correo ══════════════════════════════════════════════════════════════ */
function _enviarCodigo(correo, nombre, codigo, motivo) {
  const esRecuperacion = motivo === 'recuperacion';
  const titulo = esRecuperacion ? 'Restablece tu contraseña' : 'Confirma tu correo';
  const bajada = esRecuperacion
    ? 'Pediste restablecer la contraseña de tu cuenta FuxoraScope. Usa este código:'
    : 'Gracias por crear tu cuenta en FuxoraScope. Usa este código para confirmar tu correo:';

  const html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;background:#0d1b26;padding:32px">' +
      '<div style="max-width:520px;margin:0 auto;background:#12242f;border:1px solid #1e3d4f;border-radius:16px;overflow:hidden">' +
        '<div style="background:#0b6e8f;padding:22px 28px">' +
          '<div style="color:#ffffff;font-size:21px;font-weight:700;letter-spacing:.5px">FuxoraScope</div>' +
          '<div style="color:#bfe8f7;font-size:13px;margin-top:3px">Análisis de viabilidad de implantación</div>' +
        '</div>' +
        '<div style="padding:28px">' +
          '<div style="color:#ffffff;font-size:19px;font-weight:700;margin-bottom:10px">' + titulo + '</div>' +
          '<div style="color:#cfe3ee;font-size:15px;line-height:1.6">Hola ' + _escapar(nombre || '') + ',<br>' + bajada + '</div>' +
          '<div style="margin:26px 0;text-align:center">' +
            '<div style="display:inline-block;background:#08303f;border:2px solid #16b3c9;border-radius:12px;' +
                 'padding:16px 30px;color:#7fe9f7;font-size:34px;font-weight:800;letter-spacing:10px">' + codigo + '</div>' +
          '</div>' +
          '<div style="color:#9fc0d1;font-size:13px;line-height:1.6">' +
            'El código vence en ' + FS_CFG.MIN_CODIGO + ' minutos. ' +
            'Si no fuiste tú, ignora este mensaje y tu cuenta seguirá igual.</div>' +
        '</div>' +
        '<div style="background:#0b1a23;padding:14px 28px;color:#6f93a6;font-size:12px">' +
          'FuxoraScope · Correo automático, no respondas a este mensaje.</div>' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: correo,
    subject: 'FuxoraScope · Tu código es ' + codigo,
    htmlBody: html,
    body: titulo + '\n\nTu código FuxoraScope es: ' + codigo + '\nVence en ' + FS_CFG.MIN_CODIGO + ' minutos.',
    name: FS_CFG.PRODUCTO
  });
}

/* ═══ Hoja de cálculo ═════════════════════════════════════════════════════ */
function _libro() { return SpreadsheetApp.openById(FS_CFG.HOJA_ID); }

function _tab(nombre) {
  const libro = _libro();
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) hoja = libro.insertSheet(nombre);
  const cols = FS_COLS[nombre] || [];
  if (hoja.getLastRow() === 0 && cols.length) {
    hoja.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function _encabezados(hoja) {
  return hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0]
             .map(function(h){ return String(h || '').trim(); });
}

function _filas(hoja) {
  const nf = hoja.getLastRow(), nc = hoja.getLastColumn();
  if (nf < 2 || nc < 1) return [];
  const cab = _encabezados(hoja);
  return hoja.getRange(2, 1, nf - 1, nc).getValues().map(function(fila, i){
    const obj = { _fila: i + 2 };
    cab.forEach(function(h, j){ if (h) obj[h] = fila[j]; });
    return obj;
  });
}

function _agregar(hoja, obj) {
  const cab = _encabezados(hoja);
  hoja.appendRow(cab.map(function(h){ return obj[h] !== undefined ? obj[h] : ''; }));
}

function _escribir(hoja, fila, cambios) {
  const cab = _encabezados(hoja);
  Object.keys(cambios).forEach(function(k){
    const i = cab.indexOf(k);
    if (i >= 0) hoja.getRange(fila, i + 1).setValue(cambios[k]);
  });
}

function _buscarCuenta(hoja, correo) {
  return _filas(hoja).filter(function(f){ return _correo(f.correo) === correo; })[0] || null;
}

function _publica(c) {
  return {
    cuenta_id: String(c.cuenta_id || ''), correo: _correo(c.correo), nombre: String(c.nombre || ''),
    empresa: String(c.empresa || ''), cargo: String(c.cargo || ''), telefono: String(c.telefono || ''),
    plan: String(c.plan || 'prueba'), rol: String(c.rol || 'cliente')
  };
}

function _log(cuentaId, evento, detalle) {
  try { _agregar(_tab(FS_CFG.TAB_BITACORA), { momento:_ahora(), cuenta_id:cuentaId, evento:evento, detalle:detalle }); }
  catch (err) { /* la bitácora nunca debe tumbar una petición */ }
}

/* ═══ Utilidades ══════════════════════════════════════════════════════════ */
function _resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
function _texto(v)  { return String(v == null ? '' : v).trim(); }
function _correo(v) { return _texto(v).toLowerCase(); }
function _correoValido(v) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v); }
function _ahora()   { return new Date().toISOString(); }
function _id(pre)   { return pre + '_' + Utilities.getUuid().slice(0, 8) + '_' + Date.now().toString(36); }
function _sumarMinutos(m) { return new Date(Date.now() + m * 60000).toISOString(); }
function _vencido(iso) { const t = Date.parse(iso); return !isFinite(t) || t < Date.now(); }
function _b64(obj)  { return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, ''); }
function _escapar(s){ return String(s).replace(/[<>&"]/g, function(c){
  return { '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]; }); }
function _ocultar(correo) {
  const p = String(correo).split('@');
  if (p.length !== 2) return correo;
  return (p[0].length <= 2 ? p[0][0] + '***' : p[0].slice(0, 2) + '***') + '@' + p[1];
}

/* ═══ Instalación y mantenimiento ═════════════════════════════════════════
   Ejecuta `instalar` UNA vez desde el editor para crear las pestañas y
   otorgar los permisos de correo. */
function instalar() {
  if (FS_CFG.HOJA_ID === 'PEGA_AQUI_EL_ID_DE_LA_HOJA')
    throw new Error('Primero pega el ID de tu hoja en FS_CFG.HOJA_ID (arriba del archivo).');
  Object.keys(FS_COLS).forEach(function(t){ _tab(t); });
  _secreto();
  Logger.log('FuxoraScope listo. Pestañas creadas: ' + Object.keys(FS_COLS).join(', '));
  Logger.log('Ahora: Implementar → Nueva implementación → Aplicación web → Cualquier usuario.');
}

/* Borra sesiones vencidas. Opcional: ponle un activador diario. */
function limpiarSesiones() {
  const hoja = _tab(FS_CFG.TAB_SESIONES);
  const viejas = _filas(hoja).filter(function(f){ return _vencido(f.expira); })
                             .sort(function(a, b){ return b._fila - a._fila; });
  viejas.forEach(function(f){ hoja.deleteRow(f._fila); });
  Logger.log('Sesiones vencidas eliminadas: ' + viejas.length);
}

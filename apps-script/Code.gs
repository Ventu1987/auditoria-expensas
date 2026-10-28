/**
 * Auditoría de expensas · planilla de datos y API.
 *
 * Instalación (una vez):
 *   1. Planilla nueva de Google Sheets → Extensiones → Apps Script.
 *   2. Pegar este archivo (Code.gs) y Esquema.gs. Guardar.
 *   3. Ejecutar prepararPlanilla y aceptar los permisos.
 *   4. Configuración del proyecto → Propiedades del script:
 *        CLAVE_ADMIN       clave de administración (migrar, todo)
 *        CLAVE_S2, CLAVE_LH, CLAVE_S1   clave del auditor de cada barrio (carga solo lo suyo)
 *        NOMBRES_PRIVADOS  nombres que nunca se publican, separados por coma
 *   5. Implementar → Nueva implementación → Aplicación web → Ejecutar como: yo · Acceso: cualquier persona.
 *
 * Lectura pública:  GET  ?accion=datos[&barrio=S2]
 * Escritura:        POST (texto JSON) {accion, barrio, clave, ...}
 *   verificar · subirArchivo · cargarLiquidacion · guardar · borrar · enlace · migrar
 */

var VERSION = '1.1';
var ADMIN_CUIT = '20-25787636-6'; // el único CUIT de persona física que se publica (el del administrador)
var EDITABLES = ['COMPROBANTES', 'CORRECCIONES', 'HALLAZGOS', 'EVENTOS', 'NOTAS', 'MEDIDAS', 'MOVIMIENTOS_BANCO', 'GASTOS', 'CONCEPTOS', 'INDICES', 'BARRIOS', 'EXPENSA_NUEVA', 'EXPENSA_ESTADO'];
var POR_MES = ['PERIODOS', 'GASTOS', 'FLUJO', 'PAGOS_ANTERIORES', 'PENDIENTES', 'NO_IDENTIFICADOS', 'COEFICIENTES'];
var TEXTO = /^(Mes|Fecha.*|Periodo_.*|Mes_Origen|ID_.*|Lote|Item|Recargo|Coef_Pct|CUIT.*|Numero)$/;

// ---------------------------------------------------------------- preparación

function prepararPlanilla() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(ESQUEMA).forEach(function (nombre) {
    var def = ESQUEMA[nombre];
    var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    var cab = def.columnas;
    var actual = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    if (actual.join('|') !== cab.join('|')) {
      // agrega columnas faltantes al final, sin borrar datos
      var faltan = cab.filter(function (c) { return actual.indexOf(c) < 0; });
      if (!actual.length || !actual[0]) sh.getRange(1, 1, 1, cab.length).setValues([cab]);
      else if (faltan.length) sh.getRange(1, actual.length + 1, 1, faltan.length).setValues([faltan]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#DCE4F0');
    sh.getRange(1, 1).setNote(def.descripcion);
  });
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1 && hoja1.getLastRow() === 0) ss.deleteSheet(hoja1);
  carpeta_('');
  SpreadsheetApp.getUi && SpreadsheetApp.flush();
  return 'Listo: ' + Object.keys(ESQUEMA).length + ' hojas.';
}

function carpeta_(ruta) {
  var props = PropertiesService.getScriptProperties();
  var raizId = props.getProperty('CARPETA_RAIZ');
  var raiz;
  try { raiz = raizId ? DriveApp.getFolderById(raizId) : null; } catch (e) { raiz = null; }
  if (!raiz) {
    raiz = DriveApp.createFolder('Auditoría de expensas · archivos');
    props.setProperty('CARPETA_RAIZ', raiz.getId());
  }
  var f = raiz;
  String(ruta || '').split('/').filter(String).forEach(function (n) {
    var it = f.getFoldersByName(n);
    f = it.hasNext() ? it.next() : f.createFolder(n);
  });
  return f;
}

// ---------------------------------------------------------------- lectura

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if ((p.accion || p.action || 'datos') !== 'datos') return json_({ ok: false, error: 'Acción desconocida' });
    return json_(datos_(p.barrio));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function datos_(barrio) {
  var ss = SpreadsheetApp.getActive();
  var out = { ok: true, version: VERSION, updated: Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm'), sheets: {} };
  Object.keys(ESQUEMA).forEach(function (n) {
    if (!ESQUEMA[n].publica) return;
    var filas = leer_(ss.getSheetByName(n));
    if (barrio && barrio !== 'todos') {
      filas = filas.filter(function (f) {
        if (f.Barrio !== undefined) return f.Barrio === barrio || f.Barrio === '' || f.Barrio === 'TODOS';
        if (f.Barrios !== undefined) return String(f.Barrios).split(/[,\s]+/).indexOf(barrio) >= 0;
        return true;
      });
    }
    out.sheets[n] = filas;
  });
  return out;
}

function leer_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var cab = v[0];
  var tz = 'America/Argentina/Buenos_Aires';
  return v.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {};
    cab.forEach(function (c, i) {
      var x = r[i];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, c === 'Mes' || c === 'Mes_Origen' || c === 'Periodo_Origen' || c === 'Periodo_Servicio' ? 'yyyy-MM' : 'yyyy-MM-dd');
      o[c] = x;
    });
    return o;
  });
}

// ---------------------------------------------------------------- escritura

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'El pedido no es JSON válido' });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var rol = rol_(body.barrio, body.clave);
    if (!rol) return json_({ ok: false, error: 'Clave incorrecta para ' + (body.barrio || 'el barrio') });
    switch (body.accion) {
      case 'verificar': return json_({ ok: true, rol: rol });
      case 'privados': return json_({ ok: true, nombres: privados_() }); // solo con clave: para ocultarlos en la revisión de la carga
      case 'subirArchivo': return json_(subirArchivo_(body));
      case 'enlace': return json_({ ok: true, url: DriveApp.getFileById(body.archivoId).getUrl() });
      case 'cargarLiquidacion': return json_(cargarLiquidacion_(body, rol));
      case 'guardar': return json_(guardar_(body, rol));
      case 'borrar': return json_(borrar_(body, rol));
      case 'migrar':
        if (rol !== 'admin') return json_({ ok: false, error: 'Solo con la clave de administración' });
        return json_(migrar_(body));
      default: return json_({ ok: false, error: 'Acción desconocida: ' + body.accion });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function rol_(barrio, clave) {
  if (!clave) return null;
  var props = PropertiesService.getScriptProperties();
  if (clave === props.getProperty('CLAVE_ADMIN')) return 'admin';
  if (barrio && clave === props.getProperty('CLAVE_' + barrio)) return barrio;
  return null;
}

function subirArchivo_(b) {
  var ruta = [b.barrio, b.carpeta || 'otros', b.mes || ''].join('/');
  var blob = Utilities.newBlob(Utilities.base64Decode(b.base64), b.mime || 'application/pdf', b.nombre || 'archivo.pdf');
  var f = carpeta_(ruta).createFile(blob);
  return { ok: true, archivoId: f.getId() };
}

/** Reemplaza todo lo del barrio y mes en las hojas por mes; agrega correcciones y eventos sugeridos sin pisar los manuales. */
function cargarLiquidacion_(b, rol) {
  if (!b.mes || !b.filas) throw new Error('Falta el mes o las filas');
  if (rol !== 'admin' && rol !== b.barrio) throw new Error('Esa clave no puede cargar ' + b.barrio);
  var ss = SpreadsheetApp.getActive();
  var priv = privados_();
  var hay = leer_(ss.getSheetByName('PERIODOS')).some(function (f) { return f.Barrio === b.barrio && f.Mes === b.mes; });
  if (hay && !b.reemplazar) return { ok: false, error: 'Ya hay una liquidación de ' + b.barrio + ' ' + b.mes + '. Marcá "reemplazar" para volver a cargarla.', existe: true };
  var n = 0;
  POR_MES.forEach(function (h) {
    var filas = (b.filas[h] || []).map(function (f) { return limpiarFila_(f, priv); });
    borrarDonde_(ss.getSheetByName(h), function (f) { return f.Barrio === b.barrio && f.Mes === b.mes; });
    agregar_(ss.getSheetByName(h), filas);
    n += filas.length;
  });
  // los eventos automáticos del mes se rehacen en cada carga; los manuales no se tocan
  var pref = b.barrio + '-' + b.mes + '-AUTO';
  borrarDonde_(ss.getSheetByName('EVENTOS'), function (f) { return f.Origen === 'auto' && String(f.ID_Evento).indexOf(pref) === 0; });
  // las correcciones sugeridas del mes se rehacen; las aplicadas o descartadas a mano se conservan
  borrarDonde_(ss.getSheetByName('CORRECCIONES'), function (f) { return f.Barrio === b.barrio && f.Mes === b.mes && f.Estado === 'SUGERIDA'; });
  ['CORRECCIONES', 'EVENTOS', 'HALLAZGOS'].forEach(function (h) {
    var filas = (b.filas[h] || []).map(function (f) { return limpiarFila_(f, priv); });
    if (filas.length) n += upsert_(ss.getSheetByName(h), filas, ESQUEMA[h].id, true);
  });
  agregar_(ss.getSheetByName('CARGAS'), [{
    ID_Carga: 'C' + new Date().getTime(), Barrio: b.barrio, Mes: b.mes, Fecha: Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm'),
    Usuario: rol, Archivo_ID: b.archivoId || '', Estado: hay ? 'REEMPLAZADA' : 'CARGADA', Resumen: b.resumen || '',
  }]);
  return { ok: true, filas: n };
}

function guardar_(b, rol) {
  if (EDITABLES.indexOf(b.hoja) < 0) throw new Error('La hoja ' + b.hoja + ' no se puede editar desde la app');
  if (rol !== 'admin' && (b.hoja === 'BARRIOS' || b.hoja === 'CONCEPTOS' || b.hoja === 'INDICES')) throw new Error('Solo con la clave de administración');
  var priv = privados_();
  var filas = (b.filas || []).map(function (f) {
    if (rol !== 'admin') {
      if (f.Barrio !== undefined && f.Barrio !== rol) throw new Error('Solo se pueden guardar filas de ' + rol);
      if (f.Barrios !== undefined && String(f.Barrios).indexOf(rol) < 0) throw new Error('Solo se pueden guardar filas de ' + rol);
    }
    return limpiarFila_(f, priv);
  });
  var n = upsert_(SpreadsheetApp.getActive().getSheetByName(b.hoja), filas, ESQUEMA[b.hoja].id, false);
  return { ok: true, filas: n };
}

function borrar_(b, rol) {
  if (EDITABLES.indexOf(b.hoja) < 0) throw new Error('La hoja ' + b.hoja + ' no se puede editar desde la app');
  var id = ESQUEMA[b.hoja].id;
  var n = borrarDonde_(SpreadsheetApp.getActive().getSheetByName(b.hoja), function (f) {
    return String(f[id]) === String(b.id) && (rol === 'admin' || f.Barrio === rol);
  });
  return { ok: true, borradas: n };
}

/** Carga inicial: reemplaza el contenido de las hojas que vienen en el pedido. */
function migrar_(b) {
  var ss = SpreadsheetApp.getActive();
  var priv = privados_();
  var res = {};
  Object.keys(b.sheets || {}).forEach(function (h) {
    if (!ESQUEMA[h]) return;
    var sh = ss.getSheetByName(h);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    var filas = b.sheets[h].map(function (f) { return limpiarFila_(f, priv); });
    agregar_(sh, filas);
    res[h] = filas.length;
  });
  return { ok: true, hojas: res };
}

// ---------------------------------------------------------------- ayudas de hoja

function agregar_(sh, filas) {
  if (!filas.length) return;
  var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var v = filas.map(function (f) {
    return cab.map(function (c) {
      var x = f[c];
      if (x === undefined || x === null) return '';
      if (typeof x === 'string' && TEXTO.test(c) && /^[\d-]/.test(x)) return "'" + x; // evita que Sheets lo convierta en fecha o número
      return x;
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, v.length, cab.length).setValues(v);
}

function borrarDonde_(sh, cond) {
  var filas = leer_(sh);
  var n = 0;
  for (var i = filas.length - 1; i >= 0; i--) {
    if (cond(filas[i])) {
      sh.deleteRow(i + 2);
      n++;
    }
  }
  return n;
}

/** Actualiza por ID (columna id) o agrega. soloNuevas: no pisa filas existentes. */
function upsert_(sh, filas, id, soloNuevas) {
  var actuales = leer_(sh);
  var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var pos = {};
  actuales.forEach(function (f, i) { pos[String(f[id])] = i + 2; });
  var nuevas = [];
  var n = 0;
  filas.forEach(function (f) {
    var k = String(f[id] || '');
    if (k && pos[k]) {
      if (soloNuevas) return;
      var fila = cab.map(function (c) {
        var x = f[c] === undefined ? actuales[pos[k] - 2][c] : f[c];
        if (typeof x === 'string' && TEXTO.test(c) && /^[\d-]/.test(x)) return "'" + x;
        return x === undefined || x === null ? '' : x;
      });
      sh.getRange(pos[k], 1, 1, cab.length).setValues([fila]);
      n++;
    } else {
      nuevas.push(f);
    }
  });
  agregar_(sh, nuevas);
  return n + nuevas.length;
}

// ---------------------------------------------------------------- privacidad

function privados_() {
  return String(PropertiesService.getScriptProperties().getProperty('NOMBRES_PRIVADOS') || '')
    .split(',').map(function (s) { return s.trim(); }).filter(String);
}

var VARIANTES_ = { a: 'aáàä', e: 'eéèë', i: 'iíìï', o: 'oóòö', u: 'uúùü', n: 'nñ' };

/** Regex que encuentra un nombre con o sin tildes, en mayúsculas o minúsculas. */
function patron_(nombre) {
  var base = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  var cuerpo = base.split('').map(function (ch) {
    if (/\s/.test(ch)) return '\\s+';
    if (VARIANTES_[ch]) return '[' + VARIANTES_[ch] + ']';
    return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(cuerpo, 'gi');
}

/** CUIT de persona física (20, 23, 24, 27) → 20-4006****-9, salvo el del administrador. */
function enmascarar_(t) {
  return String(t).replace(/\b(2[0347])-?(\d{4})(\d{4})-?(\d)\b/g, function (m, p, a, b, v) {
    var cuit = p + '-' + a + b + '-' + v;
    if (cuit === ADMIN_CUIT) return ADMIN_CUIT;
    return p + '-' + a + '****-' + v;
  });
}

function limpiarFila_(f, priv) {
  var o = {};
  var fisica = /^2[0347]-?\d{8}-?\d$/.test(String(f.CUIT_Proveedor || '').replace(/\*/g, '0')) && enmascarar_(f.CUIT_Proveedor) !== ADMIN_CUIT;
  var nombreProv = fisica ? String(f.Proveedor || '') : '';
  Object.keys(f).forEach(function (k) {
    var x = f[k];
    if (typeof x === 'string') {
      x = enmascarar_(x);
      priv.forEach(function (n) {
        x = x.replace(patron_(n), '(persona excluida)');
        n.split(/\s+/).filter(function (w) { return w.length >= 4; }).forEach(function (w) {
          x = x.replace(new RegExp('(^|[^A-Za-zÁÉÍÓÚÑáéíóúñ])' + patron_(w).source + '(?=$|[^A-Za-zÁÉÍÓÚÑáéíóúñ])', 'gi'), '$1(persona excluida)');
        });
      });
      // cualquier nombre seguido de un CUIT de persona física ya enmascarado
      x = x.replace(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.]*(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.]*){0,4})\s*\((2[0347]-\d{4}\*{4}-\d)\)/g, function (m, nom, cuit) {
        return /^Proveedor persona f/i.test(m) ? m : 'Proveedor persona física (' + cuit + ')';
      });
      if (nombreProv && nombreProv.length > 4 && k !== 'Proveedor') {
        x = x.replace(patron_(nombreProv), 'Proveedor persona física');
      }
    }
    o[k] = x;
  });
  if (fisica) {
    o.CUIT_Proveedor = enmascarar_(f.CUIT_Proveedor);
    o.Proveedor = 'Proveedor persona física (' + o.CUIT_Proveedor + ')';
  }
  return o;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

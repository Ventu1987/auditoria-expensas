// Prueba el Apps Script (Code.gs + Esquema.gs) con una planilla simulada en memoria.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import copia from '../src/data/copia.json';

type Celda = string | number | Date;

function crearEntorno() {
  const hojas = new Map<string, Celda[][]>();
  const props: Record<string, string> = { CLAVE_ADMIN: 'adm', CLAVE_S2: 's2', CLAVE_LH: 'lh', NOMBRES_PRIVADOS: 'María Ejemplo' };
  const archivos: { nombre: string; ruta: string }[] = [];
  const hoja = (nombre: string) => {
    const d = () => hojas.get(nombre)!;
    const ancho = () => Math.max(0, ...d().map((r) => r.length));
    const sh = {
      getName: () => nombre,
      getLastRow: () => d().length,
      getLastColumn: () => ancho(),
      setFrozenRows: () => sh,
      deleteRow: (i: number) => d().splice(i - 1, 1),
      getRange: (r: number, c: number, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => d()[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValues: (v: Celda[][]) => {
          v.forEach((fila, i) => {
            const rr = r - 1 + i;
            while (d().length <= rr) d().push([]);
            fila.forEach((x, j) => (d()[rr][c - 1 + j] = typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x));
          });
        },
        clearContent: () => {
          for (let i = 0; i < nr; i++) d()[r - 1 + i] = [];
          hojas.set(nombre, d().filter((f, k) => k === 0 || f.length));
        },
        setFontWeight: () => ({ setBackground: () => null }),
        setNote: () => null,
      }),
    };
    return sh;
  };
  const ss = {
    getSheetByName: (n: string) => (hojas.has(n) ? hoja(n) : null),
    insertSheet: (n: string) => {
      hojas.set(n, []);
      return hoja(n);
    },
    getSheets: () => [...hojas.keys()].map(hoja),
    deleteSheet: () => null,
  };
  const carpeta = (ruta: string): unknown => ({
    getId: () => 'carpeta',
    getFoldersByName: (n: string) => {
      let usado = false;
      return { hasNext: () => !usado, next: () => ((usado = true), carpeta(ruta + '/' + n)) };
    },
    createFolder: (n: string) => carpeta(ruta + '/' + n),
    createFile: (b: { nombre: string }) => {
      archivos.push({ nombre: b.nombre, ruta });
      return { getId: () => 'archivo' + archivos.length };
    },
  });
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: { getActive: () => ss, flush: () => null },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => (props[k] = v) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => null, releaseLock: () => null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ texto: t }) }) },
    Utilities: {
      formatDate: (d: Date, _tz: string, f: string) => (f === 'yyyy-MM' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10)),
      base64Decode: (s: string) => Buffer.from(s, 'base64'),
      newBlob: (_b: unknown, _m: string, nombre: string) => ({ nombre }),
    },
    DriveApp: { getFolderById: () => carpeta(''), createFolder: () => carpeta(''), getFileById: () => ({ getUrl: () => 'https://drive/x' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../apps-script/Esquema.gs', import.meta.url), 'utf8'), ctx);
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const post = (body: object) => JSON.parse(((ctx.doPost as (e: unknown) => { texto: string })({ postData: { contents: JSON.stringify(body) } })).texto);
  const get = (q: Record<string, string> = {}) => JSON.parse(((ctx.doGet as (e: unknown) => { texto: string })({ parameter: q })).texto);
  return { ctx, hojas, post, get, archivos };
}

describe('Apps Script', () => {
  it('prepara las hojas con sus encabezados', () => {
    const E = crearEntorno();
    (E.ctx.prepararPlanilla as () => string)();
    expect(E.hojas.get('GASTOS')![0][0]).toBe('ID_Gasto');
    expect(E.hojas.size).toBe(20);
  });

  it('con la planilla inicial ya subida, preparar no borra nada y la API la publica', () => {
    const E = crearEntorno();
    const esq = (E.ctx as { ESQUEMA?: Record<string, { columnas: string[] }> }).ESQUEMA ?? {};
    void esq;
    // simula la planilla subida: cada hoja con encabezado y filas
    const ESQ = vm.runInContext('ESQUEMA', E.ctx as never) as Record<string, { columnas: string[] }>;
    E.hojas.set('LEEME', [['Planilla de datos']]);
    for (const [h, def] of Object.entries(ESQ)) {
      const filas = ((copia.sheets as Record<string, Record<string, unknown>[]>)[h] ?? []).map((f) => def.columnas.map((c) => (f[c] ?? '') as string | number));
      E.hojas.set(h, [def.columnas, ...filas]);
    }
    (E.ctx.prepararPlanilla as () => string)();
    const d = E.get();
    expect(d.sheets.GASTOS.length).toBe(112);
    expect(d.sheets.PERIODOS.length).toBe(9);
    expect(E.hojas.has('LEEME')).toBe(true);
  });

  it('actualiza una planilla de la v1 sin perder datos: agrega hojas y columnas nuevas', () => {
    const E = crearEntorno();
    const ESQ = vm.runInContext('ESQUEMA', E.ctx as never) as Record<string, { columnas: string[] }>;
    for (const [h, def] of Object.entries(ESQ)) {
      if (h.startsWith('EXPENSA_')) continue; // la v1 no las tenía
      const cols = h === 'CONCEPTOS' ? def.columnas.filter((c) => c !== 'Que_Es') : def.columnas;
      const filas = ((copia.sheets as Record<string, Record<string, unknown>[]>)[h] ?? []).map((f) => cols.map((c) => (f[c] ?? '') as string | number));
      E.hojas.set(h, [cols, ...filas]);
    }
    (E.ctx.prepararPlanilla as () => string)();
    expect(E.hojas.has('EXPENSA_NUEVA')).toBe(true);
    expect(E.hojas.get('CONCEPTOS')![0].at(-1)).toBe('Que_Es');
    expect(E.get().sheets.GASTOS.length).toBe(112);
    const r = E.post({ accion: 'guardar', barrio: 'S2', clave: 's2', hoja: 'EXPENSA_NUEVA', filas: [{ ID_Linea: 'S2-2026-10-Telered', Barrio: 'S2', Mes: '2026-10', Concepto: 'Telered', Explicacion: 'Prueba', Ahorrable: 'SI', Ahorro_Estimado: 467600 }] });
    expect(r.ok).toBe(true);
    expect(E.get().sheets.EXPENSA_NUEVA[0].Ahorrable).toBe('SI');
    expect(E.post({ accion: 'guardar', barrio: 'S2', clave: 's2', hoja: 'EXPENSA_ESTADO', filas: [{ ID_Expensa: 'S2-2026-10', Barrio: 'S2', Mes: '2026-10', Estado: 'PUBLICADA' }] }).ok).toBe(true);
  });

  it('migra, lee por barrio y no publica CARGAS', () => {
    const E = crearEntorno();
    (E.ctx.prepararPlanilla as () => string)();
    expect(E.post({ accion: 'migrar', barrio: 'S2', clave: 's2', sheets: copia.sheets }).ok).toBe(false);
    const r = E.post({ accion: 'migrar', barrio: 'S2', clave: 'adm', sheets: copia.sheets });
    expect(r.ok).toBe(true);
    expect(r.hojas.GASTOS).toBe(112);
    const d = E.get({ barrio: 'S2' });
    expect(d.sheets.GASTOS.length).toBe(73);
    expect(d.sheets.CARGAS).toBeUndefined();
    expect(d.sheets.PERIODOS[0].Mes).toBe('2026-05');
    const g = d.sheets.GASTOS.find((x: { ID_Gasto: string }) => x.ID_Gasto === 'S2-2026-10-G015');
    expect(g.Importe).toBe(5880744.15);
  });

  it('carga una liquidación con la clave del barrio y limpia los nombres', () => {
    const E = crearEntorno();
    (E.ctx.prepararPlanilla as () => string)();
    E.post({ accion: 'migrar', barrio: 'S2', clave: 'adm', sheets: copia.sheets });
    const filas = {
      PERIODOS: [{ ID_Periodo: 'S2-2026-11', Barrio: 'S2', Mes: '2026-11', Total_Gastos: 100 }],
      GASTOS: [{ ID_Gasto: 'S2-2026-11-G001', Barrio: 'S2', Mes: '2026-11', Texto_Original: 'SUELDOS SIN MARÍA EJEMPLO Y SIN EJEMPLO', Proveedor: 'JUAN PEREZ', CUIT_Proveedor: '20-12345678-9', Importe: 100 }],
      EVENTOS: [{ ID_Evento: 'S2-2026-11-AUTO-VTO', Barrio: 'S2', Fecha: '2026-11-19', Hecho: 'Vence', Origen: 'auto' }],
    };
    expect(E.post({ accion: 'cargarLiquidacion', barrio: 'S2', clave: 'lh', mes: '2026-11', filas }).ok).toBe(false);
    expect(E.post({ accion: 'cargarLiquidacion', barrio: 'S2', clave: 's2', mes: '2026-11', filas }).ok).toBe(true);
    const d = E.get({ barrio: 'S2' });
    const g = d.sheets.GASTOS.find((x: { ID_Gasto: string }) => x.ID_Gasto === 'S2-2026-11-G001');
    expect(g.Texto_Original).toBe('SUELDOS SIN (persona excluida) Y SIN (persona excluida)');
    expect(g.Proveedor).toBe('Proveedor persona física (20-1234****-9)');
    // no se puede cargar dos veces el mismo mes sin "reemplazar"
    const otra = E.post({ accion: 'cargarLiquidacion', barrio: 'S2', clave: 's2', mes: '2026-11', filas });
    expect(otra.existe).toBe(true);
    expect(E.post({ accion: 'cargarLiquidacion', barrio: 'S2', clave: 's2', mes: '2026-11', filas, reemplazar: true }).ok).toBe(true);
    expect(E.get({ barrio: 'S2' }).sheets.GASTOS.filter((x: { Mes: string }) => x.Mes === '2026-11').length).toBe(1);
  });

  it('guarda comprobantes y archivos solo del propio barrio', () => {
    const E = crearEntorno();
    (E.ctx.prepararPlanilla as () => string)();
    const sub = E.post({ accion: 'subirArchivo', barrio: 'S2', clave: 's2', carpeta: 'comprobantes', mes: '2026-10', nombre: 'f.pdf', base64: Buffer.from('x').toString('base64') });
    expect(sub.ok).toBe(true);
    expect(E.archivos[0].ruta).toBe('/S2/comprobantes/2026-10');
    const fila = { ID_Comprobante: 'S2-X1', Barrio: 'S2', Mes: '2026-10', ID_Gasto: 'S2-2026-10-G009', Tipo: 'FACTURA', Importe: 100000, Archivo_ID: sub.archivoId };
    expect(E.post({ accion: 'guardar', barrio: 'LH', clave: 'lh', hoja: 'COMPROBANTES', filas: [fila] }).ok).toBe(false);
    expect(E.post({ accion: 'guardar', barrio: 'S2', clave: 's2', hoja: 'COMPROBANTES', filas: [fila] }).ok).toBe(true);
    expect(E.post({ accion: 'guardar', barrio: 'S2', clave: 's2', hoja: 'COMPROBANTES', filas: [{ ...fila, Importe: 200 }] }).filas).toBe(1);
    expect(E.get().sheets.COMPROBANTES[0].Importe).toBe(200);
    expect(E.post({ accion: 'guardar', barrio: 'S2', clave: 's2', hoja: 'PERIODOS', filas: [] }).ok).toBe(false);
    expect(E.post({ accion: 'borrar', barrio: 'S2', clave: 's2', hoja: 'COMPROBANTES', id: 'S2-X1' }).borradas).toBe(1);
  });
});

// Cambios de la liquidación de 11/2026:
//  · la tabla de gastos trae dos columnas, «Gastos Ord.» y «Gastos Extraord.», sin columna de total;
//  · el mantenimiento del Fideicomiso (antes propios 80% y comunes 20%) viene en un solo ítem, en el rubro 5;
//  · hay una cuota extraordinaria: la última cuota de las cámaras a la empresa de seguridad.
// Se arma un PDF sintético (líneas con posición) y un mes sintético sobre la copia, sin datos personales.
import { describe, expect, it } from 'vitest';
import copia from '../src/data/copia.json';
import type { Base, Fila } from '../src/data/esquema';
import type { Linea } from '../src/parser/pdfTexto';
import { clasificar, columnasDe, combinarReglas, GRUPO_MANTENIMIENTO, leerLiquidacion, REGLAS_CONCEPTO, repartirColumnas, totalesProrrateo } from '../src/parser/adminprop';
import { prepararCarga } from '../src/data/cargar';
import { analizar } from '../src/motor/analisis';
import { expensaNueva } from '../src/motor/expensaNueva';

// ---------------------------------------------------------------- PDF sintético

let y = 800;
/** Una línea: pares [x, texto]. Los importes van alineados a la derecha (termina en x2). */
function ln(...partes: [number, string][]): Linea {
  y -= 10;
  const ps = partes.map(([x, t]) => ({ x, x2: x + t.length * 4, t }));
  return { pagina: 1, y, partes: ps, texto: ps.map((p) => p.t).join(' ') };
}
/** Importe en una columna que termina en x2: "$" a la izquierda y el número alineado a la derecha. */
const imp = (x2: number, t: string): [number, string][] => [
  [x2 - 70, '$'],
  [x2 - t.length * 4, t],
];
const ORD = 470;
const EXT = 550;

function pdfNoviembre(): Linea[] {
  return [
    ln([20, 'Liquidación: 11/2026'], [300, 'CUIT: 30-11111111-1'], [420, 'CUIT: 20-25787636-6']),
    ln([20, 'Luego del 10/12/2026 - 5,50%']),
    ln([20, 'Gastos Ord. 11/2026'], ...imp(ORD, '600.000,00')),
    ln([20, 'Gastos Extraord. 11/2026'], ...imp(ORD, '50.000,00')),
    ln([20, 'GASTOS DEL PERÍODO']),
    ln([20, '4. ABONOS DE SERVICIOS'], [400, 'Gastos Ord.'], [480, 'Gastos Extraord.']),
    ln([20, 'a.'], [40, 'ADMINPROP SA (30-22222222-2) - SISTEMA ADMINPROP'], ...imp(ORD, '100.000,00'), ...imp(EXT, '-')),
    ln([20, 'TOTAL RUBRO 4 1,00%'], ...imp(ORD, '100.000,00'), ...imp(EXT, '-')),
    ln([20, '5. MANTENIMIENTO DE PARTES COMUNES'], [400, 'Gastos Ord.'], [480, 'Gastos Extraord.']),
    ln([20, 'a.'], [40, 'FIDEICOMISO BELLA VISTA (30716718553) - GASTOS DE MANTENIMIENTO - OP 501 Y 502'], ...imp(ORD, '1.200.000,00'), ...imp(EXT, '-')),
    ln([20, 'b.'], [40, 'FIDEICOMISO BELLA VISTA (30716718553) - GASTOS CAJA CHICA - 5 COMPROBANTES'], ...imp(ORD, '80.000,00'), ...imp(EXT, '-')),
    ln([20, 'TOTAL RUBRO 5 10,00%'], ...imp(ORD, '1.280.000,00'), ...imp(EXT, '-')),
    ln([20, '11. SEGURIDAD'], [400, 'Gastos Ord.'], [480, 'Gastos Extraord.']),
    ln([20, 'a.'], [40, 'CRUZ DE MALTA SEGURIDAD SRL (30-33333333-3) - SERVICIO DE SEGURIDAD MES DE NOVIEMBRE'], ...imp(ORD, '5.900.000,00'), ...imp(EXT, '-')),
    ln([20, 'b.'], [40, 'CRUZ DE MALTA SEGURIDAD SRL (30-33333333-3) - CÁMARAS DE SEGURIDAD - ÚLTIMA CUOTA'], ...imp(ORD, '-'), ...imp(EXT, '900.000,00')),
    ln([20, 'TOTAL RUBRO 11 89,00%'], ...imp(ORD, '5.900.000,00'), ...imp(EXT, '900.000,00')),
    ln([20, 'TOTAL DE GASTOS'], ...imp(ORD, '7.280.000,00'), ...imp(EXT, '900.000,00')),
    ln([20, 'PRORRATEO DE GASTOS']),
    // lote, unidad, propietario (no se guarda), saldo, pagos, deuda, interés, %, cuota ord., cuota ext., particular, redondeo, $ total
    ln([20, '1'], [40, '1-1'], [60, 'PERSONA'], [150, '0'], [180, '0'], [210, '0'], [240, '0'], [270, '50,0000'], [320, '3.640.000,00'], [380, '450.000,00'], [430, '-'], [460, '0'], [500, '$'], [520, '4.090.000,00']),
    ln([20, '2'], [40, '1-2'], [60, 'PERSONA'], [150, '0'], [180, '0'], [210, '100.000,00'], [240, '5.000,00'], [270, '50,0000'], [320, '3.640.000,00'], [380, '450.000,00'], [430, '20.000,00'], [460, '0'], [500, '$'], [520, '4.215.000,00']),
    ln([20, 'TOTALES'], [150, '100.000,00'], [180, '0,00'], [210, '100.000,00'], [240, '5.000,00'], [270, '100,0000%'], [320, '7.280.000,00'], [380, '900.000,00'], [430, '20.000,00'], [460, '0,00'], [520, '8.305.000,00']),
    ln([20, 'DETALLE DE EGRESOS E INGRESOS']),
    ln([200, 'Concepto'], [384, 'ORDINARIO'], [442, 'EXTRAORD.'], [523, 'TOTAL']),
    ln([20, 'Saldo anterior al 01/11/2026'], [379, '$'], [390, '1.000.000,00'], [437, '$'], [450, '0,00'], [518, '$'], [530, '1.000.000,00']),
    ln([20, 'Cobros de expensas en término'], [379, '$'], [390, '7.000.000,00'], [437, '$'], [450, '900.000,00'], [518, '$'], [530, '7.900.000,00']),
    ln([20, 'Egresos por gastos'], [379, '$'], [390, '-7.280.000,00'], [437, '$'], [450, '-900.000,00'], [518, '$'], [530, '-8.180.000,00']),
    ln([20, 'Saldo al cierre 30/11/2026'], [379, '$'], [390, '720.000,00'], [437, '$'], [450, '0,00'], [518, '$'], [530, '720.000,00']),
    ln([20, 'RESUMEN DE MOVIMIENTOS BANCARIOS']),
    ln([20, 'Saldo inicial'], ...imp(ORD, '1.000.000,00')),
    ln([20, 'Ingresos'], ...imp(ORD, '7.900.000,00')),
    ln([20, 'Egresos'], ...imp(ORD, '-8.180.000,00')),
    ln([20, 'Saldo al cierre'], ...imp(ORD, '720.000,00')),
    ln([20, 'ESTADO PATRIMONIAL']),
    ln([20, 'SALDO DE DISPONIBILIDADES'], ...imp(ORD, '720.000,00')),
    ln([20, 'Expensas y otros conceptos a cobrar'], ...imp(ORD, '8.200.000,00')),
    ln([20, 'Deudas a cobrar'], ...imp(ORD, '100.000,00')),
    ln([20, 'Intereses a cobrar'], ...imp(ORD, '5.000,00')),
    ln([20, 'PATRIMONIO NETO'], ...imp(ORD, '9.025.000,00')),
  ];
}

describe('lector · liquidación con columna «Gastos Extraord.» (11/2026)', () => {
  const e = leerLiquidacion(pdfNoviembre());

  it('el importe de cada gasto es ordinario + extraordinario, no la última columna', () => {
    expect(e.columnasGastos).toEqual({ cantidad: 2, conTotal: false });
    expect(e.gastos.map((g) => g.total)).toEqual([10000000, 120000000, 8000000, 590000000, 90000000]);
    expect(e.gastos.map((g) => g.otrasColumnas)).toEqual([0, 0, 0, 0, 90000000]);
    expect(e.totalGastos).toBe(818000000);
    expect([e.totalGastosOrd, e.totalGastosExt]).toEqual([728000000, 90000000]);
    expect(e.rubros.map((r) => r.total)).toEqual([10000000, 128000000, 680000000]);
  });

  it('conceptos nuevos: mantenimiento en un ítem y cuota de cámaras (no «seguridad»)', () => {
    expect(e.gastos.map((g) => g.concepto)).toEqual(['Sistema AdminProp', GRUPO_MANTENIMIENTO, 'Caja chica Fideicomiso', 'Servicio de seguridad / vigilancia', 'Cámaras de seguridad - cuota extraordinaria']);
  });

  it('prorrateo: columna extraordinaria y cuota extraordinaria por lote', () => {
    expect(e.prorrateo.totales.repartido).toBe(728000000);
    expect(e.prorrateo.totales.repartidoExt).toBe(90000000);
    expect(e.prorrateo.totales.particulares).toBe(2000000);
    expect(e.prorrateo.lotes.map((l) => l.cuotaExt)).toEqual([45000000, 45000000]);
    expect(e.cuotaCuponExt).toBe(5000000);
  });

  it('controles: lo repartido (ord. + extraord.) es el total de gastos; deudas e intereses van aparte', () => {
    const ctl = Object.fromEntries(e.controles.map((x) => [x.control, x.ok]));
    expect(ctl['Repartido (Gastos Ord. + Extraord. del prorrateo) = total de gastos']).toBe(true);
    expect(ctl['Gastos extraordinarios: columna del prorrateo = columna de gastos']).toBe(true);
    expect(ctl['Prorrateo: deuda + intereses + repartido + particulares + redondeo = total']).toBe(true);
    expect(ctl['Expensas a cobrar = repartido (ord. + extraord.) + particulares']).toBe(true);
    expect(ctl['Total de gastos: suma de los ítems']).toBe(true);
    expect(ctl['Total de gastos: suma de los rubros']).toBe(true);
  });
});

describe('columnas: compatibilidad con las liquidaciones de una sola columna', () => {
  it('una columna: el importe es la columna', () => {
    expect(repartirColumnas([{ x2: 470, v: 500 }], null)).toEqual({ ord: 500, ext: 0, total: 500 });
  });
  it('ord + total (la última es la suma)', () => {
    const cols = columnasDe([{ x2: 470, v: 1000 }, { x2: 550, v: 1000 }]);
    expect(cols.conTotal).toBe(true);
    expect(repartirColumnas([{ x2: 470, v: 300 }, { x2: 550, v: 300 }], cols)).toEqual({ ord: 300, ext: 0, total: 300 });
  });
  it('ord + extraord. + total', () => {
    const cols = columnasDe([{ x2: 400, v: 700 }, { x2: 470, v: 300 }, { x2: 550, v: 1000 }]);
    expect(cols.conTotal).toBe(true);
    expect(repartirColumnas([{ x2: 400, v: 0 }, { x2: 470, v: 300 }, { x2: 550, v: 300 }], cols)).toEqual({ ord: 0, ext: 300, total: 300 });
  });
  it('un solo importe en la columna extraordinaria', () => {
    const cols = columnasDe([{ x2: 470, v: 700 }, { x2: 550, v: 300 }]);
    expect(repartirColumnas([{ x2: 552, v: 300 }], cols)).toEqual({ ord: 0, ext: 300, total: 300 });
  });
  it('totales del prorrateo de 4 y de 5 columnas', () => {
    expect(totalesProrrateo([1000, 50, 1, 1051])).toEqual({ repartido: 1000, repartidoExt: 0, particulares: 50, redondeo: 1, total: 1051 });
    expect(totalesProrrateo([1000, 200, 50, 1, 1251])).toEqual({ repartido: 1000, repartidoExt: 200, particulares: 50, redondeo: 1, total: 1251 });
  });
});

describe('conceptos', () => {
  it('los ítems viejos de mantenimiento siguen siendo propios y comunes', () => {
    expect(clasificar('FIDEICOMISO BELLA VISTA (30716718553) - MANTENIMIENTO DE ESPACIOS PROPIOS 80% - OP478')).toBe('Mantenimiento Fideicomiso - espacios propios 80%');
    expect(clasificar('FIDEICOMISO BELLA VISTA (30716718553) - MANTENIMIENTO DE ESPACIOS COMUNES 20% - OP478')).toBe('Mantenimiento Fideicomiso - espacios comunes 20%');
    expect(clasificar('FIDEICOMISO BELLA VISTA - MANTENIMIENTO ESPACIOS PROPIOS Y COMUNES')).toBe(GRUPO_MANTENIMIENTO);
    expect(clasificar('FIDEICOMISO BELLA VISTA (30716718553) - GASTOS CAJA CHICA - 17 COMPROBANTES')).toBe('Caja chica Fideicomiso');
    expect(clasificar('BANCO GALICIA - COMISION MANTENIMIENTO CTA. CTE')).toBe('Gastos bancarios - Galicia');
  });
  it('la planilla manda, pero los conceptos nuevos de la app se agregan en su orden', () => {
    const viejas = REGLAS_CONCEPTO.filter((r) => r.orden! % 1 === 0).map((r) => ({ concepto: r.concepto, patron: r.patron, orden: r.orden }));
    const r = combinarReglas(viejas);
    expect(clasificar('CRUZ DE MALTA SEGURIDAD SRL - CÁMARAS DE SEGURIDAD - CUOTA 6 DE 6', r)).toBe('Cámaras de seguridad - cuota extraordinaria');
    expect(clasificar('FIDEICOMISO BELLA VISTA - GASTOS DE MANTENIMIENTO', r)).toBe(GRUPO_MANTENIMIENTO);
  });
});

// ---------------------------------------------------------------- análisis con 11/2026 cargado

function conNoviembre(): Base {
  const base = JSON.parse(JSON.stringify(copia.sheets)) as Base;
  const oct = (h: keyof Base) => base[h].filter((f) => f.Barrio === 'S2' && f.Mes === '2026-10');
  const P = { ...oct('PERIODOS')[0] } as Fila;
  const gastos: Fila[] = [];
  let k = 0;
  const id = () => `S2-2026-11-G${String(++k).padStart(3, '0')}`;
  let mant = 0;
  for (const g of oct('GASTOS')) {
    if (String(g.Concepto).startsWith('Mantenimiento Fideicomiso')) {
      mant += Math.round(Number(g.Importe) * 100);
      continue;
    }
    gastos.push({ ...g, ID_Gasto: id(), Mes: '2026-11' });
  }
  gastos.push({ ...oct('GASTOS')[0], ID_Gasto: id(), Mes: '2026-11', Rubro_Num: 5, Rubro: '5. MANTENIMIENTO DE PARTES COMUNES', Concepto: GRUPO_MANTENIMIENTO, Texto_Original: 'GASTOS DE MANTENIMIENTO', Importe: mant / 100, Otras_Columnas: 0 });
  gastos.push({ ...oct('GASTOS')[0], ID_Gasto: id(), Mes: '2026-11', Rubro_Num: 11, Rubro: '11. SEGURIDAD', Concepto: 'Cámaras de seguridad - cuota extraordinaria', Texto_Original: 'CÁMARAS - ÚLTIMA CUOTA', Importe: 900000, Otras_Columnas: 900000 });
  const gastoOrd = gastos.reduce((a, g) => a + Math.round(Number(g.Importe) * 100) - Math.round(Number(g.Otras_Columnas) * 100), 0);
  // lo repartido = el gasto (ord. + ext.) con el redondeo de los coeficientes (unos $ 40 menos)
  const repOrd = gastoOrd - 4000;
  const cuota = Math.round((repOrd * Number(P.Cuota_Lote_Comun)) / Number(P.Repartido) / 100);
  base.PERIODOS.push({ ...P, ID_Periodo: 'S2-2026-11', Mes: '2026-11', Total_Gastos: (gastoOrd + 90000000) / 100, Repartido: repOrd / 100, Repartido_Ext: 900000, Cuota_Lote_Comun: cuota / 100, Cuota_Lote_Ext: 52545.24, Cuota_Lote_Reducido: '' });
  base.GASTOS.push(...gastos);
  return base;
}

describe('análisis · 11/2026 con cuota extraordinaria y mantenimiento unificado', () => {
  const base = conNoviembre();
  const A = analizar(base, 'S2');
  const i = A.meses.indexOf('2026-11');

  it('no dice que se cobró de más: repartido ord. + extraord. contra el total de gastos', () => {
    expect(i).toBeGreaterThan(0);
    expect(A.resumen.repartidoTotal[i]).toBe(A.resumen.repartido[i] + 90000000);
    expect(Math.abs(A.resumen.repartidoMenosGasto[i])).toBeLessThan(100000);
    expect(A.novedades.some((n) => n.clave === 'REPARTO')).toBe(false);
  });

  it('mantenimiento: se compara el ítem nuevo con la suma de propios + comunes de octubre', () => {
    expect(A.novedades.some((n) => n.tipo === 'nuevo' && /Mantenimiento/.test(n.texto))).toBe(false);
    expect(A.novedades.some((n) => n.tipo === 'falta' && /Mantenimiento|propios|comunes/i.test(n.texto))).toBe(false);
    const m = A.novedades.find((n) => n.clave.startsWith(GRUPO_MANTENIMIENTO))!;
    expect(m.importe).toBe(0);
    expect(m.texto).toMatch(/rubro 4 al 5/);
  });

  it('la cuota extraordinaria aparece como novedad, no como aumento de la seguridad', () => {
    expect(A.novedades.find((n) => n.clave === 'Cámaras de seguridad - cuota extraordinaria')!.tipo).toBe('nuevo');
    expect(A.novedades.some((n) => n.clave === 'CUOTA_EXT' && n.importe === 5254524)).toBe(true);
    expect(A.novedades.some((n) => /Seguridad: sube/.test(n.texto))).toBe(false);
  });

  it('expensa nueva: cuota ordinaria + extraordinaria y mantenimiento comparado con octubre', () => {
    const E = expensaNueva(base, 'S2', '2026-11');
    expect(E.cuotaExt).toBe(5254524);
    expect(E.cuotaTotal).toBe(E.cuota + 5254524);
    expect(E.repartido - E.totalGastos).toBe(-4000);
    const l = E.rubros.flatMap((r) => r.lineas).find((x) => x.concepto === GRUPO_MANTENIMIENTO)!;
    expect(l.anterior).toBe(118191545);
    expect(l.comparadoConGrupo).toBe(true);
    const cam = E.rubros.flatMap((r) => r.lineas).find((x) => x.concepto.startsWith('Cámaras'))!;
    expect(cam.extraordinario).toBe(90000000);
    expect(cam.explicacion).toMatch(/cuota extraordinaria/);
  });

  it('la carga sugiere la corrección del mantenimiento con el porcentaje de propios + comunes de octubre', () => {
    const e = leerLiquidacion(pdfNoviembre());
    const prep = prepararCarga(e, 'S2', copia.sheets as unknown as Base);
    const k = prep.filas.CORRECCIONES!.find((x) => x.Concepto === GRUPO_MANTENIMIENTO)!;
    // octubre: (863.634,61 + 200.655,09) ÷ (945.532,36 + 236.383,09)
    expect(k.Importe_Correcto).toBe(Math.round(1200000 * ((863634.61 + 200655.09) / (945532.36 + 236383.09)) * 100) / 100);
    expect(prep.filas.CORRECCIONES!.some((x) => String(x.Concepto).startsWith('Cámaras'))).toBe(false);
    const P = prep.filas.PERIODOS![0];
    expect([P.Repartido, P.Repartido_Ext, P.Cuota_Lote_Ext]).toEqual([7280000, 900000, 50000]);
  });
});

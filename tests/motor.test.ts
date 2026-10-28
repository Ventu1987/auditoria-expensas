import { describe, expect, it } from 'vitest';
import copia from '../src/data/copia.json';
import type { Base } from '../src/data/esquema';
import { analizar, consolidado } from '../src/motor/analisis';

const base = copia.sheets as unknown as Base;
const A = analizar(base, 'S2');
const i09 = A.meses.indexOf('2026-09');
const i10 = A.meses.indexOf('2026-10');

describe('Senderos II · cifras del Excel al centavo', () => {
  it('meses con gastos', () => expect(A.meses).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']));

  it('resumen: gasto, reparto y controles', () => {
    const R = A.resumen;
    expect(R.gasto).toEqual([867504617, 903153355, 1080010580, 956556834, 1157596579]);
    expect(R.controlGasto).toEqual([0, 0, 0, 0, 0]);
    expect(R.repartidoMenosGasto).toEqual([-3471, -3606, -4327, 162705466, -4637]);
    expect(R.reducida).toEqual([31947593, 33260429, 39773550, 41219200, 42630809]);
    expect(R.controlTotal).toEqual([0, 14, -22, 0, 0]);
    expect(R.rubros.find((r) => r.num === 11)!.serie[i10]).toBe(727658701);
    expect(R.rubros.find((r) => r.num === 4)!.serie[i10]).toBe(189247945);
  });

  it('liquidación correcta de 09 y 10/2026', () => {
    const R = A.resumen;
    expect([R.gastoCorrecto[i09], R.gastoCorrecto[i10]]).toEqual([888202783, 938474182]);
    expect([R.cuotaCorrecta[i09], R.cuotaCorrecta[i10]]).toEqual([50323106, 53171344]);
    expect([R.deMasLote[i09], R.deMasLote[i10]]).toEqual([13091194, 12414605]);
    expect([R.deMasBarrio[i09], R.deMasBarrio[i10]]).toEqual([231059517, 219117760]);
  });

  it('rubros: la diferencia de cada rubro suma la diferencia total', () => {
    for (const i of [i09, i10]) {
      const s = A.rubros.reduce((a, r) => a + (r.diferencia[i] ?? 0), 0);
      expect(s + A.resumen.repartidoMenosGasto[i]).toBe(A.resumen.deMasBarrio[i]);
    }
    const seg = A.rubros.find((r) => r.num === 11)!;
    expect([seg.diferencia[i09], seg.diferencia[i10]]).toEqual([45524326, 148627607]);
  });

  it('flujo de fondos', () => {
    const F = A.flujo;
    expect(F.control).toEqual([0, 0, 0, 0, 0]);
    expect(F.sinDetalleTotal).toEqual([-400000000, 0, -1978493420, 0, 0]);
    expect(F.totalBancos[i09]).toBe(859650030);
    expect(F.difBanco[i09]).toBe(496458584);
  });

  it('acumulado y proyección', () => {
    const X = A.acumulado;
    expect(X.deMasLote[i09]).toBe(13091194);
    expect(X.deMasBarrio[i10]).toBe(219117760);
    expect(X.proyeccion!.unaVez).toBe(134400000);
    expect(X.proyeccion!.recurrenteBarrio12).toBe(84722397 * 12);
  });

  it('respaldo documental', () => {
    const R = A.respaldo;
    expect(R.total.slice(2)).toEqual([1080010580, 956556834, 1157596579]);
    expect(R.sinValido.slice(2)).toEqual([192867844, 102206050, 137649663]);
  });

  it('ahorros posibles', () => {
    const X = A.ahorros;
    expect(X.A.mensual).toBe(84722397);
    expect(X.C.mensual).toBe(134400000 + 162705466);
  });

  it('matriz de riesgo', () => {
    const M = A.matriz;
    expect(M.filas.length).toBe(42);
    expect(M.porPrioridad.map((p) => p.cantidad)).toEqual([9, 14, 14, 4, 1]);
    expect(M.filas.filter((f) => f.prioridad.startsWith('1')).map((f) => f.codigo).sort()).toEqual(['H01', 'H02', 'H03', 'H11', 'H18', 'H20', 'H26', 'H28', 'H29']);
  });

  it('novedades de octubre: ordenadas por monto, sin el abono de plagas, con aclaraciones y la cuota al final', () => {
    const N = A.novedades;
    expect(N.at(-1)!.tipo).toBe('cuota');
    expect(N.some((n) => /plagas/i.test(n.texto))).toBe(false);
    const montos = N.slice(0, -1).map((n) => n.importe ?? 0);
    const pos = montos.filter((m) => m >= 0);
    expect(pos).toEqual([...pos].sort((a, b) => b - a));
    expect(N.find((n) => n.clave === 'Telered')!.aclaracion).toMatch(/100\.000/);
    expect(N.find((n) => n.clave.startsWith('Mantenimiento Fideicomiso - espacios propios'))!.aclaracion).toMatch(/236\.474,77/);
  });

  it('consolidado: la seguridad es igual al centavo en los dos barrios', () => {
    const C = consolidado(base);
    expect(C.barrios).toEqual(['S2', 'LH']);
    expect(C.meses).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(C.filas.find((f) => f.concepto.startsWith('Servicio de seguridad'))!.iguales).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});

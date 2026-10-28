import { describe, expect, it } from 'vitest';
import copia from '../src/data/copia.json';
import type { Base } from '../src/data/esquema';
import { expensaNueva } from '../src/motor/expensaNueva';

const base = copia.sheets as unknown as Base;

describe('expensa nueva · Senderos II 10/2026', () => {
  const E = expensaNueva(base, 'S2', '2026-10');
  it('cuota de RyM y la que correspondería', () => {
    expect(E.cuota).toBe(65585949);
    expect(E.cuotaAnt).toBe(63414300);
    expect(E.cuotaCorrecta).toBe(53171344);
    expect(E.totalGastos).toBe(1157596579);
    expect(E.totalCorrecto).toBe(938474182);
  });
  it('rubros y líneas suman el total', () => {
    expect(E.rubros.reduce((a, r) => a + r.total, 0)).toBe(E.totalGastos);
    const tel = E.rubros.flatMap((r) => r.lineas).find((l) => l.concepto === 'Telered')!;
    expect(tel.anterior).toBe(19285500);
    expect(tel.correcto).toBe(10000000);
    expect(tel.explicacion).toMatch(/Sube 194,3%/);
    expect(tel.queEs).toMatch(/cámaras/);
  });
  it('flujo de caja: cierra y calcula la plata libre', () => {
    const F = E.flujo;
    expect(F.control).toBe(0);
    expect(F.saldoInicial).toBe(363191446);
    expect(F.saldoFinal).toBe(1298109020);
    expect(F.libre).toBe(1298109020 - 1212975135 - 165930582);
  });
  it('sin datos propios, la expensa está en borrador', () => expect(E.estado).toBe('BORRADOR'));
});

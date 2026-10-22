// La planilla inicial (lo que se sube a Google Drive) da exactamente el mismo análisis que la copia.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import copia from '../src/data/copia.json';
import { HOJAS, baseVacia, type Base } from '../src/data/esquema';
import { analizar } from '../src/motor/analisis';

async function leerPlanilla(): Promise<Base> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(new URL('../planilla/Planilla_inicial_auditoria.xlsx', import.meta.url).pathname);
  const b = baseVacia();
  for (const h of HOJAS) {
    const ws = wb.getWorksheet(h)!;
    const cab = (ws.getRow(1).values as string[]).slice(1);
    ws.eachRow((r, i) => {
      if (i === 1) return;
      const v = (r.values as unknown[]).slice(1);
      b[h].push(Object.fromEntries(cab.map((c, j) => [c, (v[j] ?? '') as string | number])));
    });
  }
  return b;
}

describe('planilla inicial', () => {
  it('tiene las 18 hojas y las mismas filas que la copia', async () => {
    const b = await leerPlanilla();
    for (const h of HOJAS) expect([h, b[h].length]).toEqual([h, (copia.sheets as Record<string, unknown[]>)[h].length]);
  });
  it('da el mismo análisis al centavo', async () => {
    const b = await leerPlanilla();
    for (const barrio of ['S2', 'LH']) {
      const a = analizar(copia.sheets as unknown as Base, barrio);
      const x = analizar(b, barrio);
      expect(x.meses).toEqual(a.meses);
      expect(x.resumen).toEqual(a.resumen);
      expect(x.flujo.control).toEqual(a.flujo.control);
      expect(x.matriz.porPrioridad).toEqual(a.matriz.porPrioridad);
      expect(x.ahorros.recurrente).toEqual(a.ahorros.recurrente);
    }
  });
});

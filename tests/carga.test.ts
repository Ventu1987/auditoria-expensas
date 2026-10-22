import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { lineasDePdf } from '../src/parser/pdfTexto';
import { leerLiquidacion } from '../src/parser/adminprop';
import { prepararCarga } from '../src/data/cargar';
import copia from '../src/data/copia.json';
import type { Base, Fila } from '../src/data/esquema';
import { analizar } from '../src/motor/analisis';

// Los PDF tienen el padrón con nombres: no se suben al repositorio. Sin ellos, estas pruebas se saltean.
const HAY_PDF = existsSync(new URL('./pdf/Liquidacion_S2_2026_10.pdf', import.meta.url));
const base = copia.sheets as unknown as Base;
// nombres privados: archivo local junto a los PDF (no se sube)
const PRIVADOS = HAY_PDF ? readFileSync(new URL('./pdf/privados.txt', import.meta.url), 'utf8').split(/\n|,/).map((s) => s.trim()).filter(Boolean) : [];

async function preparar(mes: string) {
  const lineas = await lineasDePdf(new Uint8Array(readFileSync(new URL(`./pdf/Liquidacion_S2_2026_${mes}.pdf`, import.meta.url))), pdfjs as never);
  const sinMes = Object.fromEntries(Object.entries(base).map(([h, fs]) => [h, (fs as Fila[]).filter((f) => !(f.Barrio === 'S2' && f.Mes === `2026-${mes}`))])) as unknown as Base;
  return { prep: prepararCarga(leerLiquidacion(lineas), 'S2', sinMes, PRIVADOS), sinMes };
}

describe.skipIf(!HAY_PDF).each(['08', '09', '10'])('carga del PDF %s/2026', (m) => {
  const mes = `2026-${m}`;
  it('arma las mismas filas que la auditoría', async () => {
    const { prep } = await preparar(m);
    const P = prep.filas.PERIODOS![0];
    const V = base.PERIODOS.find((p) => p.Barrio === 'S2' && p.Mes === mes)!;
    for (const k of ['Total_Gastos', 'Repartido', 'Gastos_Particulares', 'Total_Expensas', 'Total_Con_Deudas', 'Cuota_Lote_Comun', 'Cuota_Lote_Reducido', 'Unidades', 'Unidades_Con_Deuda', 'Saldo_Inicial', 'Ingresos', 'Egresos', 'Saldo_Final', 'Fondo_Ord_Final', 'Fondo_Ext_Final', 'Patrimonio_Neto', 'Pendientes_Pago_Mes', 'Pagos_Periodos_Anteriores', 'Deudas_A_Cobrar'])
      expect([k, P[k]]).toEqual([k, V[k]]);
    const G = base.GASTOS.filter((g) => g.Barrio === 'S2' && g.Mes === mes);
    expect(prep.filas.GASTOS!.map((g) => [g.ID_Gasto, g.Concepto, g.Importe, g.Estado_Pago])).toEqual(G.map((g) => [g.ID_Gasto, g.Concepto, g.Importe, g.Estado_Pago]));
  });

  it('clasifica el flujo igual que la auditoría', async () => {
    const { prep } = await preparar(m);
    const suma = (fs: Fila[]) => {
      const r: Record<string, number> = {};
      for (const f of fs) if (f.Categoria) r[String(f.Categoria)] = Math.round(((r[String(f.Categoria)] ?? 0) + Number(f.Total)) * 100) / 100;
      return r;
    };
    expect(suma(prep.filas.FLUJO!)).toEqual(suma(base.FLUJO.filter((f) => f.Barrio === 'S2' && f.Mes === mes)));
  });

  it('no deja nombres privados ni CUIT de personas físicas', async () => {
    const { prep } = await preparar(m);
    const json = JSON.stringify(prep.filas);
    for (const n of PRIVADOS) for (const w of n.split(/\s+/)) expect(json.toUpperCase()).not.toContain(w.toUpperCase());
    // proveedores personas físicas: su CUIT sale enmascarado y su nombre no aparece
    expect(json).not.toMatch(/\b2[0347]-?\d{8}-?\d\b(?<!20-?25787636-?6)/);
    expect(json).not.toMatch(/20-?40060912-?9|20400609129/);
    expect(json).toContain('20-25787636-6');
  });

  it('el análisis da lo mismo con el mes cargado desde el PDF', async () => {
    const { prep, sinMes } = await preparar(m);
    const nueva = { ...sinMes } as Base;
    for (const [h, fs] of Object.entries(prep.filas)) (nueva as Record<string, Fila[]>)[h] = [...(nueva as Record<string, Fila[]>)[h], ...(fs as Fila[]).filter((f) => !(h === 'CORRECCIONES' && f.Estado === 'SUGERIDA'))];
    // las correcciones de la semilla siguen valiendo (mismos ID de gasto)
    nueva.CORRECCIONES = [...base.CORRECCIONES];
    const a = analizar(base, 'S2');
    const b = analizar(nueva, 'S2');
    expect(b.resumen.gasto).toEqual(a.resumen.gasto);
    expect(b.resumen.deMasLote).toEqual(a.resumen.deMasLote);
    expect(b.flujo.control.every((x) => x === 0)).toBe(true);
  });
});

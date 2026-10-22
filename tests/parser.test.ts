import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { lineasDePdf } from '../src/parser/pdfTexto';
import { leerLiquidacion, type Extraida } from '../src/parser/adminprop';

const S2 = JSON.parse(readFileSync(new URL('./S2.json', import.meta.url), 'utf8')).sheets;
const c = (v: unknown) => Math.round(Number(v) * 100);

async function leer(mes: string): Promise<{ e: Extraida; nombres: string[] }> {
  const lineas = await lineasDePdf(new Uint8Array(readFileSync(new URL(`./pdf/Liquidacion_S2_2026_${mes}.pdf`, import.meta.url))), pdfjs as never);
  // nombres de propietarios del padrón (columna PROPIETARIO): solo para comprobar que no salen
  const nombres = lineas
    .filter((l) => /^\d{1,3}$/.test(l.partes[0]?.t ?? '') && /^\d+-\d+$/.test(l.partes[1]?.t ?? ''))
    .map((l) => l.partes[2]?.t ?? '')
    .filter((n) => /[A-Z]{3}/.test(n));
  return { e: leerLiquidacion(lineas), nombres };
}

// Los PDF tienen el padrón con nombres: no se suben al repositorio. Sin ellos, estas pruebas se saltean.
const HAY_PDF = existsSync(new URL('./pdf/Liquidacion_S2_2026_10.pdf', import.meta.url));
describe.skipIf(!HAY_PDF).each(['08', '09', '10'])('liquidación %s/2026', (m) => {
  const mes = `2026-${m}`;
  const P = S2.PERIODOS.find((p: { Barrio: string; Mes: string }) => p.Barrio === 'S2' && p.Mes === mes);
  const G = S2.GASTOS.filter((g: { Barrio: string; Mes: string }) => g.Barrio === 'S2' && g.Mes === mes);

  it('lee los gastos uno por uno, igual que la auditoría', async () => {
    const { e } = await leer(m);
    expect(e.mes).toBe(mes);
    expect(e.gastos.map((g) => g.total)).toEqual(G.map((g: { Importe: number }) => c(g.Importe)));
    expect(e.gastos.map((g) => g.concepto)).toEqual(G.map((g: { Concepto_Normalizado: string }) => g.Concepto_Normalizado));
    expect(e.totalGastos).toBe(c(P.Total_Gastos_Periodo));
  });

  it('lee los totales del período', async () => {
    const { e } = await leer(m);
    expect(e.prorrateo.totales.repartido).toBe(c(P.Base_Prorrateo_Ord));
    expect(e.prorrateo.totales.particulares).toBe(c(P.Gastos_Particulares));
    expect(e.patrimonio.expensasACobrar).toBe(c(P.Total_Expensas));
    expect(e.prorrateo.totales.total).toBe(c(P.Total_Liquidado_Con_Deudas));
    expect(e.prorrateo.unidades).toBe(Number(P.Cantidad_Unidades));
    expect(e.prorrateo.unidadesConDeuda).toBe(Number(P.Unidades_Con_Deuda));
    expect(e.flujo.saldoAnterior.total).toBe(c(P.Saldo_Inicial));
    expect(e.flujo.saldoCierre.total).toBe(c(P.Saldo_Final));
    expect(e.resumenBanco.ingresos).toBe(c(P.Ingresos));
    expect(e.resumenBanco.egresos).toBe(c(P.Egresos_Caja));
    expect(e.patrimonio.patrimonioNeto).toBe(c(P.Patrimonio_Neto));
    expect(-e.patrimonio.devengadosPendientes).toBe(c(P.Gastos_Pendientes_Pago));
    expect(e.pagosAnterioresTotal).toBe(c(P.Pagos_Periodos_Anteriores));
    expect(e.fechaVencimiento).toBe(P.Fecha_Vencimiento);
    expect(e.cuotaCupon).toBe(c(P.Expensa_Ord_Lote_Tipo));
  });

  // Inconsistencias del propio documento (no del lector): 08/2026 el total de expensas difiere en $ 0,22;
  // 10/2026 el detalle de pendientes y el patrimonio neto difieren en $ 3.654.176,39 (H20).
  const ESPERADAS: Record<string, string[]> = {
    '08': ['Expensas a cobrar = repartido + particulares'],
    '09': [],
    '10': ['Gastos pendientes de pago: suma del detalle', 'Patrimonio neto: suma de sus partes'],
  };
  it('detecta solo las inconsistencias reales del documento', async () => {
    const { e } = await leer(m);
    const fallas = e.controles.filter((x) => !x.ok);
    expect(fallas.map((x) => x.control)).toEqual(ESPERADAS[m]);
    if (m === '08') expect(fallas[0].documento - fallas[0].calculado).toBe(22);
    if (m === '10') for (const f of fallas) expect(Math.abs(f.documento - f.calculado)).toBe(365417639);
  });

  it('no guarda nombres de propietarios', async () => {
    const { e, nombres } = await leer(m);
    expect(nombres.length).toBeGreaterThan(10);
    const json = JSON.stringify({ ...e, gastos: [] });
    for (const n of nombres) expect(json).not.toContain(n);
  });
});

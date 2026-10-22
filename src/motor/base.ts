// Ayudas comunes del motor de análisis. Todo en centavos enteros.
import type { Base, Fila } from '../data/esquema';
import { cents, divRound, type Cents, type Ratio } from '../lib/money';

export type { Cents, Ratio };
export const c = (v: unknown): Cents => (v === '' || v === null || v === undefined || v === 'N/D' ? 0 : cents(v as number));
export const hay = (v: unknown) => v !== '' && v !== null && v !== undefined && v !== 'N/D';
export const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0);

/** Centavos × (num/den) redondeado al centavo. */
export function prorr(x: Cents, num: Cents, den: Cents): Cents {
  if (!den) return 0;
  return Number(divRound(BigInt(x) * BigInt(num), BigInt(den)));
}

export interface Ctx {
  base: Base;
  barrio: string;
  meses: string[];
  periodo: (mes: string) => Fila | undefined;
  gastos: (mes: string) => Fila[];
  /** coeficiente del lote común del mes: cuota ÷ repartido */
  coef: (mes: string) => { num: Cents; den: Cents };
  barrioFila: Fila | undefined;
}

export function contexto(base: Base, barrio: string): Ctx {
  const P = base.PERIODOS.filter((p) => p.Barrio === barrio);
  const G = base.GASTOS.filter((g) => g.Barrio === barrio);
  const conGastos = new Set(G.filter((g) => c(g.Importe) !== 0).map((g) => String(g.Mes)));
  const meses = [...new Set(P.map((p) => String(p.Mes)))].filter((m) => conGastos.has(m)).sort();
  const porMes = new Map<string, Fila[]>();
  for (const g of G) {
    const k = String(g.Mes);
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k)!.push(g);
  }
  for (const l of porMes.values()) l.sort((a, b) => String(a.ID_Gasto).localeCompare(String(b.ID_Gasto)));
  const periodo = (mes: string) => P.find((p) => p.Mes === mes);
  return {
    base,
    barrio,
    meses,
    periodo,
    gastos: (mes) => porMes.get(mes) ?? [],
    // Si la cuota del mes se informó redondeada al peso (sin centavos), se usa el coeficiente
    // del mes más cercano que la informa con centavos: el redondeo distorsiona el coeficiente.
    coef: (mes) => {
      const conCent = (m: string) => c(periodo(m)?.Cuota_Lote_Comun) % 100 !== 0;
      let m = mes;
      if (!conCent(mes)) {
        const otros = meses.filter(conCent).sort((a, b) => Math.abs(mesNum(a) - mesNum(mes)) - Math.abs(mesNum(b) - mesNum(mes)) || b.localeCompare(a));
        if (otros.length) m = otros[0];
      }
      const p = periodo(m);
      return { num: c(p?.Cuota_Lote_Comun), den: c(p?.Repartido) };
    },
    barrioFila: base.BARRIOS.find((b) => b.ID_Barrio === barrio),
  };
}

/** Correcciones aplicadas por gasto. */
export function correcciones(ctx: Ctx): Map<string, Fila> {
  return new Map(
    ctx.base.CORRECCIONES.filter((k) => k.Barrio === ctx.barrio && String(k.Estado || 'APLICADA') === 'APLICADA').map((k) => [String(k.ID_Gasto), k]),
  );
}

/** Meses que tienen al menos una corrección aplicada (la "liquidación correcta" existe). */
export function mesesCorregidos(ctx: Ctx): Set<string> {
  return new Set(ctx.base.CORRECCIONES.filter((k) => k.Barrio === ctx.barrio && String(k.Estado || 'APLICADA') === 'APLICADA').map((k) => String(k.Mes)));
}

export function importeCorrecto(g: Fila, corr: Map<string, Fila>): Cents {
  const k = corr.get(String(g.ID_Gasto));
  return k ? c(k.Importe_Correcto) : c(g.Importe);
}

export function etiqueta(base: Base, concepto: string): string {
  return String(base.CONCEPTOS.find((x) => x.Concepto === concepto)?.Etiqueta || concepto);
}

export function notas(base: Base, barrio: string, ambito: string): { num: number; texto: string }[] {
  return base.NOTAS.filter((x) => x.Ambito === ambito && (x.Barrio === barrio || x.Barrio === 'TODOS' || x.Barrio === ''))
    .map((x) => ({ num: Number(x.Num), texto: String(x.Texto) }))
    .sort((a, b) => a.num - b.num);
}

/** Variación (b − a) / |a| como fracción, o null. */
export function variacion(a: Cents | null, b: Cents | null): number | null {
  if (a === null || b === null || a === 0) return null;
  return (b - a) / Math.abs(a);
}

const mesNum = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));

export const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesCorto = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

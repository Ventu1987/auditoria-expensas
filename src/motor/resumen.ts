import type { Fila } from '../data/esquema';
import { c, contexto, correcciones, etiqueta, hay, importeCorrecto, mesesCorregidos, notas, prorr, sum, type Cents, type Ctx } from './base';
import type { Base } from '../data/esquema';

export type Serie = (Cents | null)[];

export interface RubroResumen {
  num: number;
  nombre: string;
  serie: Serie;
}

export interface Resumen {
  meses: string[];
  rubros: RubroResumen[];
  gasto: Cents[];
  gastoInformado: Cents[];
  controlGasto: Cents[];
  repartido: Cents[];
  repartidoMenosGasto: Cents[];
  cuota: Cents[];
  coefPct: (number | null)[];
  reducida: Serie;
  relReducida: (number | null)[];
  cuotaGastoReal: Cents[];
  particulares: Cents[];
  totalCalculado: Cents[];
  totalInformado: Cents[];
  controlTotal: Cents[];
  cobradoOrdinario: Cents[];
  corregido: boolean[];
  gastoCorrecto: Serie;
  cuotaCorrecta: Serie;
  deMasLote: Serie;
  deMasPct: (number | null)[];
  deMasBarrio: Serie;
  peso: { nombre: string; serie: (number | null)[] }[];
  notas: { num: number; texto: string }[];
}

export function nombreRubro(num: number, gastos: Fila[]): string {
  const t = gastos.find((g) => Number(g.Rubro_Num) === num)?.Rubro;
  const limpio = String(t ?? `${num}.`).replace(/^\d+\.\s*/, '');
  return limpio
    .toLowerCase()
    .replace(/^./, (x) => x.toUpperCase())
    .replace(/edenor|arba/gi, (x) => x.toUpperCase());
}

export function rubrosDe(ctx: Ctx): { num: number; nombre: string }[] {
  const todos = ctx.meses.flatMap((m) => ctx.gastos(m));
  const nums = [...new Set(todos.map((g) => Number(g.Rubro_Num)))].sort((a, b) => a - b);
  // nombre tomado del mes más reciente en que aparece
  return nums.map((num) => ({ num, nombre: nombreRubro(num, [...todos].reverse()) }));
}

export function resumen(base: Base, barrio: string, ctxIn?: Ctx): Resumen {
  const ctx = ctxIn ?? contexto(base, barrio);
  const M = ctx.meses;
  const P = (m: string) => ctx.periodo(m)!;
  const rub = rubrosDe(ctx);
  const corr = correcciones(ctx);
  const corrMeses = mesesCorregidos(ctx);
  const rubros = rub.map((r) => ({ ...r, serie: M.map((m) => sum(ctx.gastos(m).filter((g) => Number(g.Rubro_Num) === r.num).map((g) => c(g.Importe)))) }));
  const gasto = M.map((m) => sum(ctx.gastos(m).map((g) => c(g.Importe))));
  const gastoInformado = M.map((m) => c(P(m).Total_Gastos));
  const repartido = M.map((m) => c(P(m).Repartido));
  const cuota = M.map((m) => c(P(m).Cuota_Lote_Comun));
  const red = ctx.barrioFila?.Coef_Lote_Reducido;
  const reducida = M.map((m, i) => (hay(P(m).Cuota_Lote_Reducido) ? c(P(m).Cuota_Lote_Reducido) : hay(red) ? repartido[i] - (Number(P(m).Unidades) - 1) * cuota[i] : null));
  const particulares = M.map((m) => c(P(m).Gastos_Particulares));
  const totalInformado = M.map((m) => c(P(m).Total_Expensas));
  const totalCalculado = M.map((_, i) => repartido[i] + particulares[i]);
  const gastoCorrecto = M.map((m) => (corrMeses.has(m) ? sum(ctx.gastos(m).map((g) => importeCorrecto(g, corr))) : null));
  const cuotaCorrecta = M.map((m, i) => (gastoCorrecto[i] === null ? null : prorr(gastoCorrecto[i]!, ctx.coef(m).num, ctx.coef(m).den)));
  const deMasLote = M.map((_, i) => (cuotaCorrecta[i] === null ? null : cuota[i] - cuotaCorrecta[i]!));
  return {
    meses: M,
    rubros: rubros.map((r) => ({ ...r, nombre: `${r.num}. ${r.nombre}` })),
    gasto,
    gastoInformado,
    controlGasto: M.map((_, i) => gasto[i] - gastoInformado[i]),
    repartido,
    repartidoMenosGasto: M.map((_, i) => repartido[i] - gasto[i]),
    cuota,
    coefPct: M.map((_, i) => (repartido[i] ? cuota[i] / repartido[i] : null)),
    reducida,
    relReducida: M.map((_, i) => (reducida[i] !== null && cuota[i] ? reducida[i]! / cuota[i] : null)),
    cuotaGastoReal: M.map((m, i) => prorr(gasto[i], ctx.coef(m).num, ctx.coef(m).den)),
    particulares,
    totalCalculado,
    totalInformado,
    controlTotal: M.map((_, i) => totalCalculado[i] - totalInformado[i]),
    cobradoOrdinario: repartido,
    corregido: M.map((m) => corrMeses.has(m)),
    gastoCorrecto,
    cuotaCorrecta,
    deMasLote,
    deMasPct: M.map((_, i) => (deMasLote[i] === null || !cuota[i] ? null : deMasLote[i]! / cuota[i])),
    deMasBarrio: M.map((_, i) => (gastoCorrecto[i] === null ? null : repartido[i] - gastoCorrecto[i]!)),
    peso: rubros.map((r) => ({ nombre: `${r.num}. ${r.nombre}`, serie: M.map((_, i) => (gasto[i] ? r.serie[i] / gasto[i] : null)) })),
    notas: notas(base, barrio, 'RESUMEN'),
  };
}

// ---------------------------------------------------------------- un rubro

export interface FilaConcepto {
  concepto: string;
  etiqueta: string;
  serie: Serie;
  cantidad: number[];
  estimado: boolean[];
  provisorio: boolean[];
  correcto: Serie;
  criterios: string[][];
}

export interface DetalleRubro {
  num: number;
  nombre: string;
  meses: string[];
  conceptos: FilaConcepto[];
  subtotal: Serie;
  pct: (number | null)[];
  porLote: Serie;
  corregido: boolean[];
  subtotalCorrecto: Serie;
  diferencia: Serie;
  diferenciaLote: Serie;
  comprobantes: { mes: string; concepto: string; liquidado: Cents; tipo: string; numero: string; emisor: string; importe: Cents | null; diferencia: Cents | null; esFiscal: string; observacion: string }[];
  notas: { num: number; texto: string }[];
}

export function detalleRubro(base: Base, barrio: string, num: number, ctxIn?: Ctx): DetalleRubro {
  const ctx = ctxIn ?? contexto(base, barrio);
  const M = ctx.meses;
  const corr = correcciones(ctx);
  const corrMeses = mesesCorregidos(ctx);
  const gs = (m: string) => ctx.gastos(m).filter((g) => Number(g.Rubro_Num) === num);
  const conceptos: string[] = [];
  for (const m of M) for (const g of gs(m)) if (!conceptos.includes(String(g.Concepto))) conceptos.push(String(g.Concepto));
  const filas: FilaConcepto[] = conceptos.map((k) => {
    const de = (m: string) => gs(m).filter((g) => g.Concepto === k);
    return {
      concepto: k,
      etiqueta: etiqueta(base, k),
      serie: M.map((m) => (de(m).length ? sum(de(m).map((g) => c(g.Importe))) : null)),
      cantidad: M.map((m) => de(m).length),
      estimado: M.map((m) => de(m).some((g) => g.Es_Estimado === 'SI')),
      provisorio: M.map((m) => de(m).some((g) => g.Es_Provisorio === 'SI')),
      correcto: M.map((m) => (corrMeses.has(m) && de(m).length ? sum(de(m).map((g) => importeCorrecto(g, corr))) : null)),
      criterios: M.map((m) => de(m).map((g) => String(corr.get(String(g.ID_Gasto))?.Criterio ?? '')).filter(Boolean)),
    };
  });
  const subtotal = M.map((m) => sum(gs(m).map((g) => c(g.Importe))));
  const gastoMes = M.map((m) => sum(ctx.gastos(m).map((g) => c(g.Importe))));
  const subtotalCorrecto = M.map((m) => (corrMeses.has(m) ? sum(gs(m).map((g) => importeCorrecto(g, corr))) : null));
  const diferencia = M.map((_, i) => (subtotalCorrecto[i] === null ? null : subtotal[i] - subtotalCorrecto[i]!));
  const ids = new Map(M.flatMap((m) => gs(m)).map((g) => [String(g.ID_Gasto), g]));
  const comprobantes = base.COMPROBANTES.filter((x) => x.Barrio === barrio && ids.has(String(x.ID_Gasto)))
    .map((x) => {
      const g = ids.get(String(x.ID_Gasto))!;
      const imp = hay(x.Importe) ? c(x.Importe) : null;
      return {
        mes: String(g.Mes),
        concepto: etiqueta(base, String(g.Concepto)),
        liquidado: c(g.Importe),
        tipo: String(x.Tipo),
        numero: String(x.Numero ?? ''),
        emisor: String(x.Emisor ?? ''),
        importe: imp,
        diferencia: imp === null ? null : c(g.Importe) - imp,
        esFiscal: String(x.Es_Fiscal ?? ''),
        observacion: String(x.Observacion ?? ''),
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));
  return {
    num,
    nombre: nombreRubro(num, [...M].reverse().flatMap((m) => ctx.gastos(m))),
    meses: M,
    conceptos: filas,
    subtotal,
    pct: M.map((_, i) => (gastoMes[i] ? subtotal[i] / gastoMes[i] : null)),
    porLote: M.map((m, i) => prorr(subtotal[i], ctx.coef(m).num, ctx.coef(m).den)),
    corregido: M.map((m) => corrMeses.has(m)),
    subtotalCorrecto,
    diferencia,
    diferenciaLote: M.map((m, i) => (diferencia[i] === null ? null : prorr(diferencia[i]!, ctx.coef(m).num, ctx.coef(m).den))),
    comprobantes,
    notas: notas(base, barrio, `RUBRO_${num}`),
  };
}

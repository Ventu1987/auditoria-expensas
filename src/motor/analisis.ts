import type { Base, Fila } from '../data/esquema';
import { c, contexto, correcciones, etiqueta, hay, importeCorrecto, mesesCorregidos, notas, prorr, sum, type Cents, type Ctx } from './base';
import { detalleRubro, resumen, rubrosDe, type Serie } from './resumen';

// ================================================================ flujo de fondos

export const CATEGORIAS_COBRO = [
  ['EN_TERMINO', 'Cobros de expensas en término y adelantadas'],
  ['ADEUDADAS', 'Cobros de expensas adeudadas'],
  ['INTERESES', 'Intereses por mora cobrados'],
  ['NO_IDENTIFICADOS', 'Cobros que no se sabe de qué lote son'],
  ['OTRO_INGRESO', 'Otros ingresos'],
] as const;
export const CATEGORIAS_PAGO = [
  ['PAGO_GASTOS', 'Pagos de gastos liquidados'],
  ['SIN_DETALLE', 'Pagos sin un gasto liquidado que los respalde'],
  ['AJUSTE', 'Ajustes sin explicación'],
  ['RECLASIFICACION', 'Cobros identificados que se pasan a su lote (no es un pago)'],
  ['OTRO_EGRESO', 'Otros egresos'],
] as const;

export function flujo(base: Base, barrio: string, ctxIn?: Ctx) {
  const ctx = ctxIn ?? contexto(base, barrio);
  const M = ctx.meses;
  const F = (m: string) => base.FLUJO.filter((x) => x.Barrio === barrio && x.Mes === m);
  const P = (m: string) => ctx.periodo(m)!;
  const cat = (x: Fila) => {
    const k = String(x.Categoria || 'OTRO');
    if (x.Tipo === 'INGRESO') return CATEGORIAS_COBRO.some((q) => q[0] === k) ? k : 'OTRO_INGRESO';
    return CATEGORIAS_PAGO.some((q) => q[0] === k) ? k : 'OTRO_EGRESO';
  };
  const serieCat = (tipo: string, k: string) => M.map((m) => {
    const xs = F(m).filter((x) => x.Tipo === tipo && cat(x) === k);
    return xs.length ? sum(xs.map((x) => c(x.Total))) : null;
  });
  const cobros = CATEGORIAS_COBRO.map(([k, t]) => ({ clave: k, texto: t, serie: serieCat('INGRESO', k) })).filter((x) => x.serie.some((v) => v !== null));
  const pagos = CATEGORIAS_PAGO.map(([k, t]) => ({ clave: k, texto: t, serie: serieCat('EGRESO', k) })).filter((x) => x.serie.some((v) => v !== null) || x.clave === 'SIN_DETALLE');
  const saldoInicial = M.map((m) => c(P(m).Saldo_Inicial));
  const totalCobrado = M.map((_, i) => sum(cobros.map((x) => x.serie[i] ?? 0)));
  const totalSalido = M.map((_, i) => sum(pagos.map((x) => x.serie[i] ?? 0)));
  const saldoCalculado = M.map((_, i) => saldoInicial[i] + totalCobrado[i] + totalSalido[i]);
  const saldoInformado = M.map((m) => c(P(m).Saldo_Final));
  const sinDetalle = M.flatMap((m, i) =>
    F(m).filter((x) => x.Tipo === 'EGRESO' && (cat(x) === 'SIN_DETALLE' || cat(x) === 'AJUSTE')).map((x) => ({ mes: m, i, concepto: String(x.Concepto), categoria: cat(x), importe: c(x.Total), observacion: String(x.Observacion ?? '') })),
  );
  const gasto = M.map((m) => sum(ctx.gastos(m).map((g) => c(g.Importe))));
  const pagadoMes = M.map((_, i) => -(pagos.find((x) => x.clave === 'PAGO_GASTOS')?.serie[i] ?? 0));
  const pendMes = M.map((m) => (hay(P(m).Pendientes_Pago_Mes) ? Math.abs(c(P(m).Pendientes_Pago_Mes)) : null));
  const pendTotal = M.map((m) => (hay(P(m).Saldos_Pendientes_Total) ? c(P(m).Saldos_Pendientes_Total) : null));
  const repMenosGasto = M.map((m, i) => c(P(m).Repartido) - gasto[i]);
  let acum = 0;
  const repartidoDeMasAcum = repMenosGasto.map((v) => (acum += v));
  // bancos: saldo del último movimiento de cada mes
  const movs = base.MOVIMIENTOS_BANCO.filter((x) => x.Barrio === barrio);
  const bancos = [...new Set(movs.map((x) => String(x.Banco)))].sort();
  const saldosBanco = bancos.map((b) => ({
    banco: b,
    serie: M.map((m) => {
      const xs = movs.filter((x) => x.Banco === b && String(x.Fecha).startsWith(m) && hay(x.Saldo)).sort((a, z) => String(a.Fecha).localeCompare(String(z.Fecha)));
      const u = xs.at(-1);
      return u ? { saldo: c(u.Saldo), fecha: String(u.Fecha) } : null;
    }),
  }));
  const totalBancos = M.map((_, i) => (saldosBanco.length && saldosBanco.every((b) => b.serie[i]) ? sum(saldosBanco.map((b) => b.serie[i]!.saldo)) : null));
  return {
    meses: M,
    saldoInicial,
    cobros,
    totalCobrado,
    pagos,
    totalSalido,
    saldoCalculado,
    saldoInformado,
    control: M.map((_, i) => saldoCalculado[i] - saldoInformado[i]),
    ingresosInformados: M.map((m) => c(P(m).Ingresos)),
    sinDetalle,
    sinDetalleTotal: M.map((_, i) => sum(sinDetalle.filter((x) => x.i === i && x.categoria === 'SIN_DETALLE').map((x) => x.importe))),
    gasto,
    pagadoMes,
    pctPagado: M.map((_, i) => (gasto[i] ? pagadoMes[i] / gasto[i] : null)),
    pendMes,
    pendTotal,
    pendDif: M.map((_, i) => (pendMes[i] !== null && pendTotal[i] !== null ? pendTotal[i]! - pendMes[i]! : null)),
    pagosAnteriores: M.map((m) => (hay(P(m).Pagos_Periodos_Anteriores) ? c(P(m).Pagos_Periodos_Anteriores) : null)),
    deudas: M.map((m) => (hay(P(m).Deudas_A_Cobrar) ? c(P(m).Deudas_A_Cobrar) : null)),
    intereses: M.map((m) => (hay(P(m).Intereses_A_Cobrar) ? c(P(m).Intereses_A_Cobrar) : null)),
    lotesConDeuda: M.map((m) => (hay(P(m).Unidades_Con_Deuda) ? Number(P(m).Unidades_Con_Deuda) : null)),
    noIdentificados: M.map((m) => {
      const xs = base.NO_IDENTIFICADOS.filter((x) => x.Barrio === barrio && x.Mes === m);
      return xs.length ? sum(xs.map((x) => c(x.Importe))) : null;
    }),
    repMenosGasto,
    repartidoDeMasAcum,
    fondoOrd: M.map((m) => (hay(P(m).Fondo_Ord_Final) ? c(P(m).Fondo_Ord_Final) : null)),
    fondoExt: M.map((m) => (hay(P(m).Fondo_Ext_Final) ? c(P(m).Fondo_Ext_Final) : null)),
    patrimonio: M.map((m) => (hay(P(m).Patrimonio_Neto) ? c(P(m).Patrimonio_Neto) : null)),
    controlesFallidos: M.map((m) => String(P(m).Controles_Fallidos ?? '')),
    saldosBanco,
    totalBancos,
    difBanco: M.map((_, i) => (totalBancos[i] === null ? null : totalBancos[i]! - saldoInformado[i])),
    notas: notas(base, barrio, 'FLUJO'),
  };
}

// ================================================================ acumulado y proyección

/** Conceptos que no se repiten: no entran en la proyección. */
const UNA_VEZ = /Obra de c[aá]maras|Equipamiento CCTV/;

export function acumulado(base: Base, barrio: string, ctxIn?: Ctx) {
  const ctx = ctxIn ?? contexto(base, barrio);
  const R = resumen(base, barrio, ctx);
  const M = R.meses;
  const corr = correcciones(ctx);
  const gastoCorrecto = M.map((_, i) => R.gastoCorrecto[i] ?? R.gasto[i]);
  const cuotaCorrecta = M.map((m, i) => prorr(gastoCorrecto[i], ctx.coef(m).num, ctx.coef(m).den));
  const deMasLote = M.map((_, i) => R.cuota[i] - cuotaCorrecta[i]);
  let a = 0;
  const acumLote = deMasLote.map((v) => (a += v));
  const red = Number(ctx.barrioFila?.Coef_Lote_Reducido || 0);
  const deMasBarrio = M.map((_, i) => R.repartido[i] - gastoCorrecto[i]);
  let b = 0;
  const acumBarrio = deMasBarrio.map((v) => (b += v));
  // de dónde sale la diferencia, por rubro
  const rub = rubrosDe(ctx);
  const porRubro = rub.map((r) => ({
    nombre: `${r.num}. ${r.nombre}`,
    serie: M.map((m, i) => (R.corregido[i] ? sum(ctx.gastos(m).filter((g) => Number(g.Rubro_Num) === r.num).map((g) => c(g.Importe) - importeCorrecto(g, corr))) : null)),
  }));
  const ult = M.length - 1;
  const mesU = M[ult];
  const unaVez = ult >= 0 ? sum(ctx.gastos(mesU).filter((g) => UNA_VEZ.test(String(g.Concepto))).map((g) => c(g.Importe) - importeCorrecto(g, corr))) : 0;
  const recurrenteBarrio = ult >= 0 ? deMasBarrio[ult] - R.repartidoMenosGasto[ult] - unaVez : 0;
  const recurrenteLote = ult >= 0 ? prorr(recurrenteBarrio, ctx.coef(mesU).num, ctx.coef(mesU).den) : 0;
  return {
    meses: M,
    corregido: R.corregido,
    gastoLiquidado: R.gasto,
    gastoCorrecto,
    cuotaLiquidada: R.cuota,
    cuotaCorrecta,
    deMasLote,
    acumLote,
    pct: M.map((_, i) => (R.cuota[i] ? deMasLote[i] / R.cuota[i] : null)),
    coefReducido: red || null,
    deMasReducido: red ? deMasLote.map((v) => Math.round(v * red)) : null,
    deMasBarrio,
    acumBarrio,
    porRubro,
    repartidoMenosGasto: R.repartidoMenosGasto,
    proyeccion: ult < 0 ? null : {
      mes: mesU,
      cuotaLiquidada12: R.cuota[ult] * 12,
      cuotaCorrecta12: cuotaCorrecta[ult] * 12,
      deMas12: (R.cuota[ult] - cuotaCorrecta[ult]) * 12,
      unaVez,
      recurrenteLote12: recurrenteLote * 12,
      recurrenteBarrio12: recurrenteBarrio * 12,
      totalLote: acumLote[ult] + recurrenteLote * 12,
    },
    notas: notas(base, barrio, 'ACUMULADO'),
  };
}

// ================================================================ respaldo documental

export const TIPOS_RESPALDO: Record<number, { nombre: string; texto: string }> = {
  1: { nombre: '1 · Completo', texto: 'Factura, extracto o póliza por el importe liquidado.' },
  2: { nombre: '2 · Parcial', texto: 'Documento de otro importe, compartido con otro barrio, a nombre de otro, o parte de documentos del Fideicomiso.' },
  3: { nombre: '3 · No fiscal', texto: 'Presupuesto, nota "no válido como factura", transferencia o referencia, sin factura.' },
  4: { nombre: '4 · Solo citado', texto: 'La liquidación cita un número de comprobante, pero el documento no está cargado.' },
  5: { nombre: '5 · Nada o estimado', texto: 'Sin ningún documento, o importe estimado.' },
};

/** Tipo de respaldo sugerido a partir de los comprobantes cargados. */
export function respaldoSugerido(g: Fila, comprobantes: Fila[]): number {
  const cs = comprobantes.filter((x) => String(x.ID_Gasto) === String(g.ID_Gasto));
  const imp = c(g.Importe);
  const fiscales = cs.filter((x) => x.Es_Fiscal === 'SI' || /FACTURA|EXTRACTO|P[OÓ]LIZA|BOLETA/i.test(String(x.Tipo)));
  if (fiscales.some((x) => hay(x.Importe) && Math.abs(c(x.Importe) - imp) <= 100)) return 1;
  if (fiscales.length) return 2;
  if (cs.length) return 3;
  if (g.Es_Estimado === 'SI' || g.Es_Provisorio === 'SI') return 5;
  if (String(g.Comprobante_Citado ?? '').trim()) return 4;
  return 5;
}

export function respaldo(base: Base, barrio: string, ctxIn?: Ctx) {
  const ctx = ctxIn ?? contexto(base, barrio);
  const M = ctx.meses;
  const filas = M.flatMap((m) =>
    ctx.gastos(m).map((g) => ({
      id: String(g.ID_Gasto),
      mes: m,
      concepto: etiqueta(base, String(g.Concepto)),
      importe: c(g.Importe),
      tipo: Number(g.Respaldo_Tipo) || respaldoSugerido(g, base.COMPROBANTES),
      sugerido: respaldoSugerido(g, base.COMPROBANTES),
      detalle: String(g.Respaldo_Detalle ?? ''),
      comprobantes: base.COMPROBANTES.filter((x) => String(x.ID_Gasto) === String(g.ID_Gasto)).length,
    })),
  );
  const resumenTipos = [1, 2, 3, 4, 5].map((t) => ({ tipo: t, ...TIPOS_RESPALDO[t], serie: M.map((m) => sum(filas.filter((f) => f.mes === m && f.tipo === t).map((f) => f.importe))) }));
  const total = M.map((_, i) => sum(resumenTipos.map((r) => r.serie[i])));
  const sinValido = M.map((_, i) => sum(resumenTipos.filter((r) => r.tipo >= 3).map((r) => r.serie[i])));
  return { meses: M, filas, resumenTipos, total, sinValido, pctSinValido: M.map((_, i) => (total[i] ? sinValido[i] / total[i] : null)), notas: notas(base, barrio, 'RESPALDO') };
}

// ================================================================ consolidado entre barrios

export function consolidado(base: Base) {
  const barrios = base.BARRIOS.filter((b) => b.Activo === 'SI').map((b) => String(b.ID_Barrio)).filter((b) => base.GASTOS.some((g) => g.Barrio === b));
  const ctxs = barrios.map((b) => contexto(base, b));
  const meses = [...new Set(ctxs.flatMap((x) => x.meses))].filter((m) => ctxs.filter((x) => x.meses.includes(m)).length >= 2).sort();
  const cols = meses.flatMap((m) => barrios.map((b) => ({ mes: m, barrio: b })));
  const conceptos: string[] = [];
  for (const k of ctxs) for (const m of meses) for (const g of k.gastos(m)) if (!conceptos.includes(String(g.Concepto))) conceptos.push(String(g.Concepto));
  const val = (b: string, m: string, k: string) => {
    const xs = ctxs[barrios.indexOf(b)].gastos(m).filter((g) => g.Concepto === k);
    return xs.length ? sum(xs.map((g) => c(g.Importe))) : null;
  };
  const filas = conceptos.map((k) => {
    const serie = cols.map((x) => val(x.barrio, x.mes, k));
    const iguales = meses.filter((m) => {
      const vs = barrios.map((b) => val(b, m, k)).filter((v): v is number => v !== null && v !== 0);
      return vs.length >= 2 && vs.every((v) => v === vs[0]);
    });
    return { concepto: k, etiqueta: etiqueta(base, k), serie, iguales };
  });
  const P = (b: string, m: string) => base.PERIODOS.find((p) => p.Barrio === b && p.Mes === m);
  const de = (campo: string) => cols.map((x) => (P(x.barrio, x.mes) && hay(P(x.barrio, x.mes)![campo]) ? c(P(x.barrio, x.mes)![campo]) : null));
  const gastoSuma = cols.map((x, i) => sum(filas.map((f) => f.serie[i] ?? 0)) || (x ? 0 : 0));
  const lotes = cols.map((x) => Number(P(x.barrio, x.mes)?.Unidades) || null);
  return {
    barrios,
    nombres: Object.fromEntries(base.BARRIOS.map((b) => [String(b.ID_Barrio), String(b.Nombre)])),
    meses,
    cols,
    filas,
    gastoSuma,
    gastoInformado: de('Total_Gastos'),
    repartido: de('Repartido'),
    lotes,
    gastoPorLote: cols.map((_, i) => (lotes[i] ? Math.round(gastoSuma[i] / lotes[i]!) : null)),
    cuota: de('Cuota_Lote_Comun'),
    particulares: de('Gastos_Particulares'),
    totalExpensas: de('Total_Expensas'),
    lotesConDeuda: cols.map((x) => (P(x.barrio, x.mes) && hay(P(x.barrio, x.mes)!.Unidades_Con_Deuda) ? Number(P(x.barrio, x.mes)!.Unidades_Con_Deuda) : null)),
    sinDatos: base.BARRIOS.filter((b) => b.Activo === 'SI' && !barrios.includes(String(b.ID_Barrio))).map((b) => String(b.Nombre)),
  };
}

// ================================================================ ahorros posibles

export function ahorros(base: Base, barrio: string, ctxIn?: Ctx) {
  const ctx = ctxIn ?? contexto(base, barrio);
  const corr = correcciones(ctx);
  const corrMeses = [...mesesCorregidos(ctx)].sort();
  const mesC = corrMeses.at(-1);
  const mesU = ctx.meses.at(-1)!;
  const coef = ctx.coef(mesC ?? mesU);
  const filas = base.MEDIDAS.filter((x) => x.Barrio === barrio).map((x) => {
    const calc = String(x.Calculo ?? '');
    let mensual: Cents | null = null;
    let mes = '';
    if (calc.startsWith('CORRECCION:') && mesC) {
      const pre = calc.slice(11).trim();
      mensual = sum(ctx.gastos(mesC).filter((g) => String(g.Concepto).startsWith(pre)).map((g) => c(g.Importe) - importeCorrecto(g, corr)));
      mes = mesC;
    } else if (calc.startsWith('CONCEPTO:')) {
      const pre = calc.slice(9).trim();
      mensual = sum(ctx.gastos(mesU).filter((g) => String(g.Concepto).startsWith(pre)).map((g) => c(g.Importe)));
      mes = mesU;
    } else if (hay(x.Ahorro_Mensual)) mensual = c(x.Ahorro_Mensual);
    const lote = mensual === null ? null : prorr(mensual, coef.num, coef.den);
    const grupo = String(x.Grupo);
    return {
      id: String(x.ID_Medida), grupo, medida: String(x.Medida), hoy: String(x.Hoy ?? ''), propuesta: String(x.Propuesta ?? ''), base: String(x.Base ?? ''), ref: String(x.Ref ?? ''), mes,
      mensual, lote, anualLote: lote === null ? null : grupo === 'C' ? lote : lote * 12,
      supuesto: /supuesto|propuesta|sin cotiz/i.test(String(x.Base ?? '')),
    };
  });
  const sub = (g: string) => ({
    mensual: sum(filas.filter((f) => f.grupo === g).map((f) => f.mensual ?? 0)),
    lote: sum(filas.filter((f) => f.grupo === g).map((f) => f.lote ?? 0)),
    anualLote: sum(filas.filter((f) => f.grupo === g).map((f) => f.anualLote ?? 0)),
  });
  const A = sub('A');
  const B = sub('B');
  const C = sub('C');
  const cuota = c(ctx.periodo(mesU)?.Cuota_Lote_Comun);
  const recurrenteLote = A.lote + B.lote;
  return {
    filas, A, B, C,
    recurrente: { mensual: A.mensual + B.mensual, lote: recurrenteLote, anualLote: A.anualLote + B.anualLote },
    mesCuota: mesU,
    cuota,
    cuotaConMedidas: cuota - recurrenteLote,
    baja: cuota ? recurrenteLote / cuota : null,
    notas: notas(base, barrio, 'AHORROS'),
  };
}

// ================================================================ matriz de riesgo

const PV: Record<string, number> = { Alta: 3, Media: 2, Baja: 1 };
const IV: Record<string, number> = { Alto: 3, Medio: 2, Bajo: 1 };
export const PRIORIDADES = ['1 · Urgente', '2 · Alta', '3 · Media', '4 · Baja', '5 · Resuelto'] as const;

export function impacto(gravedad: string, anual: Cents): 'Alto' | 'Medio' | 'Bajo' {
  if (gravedad === 'CRÍTICO' || anual >= 150000000) return 'Alto';
  if (gravedad === 'IMPORTANTE' || anual >= 15000000) return 'Medio';
  return 'Bajo';
}

export function matriz(base: Base, barrio: string, ctxIn?: Ctx) {
  const ctx = ctxIn ?? contexto(base, barrio);
  const mesU = ctx.meses.at(-1);
  const coef = mesU ? ctx.coef(mesU) : { num: 0, den: 0 };
  const resuelto = (e: string) => /SOLUCIONADO|RESUELTO/i.test(e);
  const filas = base.HALLAZGOS.filter((h) => h.Barrio === barrio && !/DESCARTADO|NO APLICA/i.test(String(h.Estado_Reclamo)) && h.Gravedad !== 'SIN INCONSISTENCIA')
    .map((h) => {
      const monto = hay(h.Monto) ? c(h.Monto) : null;
      const baseM = String(h.Base_Monto || (monto ? 'una vez' : 'sin monto'));
      const anual = (monto ?? 0) * (baseM === 'por mes' ? 12 : 1);
      const prob = PV[String(h.Probabilidad)] ? String(h.Probabilidad) : 'Media';
      const imp = impacto(String(h.Gravedad), anual);
      const puntaje = PV[prob] * IV[imp];
      const estado = String(h.Estado_Reclamo ?? '');
      const prioridad = resuelto(estado) ? PRIORIDADES[4] : puntaje === 9 ? PRIORIDADES[0] : puntaje === 6 ? PRIORIDADES[1] : puntaje >= 3 ? PRIORIDADES[2] : PRIORIDADES[3];
      return {
        id: String(h.ID_Hallazgo), codigo: String(h.Codigo), titulo: String(h.Titulo), donde: String(h.Donde_Verlo ?? ''), monto, base: baseM, anual,
        porLote: baseM === 'saldo en riesgo' ? null : prorr(anual, coef.num, coef.den), gravedad: String(h.Gravedad), probabilidad: prob, porQue: String(h.Por_Que_Probabilidad ?? ''),
        impacto: imp, puntaje, prioridad, estado, quePedir: String(h.Que_Pedir ?? ''), muestran: String(h.Lo_Que_Muestran ?? ''), resuelto: resuelto(estado),
      };
    })
    .sort((a, b) => a.prioridad.localeCompare(b.prioridad) || b.puntaje - a.puntaje || b.anual - a.anual);
  const grilla = (['Alto', 'Medio', 'Bajo'] as const).map((imp) => ({
    impacto: imp,
    celdas: (['Baja', 'Media', 'Alta'] as const).map((p) => ({
      probabilidad: p,
      puntaje: PV[p] * IV[imp],
      codigos: filas.filter((f) => f.impacto === imp && f.probabilidad === p && !f.resuelto).map((f) => f.codigo),
      resueltos: filas.filter((f) => f.impacto === imp && f.probabilidad === p && f.resuelto).map((f) => f.codigo),
    })),
  }));
  const porPrioridad = PRIORIDADES.map((p) => ({ prioridad: p, cantidad: filas.filter((f) => f.prioridad === p).length, anual: sum(filas.filter((f) => f.prioridad === p).map((f) => f.anual)) }));
  return { filas, grilla, porPrioridad, notas: notas(base, barrio, 'MATRIZ') };
}

// ================================================================ pedido y cronología

const GRAV: Record<string, number> = { CRÍTICO: 0, IMPORTANTE: 1, 'A REVISAR': 2 };
export function pedido(base: Base, barrio: string) {
  const filas = base.HALLAZGOS.filter((h) => h.Barrio === barrio && GRAV[String(h.Gravedad)] !== undefined && !/SOLUCIONADO|RESUELTO|DESCARTADO|NO APLICA/i.test(String(h.Estado_Reclamo)))
    .map((h) => ({ codigo: String(h.Codigo), tema: String(h.Titulo), pedir: String(h.Que_Pedir ?? ''), importe: hay(h.Monto) ? c(h.Monto) : null, gravedad: String(h.Gravedad), estado: String(h.Estado_Reclamo ?? ''), muestran: String(h.Lo_Que_Muestran ?? ''), donde: String(h.Donde_Verlo ?? '') }))
    .sort((a, b) => GRAV[a.gravedad] - GRAV[b.gravedad] || (b.importe ?? -1) - (a.importe ?? -1));
  return { filas, notas: notas(base, barrio, 'PEDIDO') };
}

export function cronologia(base: Base, barrio: string) {
  return base.EVENTOS.filter((e) => e.Barrio === barrio || e.Barrio === 'TODOS')
    .map((e) => ({ id: String(e.ID_Evento), fecha: String(e.Fecha), tipo: String(e.Tipo), hecho: String(e.Hecho), importe: hay(e.Importe) ? c(e.Importe) : null, ref: String(e.Ref ?? ''), origen: String(e.Origen ?? '') }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

// ================================================================ novedades de un mes

export interface Novedad {
  tipo: 'nuevo' | 'falta' | 'aumento' | 'baja' | 'estimado' | 'repetido' | 'control' | 'reparto' | 'cuota';
  texto: string;
  importe?: Cents;
}

export function novedades(base: Base, barrio: string, mes: string, ctxIn?: Ctx): Novedad[] {
  const ctx = ctxIn ?? contexto(base, barrio);
  const i = ctx.meses.indexOf(mes);
  if (i < 0) return [];
  const ant = i > 0 ? ctx.meses[i - 1] : null;
  const out: Novedad[] = [];
  const porConcepto = (m: string) => {
    const r = new Map<string, Cents>();
    for (const g of ctx.gastos(m)) r.set(String(g.Concepto), (r.get(String(g.Concepto)) ?? 0) + c(g.Importe));
    return r;
  };
  const hoy = porConcepto(mes);
  if (ant) {
    const antes = porConcepto(ant);
    for (const [k, v] of hoy) {
      const e = etiqueta(base, k);
      if (!antes.has(k)) out.push({ tipo: 'nuevo', texto: `Cargo nuevo: ${e}`, importe: v });
      else {
        const a = antes.get(k)!;
        const d = a ? (v - a) / Math.abs(a) : 0;
        if (Math.abs(d) >= 0.1 && Math.abs(v - a) >= 5000000) out.push({ tipo: d > 0 ? 'aumento' : 'baja', texto: `${e}: ${d > 0 ? 'sube' : 'baja'} ${Math.round(d * 1000) / 10}% respecto del mes anterior`, importe: v - a });
        if (v === a && ctx.gastos(mes).some((g) => g.Concepto === k && (g.Es_Estimado === 'SI' || g.Es_Provisorio === 'SI'))) out.push({ tipo: 'repetido', texto: `${e}: mismo importe exacto que el mes anterior, estimado o provisorio`, importe: v });
      }
    }
    for (const [k, v] of antes) if (!hoy.has(k)) out.push({ tipo: 'falta', texto: `No figura este mes: ${etiqueta(base, k)}`, importe: -v });
    const P0 = ctx.periodo(ant)!;
    const P1 = ctx.periodo(mes)!;
    const c0 = c(P0.Cuota_Lote_Comun);
    const c1 = c(P1.Cuota_Lote_Comun);
    if (c0) out.push({ tipo: 'cuota', texto: `Cuota del lote común: ${Math.round(((c1 - c0) / c0) * 1000) / 10}% respecto del mes anterior`, importe: c1 - c0 });
  }
  for (const g of ctx.gastos(mes)) if (g.Es_Estimado === 'SI' || g.Es_Provisorio === 'SI') out.push({ tipo: 'estimado', texto: `${etiqueta(base, String(g.Concepto))}: importe ${g.Es_Estimado === 'SI' ? 'estimado' : 'provisorio'}`, importe: c(g.Importe) });
  const P = ctx.periodo(mes)!;
  const gasto = sum(ctx.gastos(mes).map((g) => c(g.Importe)));
  const dif = c(P.Repartido) - gasto;
  if (Math.abs(dif) >= 100000) out.push({ tipo: 'reparto', texto: dif > 0 ? 'Se repartió entre los lotes más de lo que se gastó' : 'Se repartió entre los lotes menos de lo que se gastó', importe: dif });
  for (const f of String(P.Controles_Fallidos ?? '').split('|').filter(Boolean)) out.push({ tipo: 'control', texto: `El documento no cierra: ${f}` });
  return out;
}

// ================================================================ todo junto

export function analizar(base: Base, barrio: string) {
  const ctx = contexto(base, barrio);
  const R = resumen(base, barrio, ctx);
  return {
    barrio,
    nombre: String(ctx.barrioFila?.Nombre ?? barrio),
    meses: ctx.meses,
    resumen: R,
    rubros: R.rubros.map((r) => detalleRubro(base, barrio, r.num, ctx)),
    flujo: flujo(base, barrio, ctx),
    acumulado: acumulado(base, barrio, ctx),
    respaldo: respaldo(base, barrio, ctx),
    ahorros: ahorros(base, barrio, ctx),
    matriz: matriz(base, barrio, ctx),
    pedido: pedido(base, barrio),
    cronologia: cronologia(base, barrio),
    novedades: ctx.meses.length ? novedades(base, barrio, ctx.meses.at(-1)!, ctx) : [],
  };
}
export type Analisis = ReturnType<typeof analizar>;
export type { Serie };

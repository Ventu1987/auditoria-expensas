// Expensa nueva para los propietarios: lo que liquidó la administración, explicado concepto por concepto,
// con la variación contra el mes anterior, lo que correspondería según la revisión y el flujo de caja en palabras simples.
import type { Base, Fila } from '../data/esquema';
import { c, contexto, correcciones, etiqueta, hay, importeCorrecto, mesesCorregidos, prorr, sum, type Cents } from './base';
import { nombreRubro } from './resumen';
import { matriz, TIPOS_RESPALDO } from './analisis';

/** Qué es cada gasto, en palabras simples. La hoja CONCEPTOS (columna Que_Es) puede reemplazarlo. */
export const QUE_ES: Record<string, string> = {
  'Servicio de seguridad / vigilancia': 'Servicio de vigilancia del barrio, a cargo de la empresa de seguridad.',
  'Obra de cámaras (obra civil)': 'Trabajo de obra civil para la instalación de las cámaras de seguridad.',
  'Equipamiento CCTV (PC, monitores, UPS)': 'Compra de equipos para el puesto de monitoreo de las cámaras.',
  'Bidones de agua garita': 'Agua para la garita de la guardia.',
  'Mantenimiento Fideicomiso - espacios propios 80%': 'La parte que le toca al barrio del mantenimiento que hace el Fideicomiso (personal y gastos) en los espacios del barrio.',
  'Mantenimiento Fideicomiso - espacios comunes 20%': 'La parte que le toca al barrio del mantenimiento de los espacios comunes de todo el predio.',
  'Caja chica Fideicomiso': 'La parte del barrio en gastos menores del Fideicomiso: combustible, ferretería, reparaciones.',
  'Control de plagas / desratización': 'Control de plagas y desratización del perímetro, los lotes en obra y la entrada.',
  'Reparación - control remoto (materiales + M.O.)': 'Reparación del control remoto del portón (materiales y mano de obra).',
  'Reparación portón vehicular': 'Reparación del portón de entrada de vehículos.',
  'Honorarios administración': 'Lo que cobra la administración por su trabajo.',
  'Gastos bancarios - Galicia': 'Mantenimiento de la cuenta, comisiones e impuestos del Banco Galicia.',
  'Gastos bancarios - Roela': 'Comisiones por cobrar las expensas (Pago Fácil, Rapipago, transferencias) e impuestos del Banco Roela.',
  'Sistema AdminProp': 'Sistema que usa la administración para liquidar y publicar las expensas.',
  'Electricidad - EDENOR': 'Luz de los espacios del barrio (cuenta de EDENOR del barrio).',
  'Electricidad sectores comunes - Fideicomiso': 'La parte del barrio en la luz de la iluminación de las calles troncales y las bombas de agua del predio.',
  Telered: 'Internet para las cámaras de seguridad.',
  'Seguro responsabilidad civil': 'Seguro que cubre al barrio si alguien sufre un daño dentro de él.',
  'Impuesto inmobiliario ARBA (plan de pagos)': 'Cuotas de un plan de pagos del impuesto inmobiliario.',
  'Impuesto inmobiliario ARBA (cuota anual del predio)': 'La parte del barrio en el impuesto inmobiliario del predio.',
};

export interface LineaExpensa {
  id: string;
  concepto: string;
  etiqueta: string;
  queEs: string;
  proveedor: string;
  anterior: Cents | null;
  actual: Cents;
  variacion: Cents | null;
  variacionPct: number | null;
  correcto: Cents | null;
  criterio: string;
  explicacion: string;
  explicacionAuto: boolean;
  respaldo: number;
  respaldoTexto: string;
  estimado: boolean;
  ahorrable: boolean;
  ahorro: Cents | null;
  notaAhorro: string;
  idsGasto: string[];
}

export interface RubroExpensa {
  num: number;
  nombre: string;
  lineas: LineaExpensa[];
  total: Cents;
  anterior: Cents | null;
  correcto: Cents | null;
}

const pct = (x: number) => `${(Math.round(Math.abs(x) * 1000) / 10).toString().replace('.', ',')}%`;
const pesos = (cts: number) => {
  const a = Math.abs(Math.round(cts));
  const s = `$ ${Math.floor(a / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(a % 100).padStart(2, '0')}`;
  return cts < 0 ? `−${s}` : s;
};

export function idLinea(barrio: string, mes: string, concepto: string) {
  return `${barrio}-${mes}-${concepto}`.slice(0, 120);
}

/** Explicación automática, en tono neutro. */
function explicar(l: Omit<LineaExpensa, 'explicacion' | 'explicacionAuto'>, aclaracion: string | undefined, detalleCorr: string): string {
  const partes: string[] = [];
  if (l.anterior === null) partes.push('Gasto nuevo este mes.');
  else if (l.variacion === 0) partes.push('Igual que el mes anterior.');
  else if (l.variacionPct !== null) partes.push(`${l.variacion! > 0 ? 'Sube' : 'Baja'} ${pct(l.variacionPct)} respecto del mes anterior (${l.variacion! > 0 ? '+' : ''}${pesos(l.variacion!)}).`);
  if (aclaracion) partes.push(aclaracion);
  if (l.estimado) partes.push('Es un importe estimado: todavía no está la factura.');
  if (l.correcto !== null && l.correcto !== l.actual) partes.push(`Según la revisión correspondían ${pesos(l.correcto)}${detalleCorr ? `: ${detalleCorr.replace(/\.$/, '')}` : ''}.`);
  return partes.join(' ');
}

export function expensaNueva(base: Base, barrio: string, mes: string) {
  const ctx = contexto(base, barrio);
  const i = ctx.meses.indexOf(mes);
  const ant = i > 0 ? ctx.meses[i - 1] : null;
  const P = ctx.periodo(mes)!;
  const Pa = ant ? ctx.periodo(ant)! : null;
  const corr = correcciones(ctx);
  const hayCorr = mesesCorregidos(ctx).has(mes);
  const gastos = ctx.gastos(mes);
  const gastosAnt = ant ? ctx.gastos(ant) : [];
  const notasMes = new Map((base.EXPENSA_NUEVA ?? []).filter((x) => x.Barrio === barrio && x.Mes === mes).map((x) => [String(x.Concepto), x]));
  const aclaraciones = new Map(
    base.NOTAS.filter((x) => (x.Barrio === barrio || x.Barrio === 'TODOS') && String(x.Ambito).startsWith(`NOVEDAD:${mes}:`)).map((x) => [String(x.Ambito).slice(`NOVEDAD:${mes}:`.length), String(x.Texto)]),
  );
  const queEs = (k: string) => String(base.CONCEPTOS.find((x) => x.Concepto === k)?.Que_Es || QUE_ES[k] || '');
  const nums = [...new Set(gastos.map((g) => Number(g.Rubro_Num)))].sort((a, b) => a - b);

  const rubros: RubroExpensa[] = nums.map((num) => {
    const gs = gastos.filter((g) => Number(g.Rubro_Num) === num);
    const conceptos = [...new Set(gs.map((g) => String(g.Concepto)))];
    const lineas = conceptos.map((k): LineaExpensa => {
      const de = gs.filter((g) => g.Concepto === k);
      const deAnt = gastosAnt.filter((g) => g.Concepto === k);
      const actual = sum(de.map((g) => c(g.Importe)));
      const anterior = deAnt.length ? sum(deAnt.map((g) => c(g.Importe))) : null;
      const correcto = hayCorr ? sum(de.map((g) => importeCorrecto(g, corr))) : null;
      const ks = de.map((g) => corr.get(String(g.ID_Gasto))).filter(Boolean) as Fila[];
      const resp = Math.max(...de.map((g) => Number(g.Respaldo_Tipo) || 5));
      const n = notasMes.get(k);
      const prov = String(de[0].Proveedor ?? '');
      const parcial = {
        id: idLinea(barrio, mes, k),
        concepto: k,
        etiqueta: etiqueta(base, k),
        queEs: queEs(k),
        proveedor: /persona f/i.test(prov) ? 'Proveedor (persona física)' : prov.replace(/\s*\(.*\)$/, ''),
        anterior,
        actual,
        variacion: anterior === null ? null : actual - anterior,
        variacionPct: anterior ? (actual - anterior) / Math.abs(anterior) : null,
        correcto,
        criterio: [...new Set(ks.map((x) => String(x.Criterio)).filter(Boolean))].join(', '),
        respaldo: resp,
        respaldoTexto: TIPOS_RESPALDO[resp]?.nombre.replace(/^\d · /, '') ?? '',
        estimado: de.some((g) => g.Es_Estimado === 'SI' || g.Es_Provisorio === 'SI'),
        ahorrable: n?.Ahorrable === 'SI',
        ahorro: n && hay(n.Ahorro_Estimado) ? c(n.Ahorro_Estimado) : null,
        notaAhorro: String(n?.Nota_Ahorro ?? ''),
        idsGasto: de.map((g) => String(g.ID_Gasto)),
      };
      const propia = String(n?.Explicacion ?? '').trim();
      return { ...parcial, explicacion: propia || explicar(parcial, aclaraciones.get(k), ks.map((x) => String(x.Detalle)).filter(Boolean)[0] ?? ''), explicacionAuto: !propia };
    });
    const anteriorR = gastosAnt.filter((g) => Number(g.Rubro_Num) === num);
    return {
      num,
      nombre: nombreRubro(num, gs),
      lineas,
      total: sum(lineas.map((l) => l.actual)),
      anterior: anteriorR.length ? sum(anteriorR.map((g) => c(g.Importe))) : null,
      correcto: hayCorr ? sum(lineas.map((l) => l.correcto ?? l.actual)) : null,
    };
  });

  const totalGastos = sum(rubros.map((r) => r.total));
  const totalAnterior = ant ? sum(gastosAnt.map((g) => c(g.Importe))) : null;
  const totalCorrecto = hayCorr ? sum(rubros.map((r) => r.correcto ?? r.total)) : null;
  const coef = ctx.coef(mes);
  const cuota = c(P.Cuota_Lote_Comun);
  const cuotaAnt = Pa ? c(Pa.Cuota_Lote_Comun) : null;
  const cuotaCorrecta = totalCorrecto === null ? null : prorr(totalCorrecto, coef.num, coef.den);
  const repartido = c(P.Repartido);
  const reducidaCoef = Number(ctx.barrioFila?.Coef_Lote_Reducido || 0);
  const reducida = hay(P.Cuota_Lote_Reducido) ? c(P.Cuota_Lote_Reducido) : reducidaCoef ? repartido - (Number(P.Unidades) - 1) * cuota : null;

  // la razón principal de la variación de la cuota: el concepto que más cambió en pesos
  const cambios = rubros.flatMap((r) => r.lineas).map((l) => ({ l, d: l.variacion ?? l.actual }));
  const signo = cuotaAnt === null ? 0 : Math.sign(cuota - cuotaAnt);
  const principal = cambios.filter((x) => Math.sign(x.d) === signo || signo === 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];

  // flujo de caja
  const F = base.FLUJO.filter((x) => x.Barrio === barrio && x.Mes === mes);
  const sumCat = (tipo: string, cats: string[]) => sum(F.filter((x) => x.Tipo === tipo && cats.includes(String(x.Categoria))).map((x) => c(x.Total)));
  const entradas = [
    { texto: 'Expensas pagadas al día (y adelantadas)', valor: sumCat('INGRESO', ['EN_TERMINO']) },
    { texto: 'Deudas de meses anteriores que se cobraron', valor: sumCat('INGRESO', ['ADEUDADAS']) },
    { texto: 'Intereses por pagar tarde', valor: sumCat('INGRESO', ['INTERESES']) },
    { texto: 'Pagos que llegaron sin saber de qué lote son', valor: sumCat('INGRESO', ['NO_IDENTIFICADOS']) },
    { texto: 'Otros ingresos', valor: sumCat('INGRESO', ['OTRO', '']) },
  ].filter((x) => x.valor !== 0);
  const salidas = [
    { texto: 'Pagos a proveedores', valor: sumCat('EGRESO', ['PAGO_GASTOS']) },
    { texto: 'Pagos sin un gasto liquidado que los respalde', valor: sumCat('EGRESO', ['SIN_DETALLE']) },
    { texto: 'Ajustes', valor: sumCat('EGRESO', ['AJUSTE']) },
    { texto: 'Cobros de otros meses que se identificaron y se pasaron a su lote (no es un pago)', valor: sumCat('EGRESO', ['RECLASIFICACION']) },
    { texto: 'Otros egresos', valor: sumCat('EGRESO', ['OTRO', '']) },
  ].filter((x) => x.valor !== 0);
  const saldoInicial = c(P.Saldo_Inicial);
  const saldoFinal = c(P.Saldo_Final);
  const entro = sum(entradas.map((x) => x.valor));
  const salio = sum(salidas.map((x) => x.valor));
  const pendientes = hay(P.Pendientes_Pago_Mes) ? Math.abs(c(P.Pendientes_Pago_Mes)) : null;
  const pagosAnteriores = hay(P.Pagos_Periodos_Anteriores) ? c(P.Pagos_Periodos_Anteriores) : null;
  const fondoExt = hay(P.Fondo_Ext_Final) ? c(P.Fondo_Ext_Final) : null;
  const fondoOrd = hay(P.Fondo_Ord_Final) ? c(P.Fondo_Ord_Final) : null;
  const libre = pendientes === null ? null : saldoFinal - pendientes - (fondoExt ?? 0);
  const deudaVecinos = hay(P.Deudas_A_Cobrar) ? c(P.Deudas_A_Cobrar) : null;
  const intereses = hay(P.Intereses_A_Cobrar) ? c(P.Intereses_A_Cobrar) : null;

  // temas ya planteados a la administración que siguen abiertos: los 10 más importantes según la matriz de riesgo
  const ESTADOS: Record<string, string> = {
    RECLAMADO: 'consultado, sin respuesta todavía',
    'RESPONDIDO PARCIALMENTE': 'respondido en parte',
    'RESPONDIDO SIN FUNDAMENTO': 'respondido sin documentación',
    'SIN RESPUESTA': 'sin respuesta',
  };
  const observaciones = matriz(base, barrio)
    .filas.filter((f) => ESTADOS[f.estado.toUpperCase()])
    .slice(0, 10)
    .map((f) => ({ codigo: f.codigo, titulo: f.titulo, estado: ESTADOS[f.estado.toUpperCase()] }));

  const lineas = rubros.flatMap((r) => r.lineas);
  const ahorro = sum(lineas.filter((l) => l.ahorrable).map((l) => l.ahorro ?? 0));
  const estado = (base.EXPENSA_ESTADO ?? []).find((x) => x.Barrio === barrio && x.Mes === mes);

  return {
    barrio,
    nombre: String(ctx.barrioFila?.Nombre ?? barrio),
    mes,
    anterior: ant,
    meses: ctx.meses,
    estado: String(estado?.Estado || 'BORRADOR'),
    mensaje: String(estado?.Mensaje ?? ''),
    fechaPublicacion: String(estado?.Fecha_Publicacion ?? ''),
    vencimiento: String(P.Fecha_Vencimiento ?? ''),
    recargo: Number(P.Recargo) || null,
    cuota,
    cuotaAnt,
    cuotaCorrecta,
    reducida,
    reducidaCoef: reducidaCoef || null,
    unidades: Number(P.Unidades) || null,
    particulares: c(P.Gastos_Particulares),
    lotesConParticulares: hay(P.Lotes_Con_Particulares) ? Number(P.Lotes_Con_Particulares) : null,
    repartido,
    coefPct: repartido ? cuota / repartido : null,
    principal: principal ? { etiqueta: principal.l.etiqueta, variacion: principal.d, nuevo: principal.l.anterior === null } : null,
    rubros,
    totalGastos,
    totalAnterior,
    totalCorrecto,
    peso: rubros.map((r) => ({ nombre: r.nombre, valor: r.total, pct: totalGastos ? r.total / totalGastos : 0 })),
    flujo: { saldoInicial, entradas, entro, salidas, salio, saldoFinal, control: saldoInicial + entro + salio - saldoFinal, pendientes, pagosAnteriores, fondoExt, fondoOrd, libre, deudaVecinos, intereses, lotesConDeuda: hay(P.Unidades_Con_Deuda) ? Number(P.Unidades_Con_Deuda) : null },
    ahorro: { mensual: ahorro, porLote: prorr(ahorro, coef.num, coef.den), lineas: lineas.filter((l) => l.ahorrable) },
    observaciones,
  };
}

export type ExpensaNueva = ReturnType<typeof expensaNueva>;

// Convierte lo leído del PDF en filas de la planilla, con correcciones y novedades sugeridas.
import type { Extraida, GastoExtraido } from '../parser/adminprop';
import { baseVacia, type Base, type Fila } from './esquema';
import { limpiarFila, pareceNombre } from './privacidad';
import { respaldoSugerido } from '../motor/analisis';

const p = (cts: number) => Math.round(cts) / 100;
const pctAFraccion = (t: string) => (t ? Number(t.replace('%', '').replace(',', '.')) / 100 : '');

export function categoriaFlujo(concepto: string, total: number): string {
  if (/en t[eé]rmino/i.test(concepto)) return 'EN_TERMINO';
  if (/adeudadas/i.test(concepto)) return 'ADEUDADAS';
  if (/intereses/i.test(concepto)) return 'INTERESES';
  if (/no identificados/i.test(concepto)) return 'NO_IDENTIFICADOS';
  if (/Cobros identificados/i.test(concepto)) return 'RECLASIFICACION';
  if (/^Egresos por gastos/i.test(concepto)) return 'PAGO_GASTOS';
  if (/AJUSTE|DIFERENCIA SALDO/i.test(concepto)) return 'AJUSTE';
  if (/^Ingresos/i.test(concepto)) return 'OTRO';
  return total < 0 ? 'SIN_DETALLE' : 'OTRO';
}

export interface Preparada {
  barrio: string;
  mes: string;
  filas: Partial<Base>;
  resumen: string;
  avisos: string[];
}

/**
 * @param base datos actuales (para el mes anterior y las correcciones que se repiten)
 * @param privados nombres que nunca se publican
 */
export function prepararCarga(e: Extraida, barrio: string, base: Base, privados: string[] = []): Preparada {
  const mes = e.mes;
  const id = `${barrio}-${mes}`;
  const hoy = new Date().toISOString().slice(0, 10);
  const avisos = [...e.avisos];
  const B = baseVacia();

  // cuota del lote común: la del cupón si ese lote tiene el coeficiente más frecuente
  const coefs = e.prorrateo.lotes.map((l) => l.coefPct);
  const moda = coefs.sort((a, b) => coefs.filter((x) => x === b).length - coefs.filter((x) => x === a).length)[0];
  const comunes = e.prorrateo.lotes.filter((l) => l.coefPct === moda);
  const otros = e.prorrateo.lotes.filter((l) => l.coefPct !== moda);
  let cuota = e.cuotaCupon;
  if (!cuota || Math.abs(cuota - (comunes[0]?.cuota ?? 0)) > 100) {
    cuota = comunes[0]?.cuota ?? 0;
    avisos.push('La cuota del lote común se tomó del prorrateo (redondeada al peso). Revisala.');
  }
  const reducida = otros.length === 1 ? e.prorrateo.totales.repartido - comunes.length * cuota : '';
  const fallidos = e.controles.filter((x) => !x.ok).map((x) => `${x.control} (diferencia $ ${p(x.documento - x.calculado).toLocaleString('es-AR', { minimumFractionDigits: 2 })})`);

  B.PERIODOS.push({
    ID_Periodo: id, Barrio: barrio, Mes: mes, Fecha_Vencimiento: e.fechaVencimiento, Recargo: pctAFraccion(e.recargo), Fecha_Cierre: e.flujo.fechaCierre,
    Total_Gastos: p(e.totalGastos), Repartido: p(e.prorrateo.totales.repartido), Gastos_Particulares: p(e.prorrateo.totales.particulares), Total_Expensas: p(e.patrimonio.expensasACobrar),
    Total_Con_Deudas: p(e.prorrateo.totales.total), Cuota_Lote_Comun: p(cuota), Cuota_Lote_Reducido: reducida === '' ? '' : p(reducida), Unidades: e.prorrateo.unidades,
    Unidades_Con_Deuda: e.prorrateo.unidadesConDeuda, Lotes_Con_Particulares: e.prorrateo.lotesConParticulares, Saldo_Inicial: p(e.flujo.saldoAnterior.total), Ingresos: p(e.resumenBanco.ingresos),
    Egresos: p(e.resumenBanco.egresos), Saldo_Final: p(e.flujo.saldoCierre.total), Fondo_Ord_Inicial: p(e.flujo.saldoAnterior.ord), Fondo_Ord_Final: p(e.flujo.saldoCierre.ord),
    Fondo_Ext_Inicial: p(e.flujo.saldoAnterior.ext), Fondo_Ext_Final: p(e.flujo.saldoCierre.ext), Disponibilidades: p(e.patrimonio.disponibilidades), Expensas_A_Cobrar: p(e.patrimonio.expensasACobrar),
    Deudas_A_Cobrar: p(e.patrimonio.deudasACobrar), Intereses_A_Cobrar: p(e.patrimonio.interesesACobrar), Redondeo: p(e.patrimonio.redondeo), Pendientes_Pago_Mes: p(-e.patrimonio.devengadosPendientes),
    Saldos_Pendientes_Total: p(e.saldosPendientes.total), Saldos_Pendientes_Cantidad: e.saldosPendientes.cantidad, Pagos_Periodos_Anteriores: p(e.pagosAnterioresTotal), Patrimonio_Neto: p(e.patrimonio.patrimonioNeto),
    Controles_Fallidos: fallidos.join('|'), Fuente: 'PDF AdminProp', Estado: fallidos.length ? 'CON OBSERVACIONES' : 'CARGADA', Fecha_Carga: hoy,
  });

  const gastos = e.gastos.map((g: GastoExtraido, i) => {
    const fila: Fila = {
      ID_Gasto: `${id}-G${String(i + 1).padStart(3, '0')}`, Barrio: barrio, Mes: mes, Rubro_Num: g.rubroNum, Rubro: g.rubro, Item: g.item, Concepto: g.concepto, Texto_Original: g.texto,
      Proveedor: g.proveedor, CUIT_Proveedor: g.cuit, Importe: p(g.total), Otras_Columnas: p(g.otrasColumnas), Es_Estimado: g.estimado ? 'SI' : 'NO', Es_Provisorio: g.provisorio ? 'SI' : 'NO',
      Comprobante_Citado: g.comprobante, Periodo_Servicio: g.periodoServicio, Estado_Pago: g.pendiente ? 'PENDIENTE' : 'PAGADO EN PERÍODO', Respaldo_Tipo: '', Respaldo_Detalle: '', Pagina: g.pagina, Observacion: '',
    };
    fila.Respaldo_Tipo = respaldoSugerido(fila, []);
    fila.Respaldo_Detalle = fila.Respaldo_Tipo === 4 ? String(g.comprobante) : g.estimado ? 'Importe estimado' : '';
    return limpiarFila(fila, privados);
  });
  B.GASTOS.push(...gastos);

  let k = 0;
  const fid = () => `${id}-F${String(++k).padStart(2, '0')}`;
  B.FLUJO.push({ ID_Flujo: fid(), Barrio: barrio, Mes: mes, Tipo: 'SALDO_INICIAL', Categoria: '', Concepto: 'Saldo anterior', Ordinario: p(e.flujo.saldoAnterior.ord), Extraordinario: p(e.flujo.saldoAnterior.ext), Total: p(e.flujo.saldoAnterior.total), Observacion: '' });
  for (const l of e.flujo.lineas) {
    if (!l.total && !l.ord && !l.ext) continue;
    const cat = categoriaFlujo(l.concepto, l.total);
    if (pareceNombre(l.concepto)) {
      avisos.push(`Flujo: "${l.concepto.replace(/\S+/g, (w) => w[0] + '…')}" parece el nombre de una persona y se reemplazó por "Persona física". Corregilo si es una empresa.`);
      l.concepto = 'Persona física';
    }
    B.FLUJO.push(limpiarFila({ ID_Flujo: fid(), Barrio: barrio, Mes: mes, Tipo: l.total < 0 || /^Egresos/i.test(l.concepto) ? 'EGRESO' : 'INGRESO', Categoria: cat, Concepto: l.concepto, Ordinario: p(l.ord), Extraordinario: p(l.ext), Total: p(l.total), Observacion: '' }, privados));
  }
  B.FLUJO.push({ ID_Flujo: fid(), Barrio: barrio, Mes: mes, Tipo: 'SALDO_FINAL', Categoria: '', Concepto: 'Saldo al cierre', Ordinario: p(e.flujo.saldoCierre.ord), Extraordinario: p(e.flujo.saldoCierre.ext), Total: p(e.flujo.saldoCierre.total), Observacion: '' });

  e.pagosAnteriores.forEach((x, i) => B.PAGOS_ANTERIORES.push(limpiarFila({ ID_Pago: `${id}-PA${String(i + 1).padStart(2, '0')}`, Barrio: barrio, Mes: mes, Periodo_Origen: x.periodoOrigen, Texto: x.texto, Importe: p(x.importe) }, privados)));
  e.patrimonio.pendientes.forEach((x, i) => B.PENDIENTES.push(limpiarFila({ ID_Pendiente: `${id}-PE${String(i + 1).padStart(2, '0')}`, Barrio: barrio, Mes: mes, Texto: x.texto, Importe: p(-x.importe) }, privados)));
  e.cobrosNoIdentificados.forEach((x, i) => B.NO_IDENTIFICADOS.push({ ID_Cobro: `${id}-NI${String(i + 1).padStart(2, '0')}`, Barrio: barrio, Mes: mes, Mes_Origen: x.mes, Importe: p(x.importe) }));
  e.prorrateo.lotes.forEach((l) => B.COEFICIENTES.push({ ID_Coef: `${id}-L${String(l.lote).padStart(2, '0')}`, Barrio: barrio, Mes: mes, Lote: String(l.lote), Coef_Pct: l.coefPct, Cuota: p(l.cuota) }));

  // correcciones sugeridas: se repite el criterio del mes anterior para el mismo concepto
  const previas = base.CORRECCIONES.filter((x) => x.Barrio === barrio && x.Estado === 'APLICADA' && String(x.Mes) < mes).sort((a, b) => String(b.Mes).localeCompare(String(a.Mes)));
  for (const g of B.GASTOS) {
    const imp = Number(g.Importe);
    if (/Obra de c[aá]maras|Equipamiento CCTV/.test(String(g.Concepto)) && imp) {
      B.CORRECCIONES.push({ ID_Correccion: `K-${g.ID_Gasto}`, Barrio: barrio, Mes: mes, ID_Gasto: g.ID_Gasto, Concepto: g.Concepto, Importe_Liquidado: imp, Importe_Correcto: 0, Criterio: 'H30', Detalle: 'Obra o compra de equipos: se paga con el fondo extraordinario.', Es_Estimado: 'NO', Estado: 'SUGERIDA', Origen: 'regla' });
      continue;
    }
    const ant = previas.find((x) => x.Concepto === g.Concepto);
    if (!ant || imp <= 0) continue;
    const liqAnt = Number(ant.Importe_Liquidado);
    const corAnt = Number(ant.Importe_Correcto);
    const fijo = /abono informado/i.test(String(ant.Detalle));
    const correcto = fijo ? corAnt : liqAnt ? Math.round(imp * (corAnt / liqAnt) * 100) / 100 : imp;
    if (Math.abs(correcto - imp) < 0.01) continue;
    B.CORRECCIONES.push({
      ID_Correccion: `K-${g.ID_Gasto}`, Barrio: barrio, Mes: mes, ID_Gasto: g.ID_Gasto, Concepto: g.Concepto, Importe_Liquidado: imp, Importe_Correcto: correcto, Criterio: ant.Criterio,
      Detalle: fijo ? `Mismo importe que ${String(ant.Mes)}: ${String(ant.Detalle)}` : `Mismo porcentaje de corrección que ${String(ant.Mes)} (${Math.round((corAnt / liqAnt) * 10000) / 100}%). Revisar con el comprobante.`,
      Es_Estimado: 'SI', Estado: 'SUGERIDA', Origen: 'regla',
    });
  }

  // evento de la liquidación
  B.EVENTOS.push({
    ID_Evento: `${id}-AUTO-VTO`, Barrio: barrio, Fecha: e.fechaVencimiento || `${mes}-28`, Tipo: 'Liquidación',
    Hecho: `Vence la expensa de ${mes.slice(5)}/${mes.slice(0, 4)}: gastos $ ${p(e.totalGastos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}, cuota del lote común $ ${p(cuota).toLocaleString('es-AR', { minimumFractionDigits: 2 })}.${fallidos.length ? ' El documento no cierra en: ' + fallidos.join('; ') + '.' : ''}`,
    Importe: p(e.totalGastos), Ref: '', Origen: 'auto',
  });

  const resumen = `${e.gastos.length} gastos por $ ${p(e.totalGastos).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${e.prorrateo.unidades} lotes · ${fallidos.length} control(es) que no cierran`;
  return { barrio, mes, filas: B, resumen, avisos };
}

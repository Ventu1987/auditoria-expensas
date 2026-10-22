// Cada pestaña se arma como una lista de tablas. La pantalla y la descarga a Excel usan las mismas tablas.
import type { Analisis } from '../motor/analisis';
import { consolidado, TIPOS_RESPALDO } from '../motor/analisis';
import { mesCorto } from '../motor/base';

export type Formato = 'money' | 'pct' | 'pct4' | 'num' | 'num4' | 'text';
export type Estilo = 'seccion' | 'total' | 'mas' | 'rev' | 'ok' | 'gris' | 'negrita';
export type Celda = number | string | null;

export interface FilaT {
  texto: string;
  valores: Celda[];
  formato?: Formato;
  estilo?: Estilo;
  celdas?: (Estilo | undefined)[];
  variacion?: boolean;
  nota?: string;
}
export interface TablaT {
  id: string;
  titulo: string;
  bajada?: string;
  columnas: string[];
  formatos?: Formato[];
  /** agrega columnas de variación mes a mes */
  conVariacion?: boolean;
  filas: FilaT[];
  notas?: { num: number; texto: string }[];
  /** ancho sugerido de la primera columna (caracteres) */
  ancho?: number;
}
export interface Pestana {
  id: string;
  titulo: string;
  corto: string;
  tablas: TablaT[];
}

const sec = (texto: string): FilaT => ({ texto, valores: [], estilo: 'seccion' });
const V = (A: Analisis) => A.meses.map(mesCorto);

// ---------------------------------------------------------------- resumen

export function pestanaResumen(A: Analisis): Pestana {
  const R = A.resumen;
  const cols = V(A);
  const t1: TablaT = {
    id: 'resumen',
    titulo: `${A.nombre} · de los gastos a la expensa, mes a mes`,
    bajada: 'Cada rubro sale de su pestaña. Al final, la expensa correcta de los meses con liquidación correcta cargada.',
    columnas: cols,
    conVariacion: true,
    ancho: 60,
    filas: [
      sec('Gastos del mes por rubro (lo que liquidó la administración)'),
      ...R.rubros.map((r) => ({ texto: r.nombre, valores: r.serie, formato: 'money' as const, variacion: true })),
      { texto: 'Total de gastos del mes (suma de los rubros)', valores: R.gasto, formato: 'money', estilo: 'total', variacion: true },
      { texto: 'Total de gastos informado en la liquidación', valores: R.gastoInformado, formato: 'money' },
      { texto: 'Control: suma de rubros menos lo informado', valores: R.controlGasto, formato: 'money', estilo: 'ok', celdas: R.controlGasto.map((v) => (v ? 'mas' : undefined)) },
      sec('De los gastos a la cuota'),
      { texto: 'Total repartido entre los lotes (informado)', valores: R.repartido, formato: 'money', variacion: true },
      { texto: 'Repartido menos gastado', valores: R.repartidoMenosGasto, formato: 'money', celdas: R.repartidoMenosGasto.map((v) => (v !== null && Math.abs(v) >= 100000 ? 'mas' : undefined)) },
      { texto: 'Cuota del lote común (informada)', valores: R.cuota, formato: 'money', estilo: 'negrita', variacion: true },
      { texto: 'Coeficiente del lote común (cuota ÷ repartido)', valores: R.coefPct, formato: 'pct4' },
      ...(R.reducida.some((v) => v !== null)
        ? [
            { texto: 'Cuota del lote de coeficiente reducido (implícita)', valores: R.reducida, formato: 'money' as const, variacion: true },
            { texto: 'Lote reducido ÷ lote común', valores: R.relReducida, formato: 'num4' as const },
          ]
        : []),
      { texto: 'Cuota si se repartiera el gasto real (gasto × coeficiente)', valores: R.cuotaGastoReal, formato: 'money' },
      { texto: 'Cargos particulares (solo algunos lotes)', valores: R.particulares, formato: 'money', estilo: 'rev', variacion: true },
      { texto: 'Total de expensas emitidas (repartido + particulares)', valores: R.totalCalculado, formato: 'money', estilo: 'negrita' },
      { texto: 'Total de expensas informado', valores: R.totalInformado, formato: 'money' },
      { texto: 'Control: calculado menos informado', valores: R.controlTotal, formato: 'money', estilo: 'ok', celdas: R.controlTotal.map((v) => (v ? 'rev' : undefined)) },
      { texto: 'Lo que cobra el administrador por mes (expensa ordinaria)', valores: R.cobradoOrdinario, formato: 'money', estilo: 'total', variacion: true },
      sec('Expensa correcta (con el comprobante de cada gasto)'),
      { texto: 'Gasto correcto del mes', valores: R.gastoCorrecto, formato: 'money', estilo: 'negrita' },
      { texto: 'Cuota correcta del lote común', valores: R.cuotaCorrecta, formato: 'money', estilo: 'ok' },
      { texto: 'Se cobró de más por lote común', valores: R.deMasLote, formato: 'money', estilo: 'mas' },
      { texto: 'En %', valores: R.deMasPct, formato: 'pct' },
      { texto: 'Se cobró de más a todo el barrio (repartido − gasto correcto)', valores: R.deMasBarrio, formato: 'money', estilo: 'mas' },
    ],
    notas: R.notas,
  };
  const t2: TablaT = {
    id: 'peso',
    titulo: 'De cada $ 100 de gasto',
    columnas: cols,
    ancho: 60,
    filas: R.peso.map((p) => ({ texto: p.nombre, valores: p.serie, formato: 'pct' })),
  };
  return { id: 'resumen', titulo: 'Resumen', corto: 'Resumen', tablas: [t1, t2] };
}

// ---------------------------------------------------------------- rubros

export function pestanaRubro(A: Analisis, k: number): Pestana {
  const D = A.rubros[k];
  const cols = V(A);
  const hayCorr = D.corregido.some(Boolean);
  const marca = (f: (typeof D.conceptos)[number]) => f.serie.map((_, i) => (f.estimado[i] || f.provisorio[i] ? ('rev' as const) : undefined));
  const filas: FilaT[] = [
    sec('Lo que liquidó la administración'),
    ...D.conceptos.map((f) => ({
      texto: f.etiqueta + (f.cantidad.some((n) => n > 1) ? ' (más de un ítem en el mes)' : ''),
      valores: f.serie,
      formato: 'money' as const,
      variacion: true,
      celdas: marca(f),
    })),
    { texto: 'Total del rubro', valores: D.subtotal, formato: 'money', estilo: 'total', variacion: true },
    { texto: '% del gasto total del mes', valores: D.pct, formato: 'pct' },
    { texto: 'Lo que pagó cada lote común por este rubro', valores: D.porLote, formato: 'money' },
  ];
  if (hayCorr) {
    filas.push(sec('Liquidación correcta (con el comprobante de cada gasto)'));
    for (const f of D.conceptos)
      filas.push({ texto: f.etiqueta, valores: f.correcto, formato: 'money', celdas: f.correcto.map((v, i) => (v !== null && f.serie[i] !== null && v !== f.serie[i] ? 'ok' : undefined)), nota: [...new Set(f.criterios.flat())].join(', ') });
    filas.push({ texto: 'Total correcto del rubro', valores: D.subtotalCorrecto, formato: 'money', estilo: 'total' });
    filas.push({ texto: 'Diferencia: liquidado menos correcto', valores: D.diferencia, formato: 'money', estilo: 'mas' });
    filas.push({ texto: 'Diferencia por lote común', valores: D.diferenciaLote, formato: 'money' });
  }
  const tablas: TablaT[] = [
    { id: `rubro${D.num}`, titulo: `Rubro ${D.num} · ${D.nombre}`, bajada: `${A.nombre}. Amarillo: importe estimado o provisorio. Verde: importe corregido.`, columnas: cols, conVariacion: true, ancho: 58, filas, notas: D.notas },
  ];
  if (D.comprobantes.length)
    tablas.push({
      id: `comp${D.num}`,
      titulo: 'Comprobantes cargados contra lo liquidado',
      columnas: ['Mes', 'Liquidado', 'Comprobante', 'Fiscal', 'Importe del comprobante', 'Diferencia', 'Observación'],
      formatos: ['text', 'money', 'text', 'text', 'money', 'money', 'text'],
      ancho: 34,
      filas: D.comprobantes.map((x) => ({
        texto: x.concepto,
        valores: [mesCorto(x.mes), x.liquidado, [x.tipo, x.numero, x.emisor].filter(Boolean).join(' · '), x.esFiscal, x.importe, x.diferencia, x.observacion],
        celdas: [undefined, undefined, undefined, x.esFiscal === 'NO' ? 'mas' : undefined, undefined, x.diferencia ? 'rev' : undefined, undefined],
      })),
    });
  const corto = D.nombre.replace(/^gastos( de)?\s+/i, '').split(/\s+/)[0];
  return { id: `rubro${D.num}`, titulo: `${D.num} · ${corto.charAt(0).toUpperCase()}${corto.slice(1)}`, corto: D.nombre, tablas };
}

// ---------------------------------------------------------------- flujo

export function pestanaFlujo(A: Analisis): Pestana {
  const F = A.flujo;
  const cols = V(A);
  const filas: FilaT[] = [
    sec('Movimientos de la cuenta según la liquidación'),
    { texto: 'Saldo al empezar el mes', valores: F.saldoInicial, formato: 'money', estilo: 'negrita' },
    ...F.cobros.map((x) => ({ texto: x.texto, valores: x.serie, formato: 'money' as const, variacion: true, estilo: x.clave === 'NO_IDENTIFICADOS' ? ('rev' as const) : undefined })),
    { texto: 'Total cobrado', valores: F.totalCobrado, formato: 'money', estilo: 'total' },
    ...F.pagos.map((x) => ({ texto: x.texto, valores: x.serie, formato: 'money' as const, estilo: x.clave === 'SIN_DETALLE' || x.clave === 'AJUSTE' ? ('mas' as const) : x.clave === 'RECLASIFICACION' ? ('gris' as const) : undefined })),
    { texto: 'Total salido', valores: F.totalSalido, formato: 'money', estilo: 'total' },
    { texto: 'Saldo al cierre (calculado)', valores: F.saldoCalculado, formato: 'money', estilo: 'negrita' },
    { texto: 'Saldo al cierre informado', valores: F.saldoInformado, formato: 'money' },
    { texto: 'Control', valores: F.control, formato: 'money', estilo: 'ok', celdas: F.control.map((v) => (v ? 'mas' : undefined)) },
    { texto: 'Pagado sin gasto liquidado ÷ gasto del mes', valores: F.sinDetalleTotal.map((v, i) => (v && F.gasto[i] ? -v / F.gasto[i] : null)), formato: 'pct' },
    sec('Lo gastado contra lo pagado'),
    { texto: 'Gastos liquidados del mes', valores: F.gasto, formato: 'money' },
    { texto: 'Pagado en el mismo mes', valores: F.pagadoMes, formato: 'money' },
    { texto: '% pagado en el mes', valores: F.pctPagado, formato: 'pct' },
    { texto: 'Gastos del mes que quedan sin pagar (informado)', valores: F.pendMes, formato: 'money' },
    { texto: 'Total de saldos pendientes de pago (informado)', valores: F.pendTotal, formato: 'money' },
    { texto: 'Total pendiente menos lo pendiente solo del mes (no puede ser negativo)', valores: F.pendDif, formato: 'money', celdas: F.pendDif.map((v) => (v !== null && v < 0 ? 'mas' : undefined)) },
    { texto: 'Pagos de gastos de meses anteriores (informado)', valores: F.pagosAnteriores, formato: 'money', estilo: 'gris' },
    sec('Deuda de los propietarios'),
    { texto: 'Expensas adeudadas a cobrar', valores: F.deudas, formato: 'money', variacion: true },
    { texto: 'Intereses a cobrar', valores: F.intereses, formato: 'money' },
    { texto: 'Lotes con deuda', valores: F.lotesConDeuda, formato: 'num' },
    { texto: 'Cobros sin identificar que figuran en la liquidación', valores: F.noIdentificados, formato: 'money', estilo: 'rev' },
    { texto: 'Repartido de más acumulado (repartido − gastado, desde el primer mes)', valores: F.repartidoDeMasAcum, formato: 'money', celdas: F.repartidoDeMasAcum.map((v) => (v > 100000 ? 'mas' : undefined)) },
    sec('Fondos y patrimonio (informado)'),
    { texto: 'Fondo ordinario al cierre', valores: F.fondoOrd, formato: 'money', celdas: F.fondoOrd.map((v) => (v !== null && v < 0 ? 'mas' : undefined)) },
    { texto: 'Fondo extraordinario al cierre', valores: F.fondoExt, formato: 'money' },
    { texto: 'Patrimonio neto informado', valores: F.patrimonio, formato: 'money' },
    { texto: 'El documento no cierra en', valores: F.controlesFallidos.map((x) => x.split('|').filter(Boolean).join(' · ') || null), formato: 'text', estilo: 'rev' },
  ];
  if (F.saldosBanco.length) {
    filas.push(sec('Saldo de la liquidación contra el saldo del banco al cierre'));
    filas.push({ texto: 'Saldo según la liquidación', valores: F.saldoInformado, formato: 'money' });
    for (const b of F.saldosBanco) filas.push({ texto: `Banco ${b.banco} (último saldo del extracto)`, valores: b.serie.map((x) => (x ? x.saldo : 'N/D')), formato: 'money' });
    filas.push({ texto: 'Total en los bancos', valores: F.totalBancos.map((v) => v ?? 'N/D'), formato: 'money', estilo: 'negrita' });
    filas.push({ texto: 'Banco menos liquidación (a explicar)', valores: F.difBanco, formato: 'money', estilo: 'rev' });
  }
  const tablas: TablaT[] = [{ id: 'flujo', titulo: 'Flujo de fondos · la plata, no lo liquidado', bajada: `${A.nombre}. Lo que entró y salió de la cuenta según cada liquidación, contra los extractos cargados.`, columnas: cols, conVariacion: true, ancho: 62, filas, notas: F.notas }];
  if (F.sinDetalle.length)
    tablas.push({
      id: 'sindetalle',
      titulo: 'Pagos y ajustes sin un gasto liquidado (los informa la propia liquidación)',
      columnas: ['Mes', 'Tipo', 'Importe', 'Observación'],
      formatos: ['text', 'text', 'money', 'text'],
      ancho: 44,
      filas: F.sinDetalle.map((x) => ({ texto: x.concepto, valores: [mesCorto(x.mes), x.categoria === 'AJUSTE' ? 'Ajuste' : 'Pago sin gasto', x.importe, x.observacion], celdas: [undefined, undefined, 'mas', undefined] })),
    });
  return { id: 'flujo', titulo: 'Flujo de fondos', corto: 'Flujo', tablas };
}

// ---------------------------------------------------------------- acumulado

export function pestanaAcumulado(A: Analisis): Pestana {
  const X = A.acumulado;
  const cols = V(A);
  const filas: FilaT[] = [
    sec('Gasto y cuota: liquidado contra correcto'),
    { texto: 'Gasto liquidado', valores: X.gastoLiquidado, formato: 'money' },
    { texto: 'Gasto correcto (igual al liquidado en los meses sin liquidación correcta)', valores: X.gastoCorrecto, formato: 'money', estilo: 'negrita', celdas: X.corregido.map((v) => (v ? undefined : 'gris')) },
    { texto: 'Cuota liquidada del lote común', valores: X.cuotaLiquidada, formato: 'money' },
    { texto: 'Cuota correcta del lote común', valores: X.cuotaCorrecta, formato: 'money', estilo: 'ok' },
    { texto: 'Pagado de más por el lote común', valores: X.deMasLote, formato: 'money', estilo: 'mas' },
    { texto: 'Acumulado del lote común', valores: X.acumLote, formato: 'money', estilo: 'negrita' },
    { texto: 'En % de la cuota liquidada', valores: X.pct, formato: 'pct' },
    ...(X.deMasReducido ? [{ texto: `Pagado de más por el lote reducido (${Math.round((X.coefReducido ?? 0) * 100)}%)`, valores: X.deMasReducido, formato: 'money' as const }] : []),
    { texto: 'Pagado de más por todo el barrio (repartido − gasto correcto)', valores: X.deMasBarrio, formato: 'money', estilo: 'mas' },
    { texto: 'Acumulado del barrio', valores: X.acumBarrio, formato: 'money', estilo: 'negrita' },
    sec('De dónde sale la diferencia (todo el barrio)'),
    ...X.porRubro.map((r) => ({ texto: r.nombre, valores: r.serie, formato: 'money' as const })),
    { texto: 'Repartido menos gastado (previsión y redondeo)', valores: X.repartidoMenosGasto, formato: 'money' },
  ];
  const P = X.proyeccion;
  const t: TablaT[] = [{ id: 'acumulado', titulo: 'Lo pagado de más, acumulado y proyectado', bajada: `${A.nombre}. Por lote común, por lote reducido y para todo el barrio.`, columnas: cols, ancho: 64, filas, notas: X.notas }];
  if (P)
    t.push({
      id: 'proyeccion',
      titulo: `Proyección a 12 meses si los desvíos de ${mesCorto(P.mes)} se repiten`,
      columnas: ['Importe'],
      formatos: ['money'],
      ancho: 64,
      filas: [
        { texto: 'Cuota liquidada × 12', valores: [P.cuotaLiquidada12] },
        { texto: 'Cuota correcta × 12', valores: [P.cuotaCorrecta12] },
        { texto: 'Pagado de más en un año por el lote común (todo el mes)', valores: [P.deMas12], estilo: 'mas' },
        { texto: 'Gastos que no se repiten (obras y equipos), que se excluyen', valores: [P.unaVez], estilo: 'gris' },
        { texto: 'Pagado de más en un año por el lote común (solo lo que se repite)', valores: [P.recurrenteLote12], estilo: 'mas' },
        { texto: 'Lo mismo, para todo el barrio', valores: [P.recurrenteBarrio12], estilo: 'negrita' },
        { texto: 'Ya pagado de más + 12 meses más, lote común', valores: [P.totalLote], estilo: 'total' },
      ],
    });
  return { id: 'acumulado', titulo: 'Acumulado y proyección', corto: 'Acumulado', tablas: t };
}

// ---------------------------------------------------------------- respaldo

export function pestanaRespaldo(A: Analisis): Pestana {
  const R = A.respaldo;
  const cols = V(A);
  const est: Record<number, Estilo> = { 1: 'ok', 2: 'rev', 3: 'mas', 4: 'rev', 5: 'mas' };
  const t1: TablaT = {
    id: 'respaldo-resumen',
    titulo: 'Qué respaldo tiene el gasto de cada mes',
    bajada: `${A.nombre}. Según los comprobantes cargados.`,
    columnas: cols,
    ancho: 40,
    filas: [
      ...R.resumenTipos.map((x) => ({ texto: x.nombre, valores: x.serie, formato: 'money' as const, celdas: x.serie.map(() => est[x.tipo]) })),
      { texto: 'Total', valores: R.total, formato: 'money', estilo: 'total' },
      { texto: 'Sin respaldo válido (tipos 3, 4 y 5)', valores: R.sinValido, formato: 'money', estilo: 'mas' },
      { texto: 'En % del gasto', valores: R.pctSinValido, formato: 'pct', estilo: 'negrita' },
    ],
    notas: [...Object.entries(TIPOS_RESPALDO).map(([k, v]) => ({ num: Number(k) + 100, texto: `${v.nombre}: ${v.texto}` })), ...R.notas].map((n, i) => ({ num: i + 1, texto: n.texto })),
  };
  const t2: TablaT = {
    id: 'respaldo-detalle',
    titulo: 'Gasto por gasto',
    columnas: ['Mes', 'Importe', 'Respaldo', 'Comprobantes', 'Detalle'],
    formatos: ['text', 'money', 'text', 'num', 'text'],
    ancho: 40,
    filas: [...R.filas].reverse().map((f) => ({ texto: f.concepto, valores: [mesCorto(f.mes), f.importe, TIPOS_RESPALDO[f.tipo]?.nombre ?? '', f.comprobantes, f.detalle], celdas: [undefined, undefined, est[f.tipo], undefined, undefined] })),
  };
  return { id: 'respaldo', titulo: 'Respaldo documental', corto: 'Respaldo', tablas: [t1, t2] };
}

// ---------------------------------------------------------------- matriz

export function pestanaMatriz(A: Analisis): Pestana {
  const M = A.matriz;
  const est: Record<string, Estilo> = { '1 · Urgente': 'mas', '2 · Alta': 'rev', '3 · Media': 'gris', '5 · Resuelto': 'ok' };
  return {
    id: 'matriz',
    titulo: 'Matriz de riesgo',
    corto: 'Matriz',
    tablas: [
      {
        id: 'matriz-resumen',
        titulo: 'Cuántas observaciones hay en cada prioridad',
        columnas: ['Cantidad', 'Monto anual equivalente'],
        formatos: ['num', 'money'],
        ancho: 20,
        filas: M.porPrioridad.map((p) => ({ texto: p.prioridad, valores: [p.cantidad, p.anual], celdas: [est[p.prioridad], undefined] })),
      },
      {
        id: 'matriz-tabla',
        titulo: 'Todas las observaciones, de la más urgente a la menos',
        columnas: ['Problema', 'Monto en juego', 'Cómo se mide', 'Equivalente anual', 'Por lote común (año)', 'Gravedad', 'Probabilidad', 'Por qué', 'Impacto', 'Puntaje', 'Prioridad', 'Estado del reclamo', 'Qué pedir', 'Dónde verlo'],
        formatos: ['text', 'money', 'text', 'money', 'money', 'text', 'text', 'text', 'text', 'num', 'text', 'text', 'text', 'text'],
        ancho: 8,
        filas: M.filas.map((f) => ({
          texto: f.codigo,
          valores: [f.titulo, f.monto ?? 'N/D', f.base, f.anual, f.porLote, f.gravedad, f.probabilidad, f.porQue, f.impacto, f.puntaje, f.prioridad, f.estado, f.quePedir, f.donde],
          celdas: [undefined, undefined, undefined, undefined, undefined, f.gravedad === 'CRÍTICO' ? 'mas' : undefined, undefined, undefined, undefined, undefined, est[f.prioridad], /PENDIENTE|SIN RESP|NUEVO/.test(f.estado) ? 'mas' : undefined, undefined, undefined],
        })),
        notas: M.notas,
      },
    ],
  };
}

// ---------------------------------------------------------------- ahorros

export function pestanaAhorros(A: Analisis): Pestana {
  const X = A.ahorros;
  const grupo = (g: string, t: string): FilaT[] => {
    const fs = X.filas.filter((f) => f.grupo === g);
    if (!fs.length) return [];
    const s = g === 'A' ? X.A : g === 'B' ? X.B : X.C;
    return [
      sec(t),
      ...fs.map((f) => ({ texto: f.medida, valores: [f.hoy, f.propuesta, f.mensual ?? 'N/D', f.lote, f.anualLote, f.base, f.ref], celdas: [undefined, undefined, f.supuesto ? ('rev' as const) : undefined, undefined, undefined, undefined, undefined] })),
      { texto: `Subtotal${g === 'C' ? ' (una sola vez, no anual)' : ''}`, valores: ['', '', s.mensual, s.lote, s.anualLote, '', ''], estilo: 'total' as const },
    ];
  };
  return {
    id: 'ahorros',
    titulo: 'Ahorros posibles',
    corto: 'Ahorros',
    tablas: [
      {
        id: 'ahorros',
        titulo: 'Cuánto bajaría la expensa',
        bajada: `${A.nombre}. Con los importes del último mes con liquidación correcta. Amarillo: supuesto o propuesta a confirmar.`,
        columnas: ['Hoy', 'Propuesta', 'Ahorro por mes · barrio', 'Por lote común', 'Por año · lote común', 'Base del cálculo', 'Ref.'],
        formatos: ['text', 'text', 'money', 'money', 'money', 'text', 'text'],
        ancho: 46,
        filas: [
          ...grupo('A', 'A. Corregir lo que está mal liquidado'),
          ...grupo('B', 'B. Gestionar mejor'),
          ...grupo('C', 'C. Una sola vez'),
          { texto: 'Ahorro mensual recurrente (A + B)', valores: ['', '', X.recurrente.mensual, X.recurrente.lote, X.recurrente.anualLote, '', ''], estilo: 'ok' },
          { texto: `Cuota del lote común con todas las medidas (${mesCorto(X.mesCuota)})`, valores: ['', '', null, X.cuotaConMedidas, null, `Hoy ${(X.cuota / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, ''], estilo: 'negrita' },
          { texto: 'Baja de la cuota', valores: ['', '', null, X.baja === null ? null : `${(X.baja * 100).toFixed(1).replace('.', ',')}%`, null, '', ''] },
        ],
        notas: X.notas,
      },
    ],
  };
}

// ---------------------------------------------------------------- pedido, cronología, consolidado

export function pestanaPedido(A: Analisis): Pestana {
  return {
    id: 'pedido',
    titulo: 'Pedido de documentación',
    corto: 'Pedido',
    tablas: [
      {
        id: 'pedido',
        titulo: 'Qué hay que pedirle a la administración',
        bajada: 'Un pedido por punto, con el importe en juego y lo que muestran los documentos hasta hoy. Sirve de anexo para una carta.',
        columnas: ['Tema', 'Qué pedir', 'Importe en juego', 'Gravedad', 'Estado del reclamo', 'Lo que muestran los documentos', 'Dónde verlo'],
        formatos: ['text', 'text', 'money', 'text', 'text', 'text', 'text'],
        ancho: 8,
        filas: A.pedido.filas.map((f) => ({
          texto: f.codigo,
          valores: [f.tema, f.pedir, f.importe ?? 'N/D', f.gravedad, f.estado, f.muestran, f.donde],
          celdas: [undefined, undefined, undefined, f.gravedad === 'CRÍTICO' ? 'mas' : f.gravedad === 'IMPORTANTE' ? 'rev' : undefined, /PENDIENTE|SIN RESP|NUEVO/.test(f.estado) ? 'mas' : undefined, undefined, undefined],
        })),
        notas: A.pedido.notas,
      },
    ],
  };
}

export function pestanaCronologia(A: Analisis): Pestana {
  const dd = (f: string) => (f.length >= 10 ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f);
  return {
    id: 'cronologia',
    titulo: 'Cronología',
    corto: 'Cronología',
    tablas: [
      {
        id: 'cronologia',
        titulo: 'Qué pasó y cuándo',
        bajada: 'Liquidaciones, movimientos del banco, cartas y respuestas. Las filas "auto" las agrega la app al cargar cada liquidación.',
        columnas: ['Tipo', 'Hecho', 'Importe', 'Ref.'],
        formatos: ['text', 'text', 'money', 'text'],
        ancho: 12,
        filas: A.cronologia.map((e) => ({ texto: dd(e.fecha), valores: [e.tipo + (e.origen === 'auto' ? ' (auto)' : ''), e.hecho, e.importe, e.ref], celdas: [e.tipo === 'Banco' ? 'rev' : e.tipo === 'Respuesta' ? 'ok' : undefined, undefined, undefined, undefined] })),
      },
    ],
  };
}

export function pestanaConsolidado(base: Parameters<typeof consolidado>[0]): Pestana {
  const C = consolidado(base);
  const cols = C.cols.map((x) => `${mesCorto(x.mes).slice(0, 2)} · ${x.barrio}`);
  const filas: FilaT[] = [
    sec('Gastos por concepto'),
    ...C.filas.map((f) => ({
      texto: f.etiqueta,
      valores: f.serie,
      formato: 'money' as const,
      celdas: C.cols.map((x) => (f.iguales.includes(x.mes) ? ('mas' as const) : undefined)),
      nota: f.iguales.length ? 'mismo importe' : undefined,
    })),
    { texto: 'Total de gastos (suma)', valores: C.gastoSuma, formato: 'money', estilo: 'total' },
    { texto: 'Total de gastos informado', valores: C.gastoInformado, formato: 'money' },
    { texto: 'Total repartido entre los lotes', valores: C.repartido, formato: 'money' },
    { texto: 'Cantidad de lotes', valores: C.lotes, formato: 'num' },
    { texto: 'Gasto por lote', valores: C.gastoPorLote, formato: 'money', estilo: 'negrita' },
    { texto: 'Cuota del lote común (informada)', valores: C.cuota, formato: 'money' },
    { texto: 'Cargos particulares', valores: C.particulares, formato: 'money', estilo: 'rev' },
    { texto: 'Total de expensas emitidas', valores: C.totalExpensas, formato: 'money', estilo: 'negrita' },
    { texto: 'Lotes con deuda', valores: C.lotesConDeuda, formato: 'num' },
  ];
  return {
    id: 'consolidado',
    titulo: 'Consolidado barrios',
    corto: 'Barrios',
    tablas: [
      {
        id: 'consolidado',
        titulo: 'Lo que se le cobra a cada barrio por los mismos conceptos',
        bajada: `${C.barrios.map((b) => C.nombres[b]).join(' y ')}, meses en común.${C.sinDatos.length ? ` Sin liquidaciones cargadas: ${C.sinDatos.join(', ')}.` : ''} Rojo: mismo importe al centavo en dos barrios.`,
        columnas: cols,
        ancho: 40,
        filas,
      },
    ],
  };
}

export function todasLasPestanas(A: Analisis, base: Parameters<typeof consolidado>[0]): Pestana[] {
  return [
    pestanaResumen(A),
    pestanaMatriz(A),
    pestanaAcumulado(A),
    ...A.rubros.map((_, i) => pestanaRubro(A, i)),
    pestanaFlujo(A),
    pestanaRespaldo(A),
    pestanaConsolidado(base),
    pestanaAhorros(A),
    pestanaPedido(A),
    pestanaCronologia(A),
  ];
}

/** Variación mes a mes de una serie (para las columnas "Var."). */
export function variaciones(v: Celda[]): (number | null)[] {
  return v.slice(1).map((b, i) => {
    const a = v[i];
    return typeof a === 'number' && typeof b === 'number' && a !== 0 ? (b - a) / Math.abs(a) : null;
  });
}

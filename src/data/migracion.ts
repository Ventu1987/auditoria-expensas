// Pasa los datos de la planilla de auditoría anterior (API vieja) a la estructura nueva,
// y les suma lo trabajado a mano: liquidación correcta, respaldo de cada gasto, matriz de riesgo,
// cronología, notas y medidas de ahorro (scripts/semilla/semilla.json).

import { baseVacia, type Base, type Fila } from './esquema';
import { REGLAS_CONCEPTO } from '../parser/adminprop';
import { limpiarBase } from './privacidad';
import semilla from '../../scripts/semilla/semilla.json';

type Vieja = { sheets: Record<string, Fila[]> };
const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const n = (v: unknown) => (v === '' || v === undefined || v === null || v === 'N/D' ? '' : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;

export const EXTRA_BARRIOS: Record<string, { Unidades_Equivalentes: number; Coef_Lote_Reducido: number | '' }> = {
  S2: { Unidades_Equivalentes: 17.65, Coef_Lote_Reducido: 0.65 },
  LH: { Unidades_Equivalentes: 21, Coef_Lote_Reducido: '' },
  S1: { Unidades_Equivalentes: 21, Coef_Lote_Reducido: '' },
};

export const DONDE: Record<string, string> = {
  H01: 'Resumen, Flujo de fondos', H02: 'Rubro 4', H03: 'Rubro 4', H04: 'Rubro 3, Rubro 4', H05: 'Rubro 4', H06: 'Rubro 4', H07: 'Rubro 4', H08: 'Rubro 11',
  H09: 'Rubro 4', H10: 'Rubro 3', H11: 'Flujo de fondos', H12: 'Rubro 11', H13: 'Rubro 3', H14: 'Flujo de fondos', H15: 'Rubro 5', H16: '—', H18: 'Rubro 8, Flujo de fondos',
  H19: 'Rubro 7', H20: 'Flujo de fondos', H21: 'Flujo de fondos', H22: 'Rubro 4, Rubro 5', H23: 'Rubro 11', H24: 'Rubro 11', H25: 'Rubro 5', H26: 'Rubro 4', H27: 'Rubro 4',
  H28: 'Rubro 3', H29: 'Rubro 4', H30: 'Rubro 11', H31: 'Rubro 5',
};

const CAT_INGRESO: Record<string, string> = {
  'Expensas en término': 'EN_TERMINO', 'Expensas adeudadas': 'ADEUDADAS', 'Intereses por mora': 'INTERESES', 'Cobros no identificados': 'NO_IDENTIFICADOS',
};
const CAT_EGRESO: Record<string, string> = {
  'PAGO DE GASTOS LIQUIDADOS': 'PAGO_GASTOS', 'EGRESO SIN DETALLE DE COMPROBANTE': 'SIN_DETALLE', AJUSTE: 'AJUSTE', 'RECLASIFICACIÓN DE COBROS': 'RECLASIFICACION',
};

export const MEDIDAS_S2: Fila[] = [
  ['A', 'Telered al abono informado por la administración', '$ 567.600 sin factura', '$ 100.000 por mes', 'CORRECCION:Telered', '', 'Verificado', 'H26'],
  ['A', 'Seguridad al importe de su factura', 'Liquidado por encima de la factura', 'El importe de la factura', 'CORRECCION:Servicio de seguridad', '', 'Verificado', 'H23'],
  ['A', 'Mantenimiento del Fideicomiso sin los gastos que no corresponden', 'Base con gastos ajenos al barrio', 'Base corregida', 'CORRECCION:Mantenimiento Fideicomiso', '', 'Verificado', 'H04 a H06, H29'],
  ['A', 'Caja chica solo con comprobantes fiscales', 'Presupuestos y notas en la base', 'Solo tiques y facturas', 'CORRECCION:Caja chica', '', 'Verificado', 'H31'],
  ['A', 'Luz del Fideicomiso sin la cuenta industrial', 'Incluye la cuenta industrial', 'Solo iluminación troncal y bombas', 'CORRECCION:Electricidad sectores comunes', '', 'Verificado', 'H28'],
  ['B', 'Pagar la luz antes del 1.er vencimiento', 'Se paga al 2.º vencimiento', 'Débito automático o pago a término', '', 2165.08, 'Verificado', 'H10'],
  ['B', 'Una sola cuenta bancaria, a nombre del barrio', 'Dos cuentas: Galicia y Roela', 'Cerrar una (Galicia: mantenimiento + IVA)', '', 90750, 'Extracto 09/2026', 'H18'],
  ['B', 'Exención de Ingresos Brutos sobre las acreditaciones', 'Retención sobre los cobros', 'Pedir exención o no retención en ARBA', '', 42363.41, 'Supuesto: a verificar', ''],
  ['B', 'Cobro por transferencia en vez de Pago Fácil', 'Comisión Pago Fácil $ 231.684,23 (09/2026)', 'Si la mitad de los lotes pasa a transferencia', '', 115842.12, 'Supuesto: 50% de los pagos', ''],
  ['B', 'Sistema AdminProp dentro de los honorarios', 'Se cobra aparte', 'Que lo pague el administrador', 'CONCEPTO:Sistema AdminProp', '', 'Propuesta', ''],
  ['B', 'Honorarios por lote, como en La Huella', '$ 600.000 para 18 lotes', '$ 600.000 ÷ 21 × 18', '', 85714.29, 'Propuesta a negociar', ''],
  ['B', 'Un solo seguro para los tres barrios', 'Dos pólizas de casi el mismo importe', 'Cotizar una póliza conjunta', '', 'N/D', 'Sin cotización', ''],
  ['C', 'Obra de cámaras con el fondo extraordinario', 'Cobrada en la expensa ordinaria', 'Pagarla con el fondo extraordinario', 'CORRECCION:Obra de cámaras', '', 'Verificado (no se repite)', 'H30'],
  ['C', 'Devolver la previsión de morosidad de 09/2026', '$ 1.627.054,66 cobrados de más', 'Acreditar en la próxima expensa', '', 1627054.66, 'Verificado (no se repite)', 'H01'],
].map((r, i) => ({ ID_Medida: `S2-M${String(i + 1).padStart(2, '0')}`, Barrio: 'S2', Grupo: r[0], Medida: r[1], Hoy: r[2], Propuesta: r[3], Calculo: r[4], Ahorro_Mensual: r[5], Base: r[6], Ref: r[7] }) as Fila);

export const NOTAS_GENERALES: Fila[] = [
  ['RESPALDO', 1, '"Completo" no quiere decir que el gasto esté bien: una obra puede tener factura y no ser un gasto ordinario. Solo dice que hay un documento por ese importe.'],
  ['RESPALDO', 2, 'La mayor parte del gasto es "parcial" cuando se cobra como una parte de documentos de otros (seguridad compartida, mantenimiento del Fideicomiso), sin informar la base ni el criterio.'],
  ['RESPALDO', 3, 'El tipo de respaldo se calcula solo con los comprobantes cargados y se puede corregir a mano en cada gasto.'],
  ['AHORROS', 1, 'A: importes verificados en la liquidación correcta. B: mejoras de gestión; las marcadas como supuesto o propuesta hay que confirmarlas antes de usarlas como reclamo. Por lote común = ahorro del barrio × coeficiente del lote común.'],
  ['AHORROS', 2, 'La exención de Ingresos Brutos depende de la situación fiscal del consorcio: consultarlo con un contador antes de pedirla.'],
  ['MATRIZ', 1, 'Probabilidad: que el problema se repita o siga afectando en los próximos meses. Impacto: alto si la auditoría lo califica como crítico o si el monto anual equivalente supera $ 1.500.000; medio si es importante o supera $ 150.000; bajo en los demás casos.'],
  ['MATRIZ', 2, 'Puntaje = probabilidad (alta 3, media 2, baja 1) × impacto (alto 3, medio 2, bajo 1). Urgente: 9. Alta: 6. Media: 3 o 4. Baja: 1 o 2.'],
  ['MATRIZ', 3, 'Monto en juego: "por mes" se multiplica por 12; "una vez" es lo que hay que recuperar o aclarar; "saldo en riesgo" es plata o deuda mal documentada (no es una pérdida). Los montos se superponen: no se suman.'],
  ['PEDIDO', 1, 'El importe en juego no es lo que hay que devolver: es el monto del punto. Algunos se superponen. No se suman.'],
  ['PEDIDO', 2, 'Las observaciones son indicadores para revisar, no acusaciones. Cada pedido busca el documento que confirma o descarta el punto.'],
].map((r) => ({ ID_Nota: `TODOS-${r[0]}-${r[1]}`, Barrio: 'TODOS', Ambito: r[0], Num: r[1], Texto: r[2] }) as Fila);

const LH_EXTRA: Fila[] = [
  {
    ID_Hallazgo: 'LH-LH-10', Barrio: 'LH', Codigo: 'LH-10', Titulo: 'En 10/2026 se repartió más de lo que se gastó', Conclusion: 'Se repartieron $ 956.782,24 más que el gasto (9,5%), $ 45.561 por lote.',
    Gravedad: 'CRÍTICO', Monto: 956782.24, Base_Monto: 'una vez', Probabilidad: 'Alta', Por_Que_Probabilidad: 'Repite el esquema de 09/2026 (H01).', Donde_Verlo: 'Resumen',
    Que_Pedir: 'Composición de la base y devolución de la diferencia.', Estado_Reclamo: 'PENDIENTE DE RECLAMAR', Lo_Que_Muestran: '', Fecha_Alta: '2026-10-21', Fecha_Solucion: '', Publicable: 'SI',
  },
];

function respaldoPorDefecto(g: Fila): { tipo: number; doc: string } {
  if (s(g.Es_Estimado) === 'SI' || s(g.Es_Provisorio) === 'SI') return { tipo: 5, doc: 'Importe estimado o provisorio' };
  const c = s(g.Comprobante);
  if (c && c !== 'N/D') return { tipo: 4, doc: c };
  return { tipo: 5, doc: '—' };
}

export function migrar(vieja: Vieja, privados: string[] = []): Base {
  const V = vieja.sheets;
  const B = baseVacia();
  const sem = semilla as unknown as {
    correcciones: Fila[];
    respaldo: Record<string, { tipo: number; doc: string; obs: string }>;
    hallazgos: Record<string, Fila>;
    hallazgos_nuevos: Fila[];
    eventos: Fila[];
    notas: Fila[];
  };

  // BARRIOS
  for (const b of V.BARRIOS ?? []) {
    const id = s(b.ID_Barrio);
    const ex = EXTRA_BARRIOS[id];
    B.BARRIOS.push({
      ID_Barrio: id, Nombre: s(b.Nombre), Lotes: n(b.Lotes), Unidades_Equivalentes: ex?.Unidades_Equivalentes ?? n(b.Lotes), Coef_Lote_Reducido: ex?.Coef_Lote_Reducido ?? '',
      Superficie_m2: n(b.Superficie_m2), Coef_FBV_Propios: n(b.Coef_FBV_Propios), Coef_FBV_Comunes: n(b.Coef_FBV_Comunes), CUIT_Consorcio: s(b.CUIT_Fideicomiso),
      Administrador: id === 'PREDIO' ? '' : 'RyM Administración', CUIT_Administrador: s(b.CUIT_Administrador), Activo: id === 'PREDIO' ? 'NO' : 'SI',
    });
  }

  // PERIODOS
  const fondos = (id: string, fondo: string) => (V.FONDOS ?? []).find((f) => f.ID_Periodo === id && f.Fondo === fondo) ?? {};
  const saldo = (id: string, bloque: string, re: RegExp) => (V.SALDOS_PATRIMONIO ?? []).find((x) => x.ID_Periodo === id && x.Bloque === bloque && re.test(s(x.Concepto)));
  for (const p of V.PERIODOS ?? []) {
    const id = s(p.ID_Periodo);
    const bar = s(p.Barrio);
    const ex = EXTRA_BARRIOS[bar];
    const cuota = Number(p.Expensa_Ord_Lote_Tipo);
    const reducida = ex?.Coef_Lote_Reducido ? r2(Number(p.Base_Prorrateo_Ord) - (Number(p.Cantidad_Unidades) - 1) * cuota) : '';
    const ep = (re: RegExp) => n(saldo(id, 'ESTADO_PATRIMONIAL', re)?.Importe);
    B.PERIODOS.push({
      ID_Periodo: id, Barrio: bar, Mes: s(p.Mes), Fecha_Vencimiento: s(p.Fecha_Vencimiento), Recargo: s(p.Recargo_Vencimiento), Fecha_Cierre: s(p.Fecha_Cierre),
      Total_Gastos: n(p.Total_Gastos_Periodo), Repartido: n(p.Base_Prorrateo_Ord), Gastos_Particulares: n(p.Gastos_Particulares), Total_Expensas: n(p.Total_Expensas),
      Total_Con_Deudas: n(p.Total_Liquidado_Con_Deudas), Cuota_Lote_Comun: n(p.Expensa_Ord_Lote_Tipo), Cuota_Lote_Reducido: reducida, Unidades: n(p.Cantidad_Unidades),
      Unidades_Con_Deuda: n(p.Unidades_Con_Deuda), Lotes_Con_Particulares: '', Saldo_Inicial: n(p.Saldo_Inicial), Ingresos: n(p.Ingresos), Egresos: n(p.Egresos_Caja),
      Saldo_Final: n(p.Saldo_Final), Fondo_Ord_Inicial: n(fondos(id, 'ORDINARIO').Saldo_Inicial), Fondo_Ord_Final: n(fondos(id, 'ORDINARIO').Saldo_Final_Documento),
      Fondo_Ext_Inicial: n(fondos(id, 'EXTRAORDINARIO').Saldo_Inicial), Fondo_Ext_Final: n(fondos(id, 'EXTRAORDINARIO').Saldo_Final_Documento),
      Disponibilidades: ep(/disponibilidades/i), Expensas_A_Cobrar: ep(/Expensas y otros/i), Deudas_A_Cobrar: ep(/^Deudas a cobrar/i), Intereses_A_Cobrar: ep(/Intereses a cobrar/i),
      Redondeo: ep(/Redondeo/i), Pendientes_Pago_Mes: n(p.Gastos_Pendientes_Pago), Saldos_Pendientes_Total: n(saldo(id, 'SALDOS_PENDIENTES_TOTAL', /./)?.Importe),
      Saldos_Pendientes_Cantidad: '', Pagos_Periodos_Anteriores: n(p.Pagos_Periodos_Anteriores), Patrimonio_Neto: n(p.Patrimonio_Neto), Controles_Fallidos: '',
      Fuente: 'Migrado de la auditoría', Estado: s(p.Estado_Revision), Fecha_Carga: s(p.Fecha_Carga),
    });
  }

  // GASTOS
  const cuitProv = new Map((V.PROVEEDORES ?? []).map((p) => [s(p.ID_Proveedor), s(p.CUIT)]));
  for (const g of V.GASTOS ?? []) {
    const id = s(g.ID_Gasto);
    const r = sem.respaldo[id];
    const def = respaldoPorDefecto(g);
    B.GASTOS.push({
      ID_Gasto: id, Barrio: s(g.Barrio), Mes: s(g.Mes), Rubro_Num: Number(s(g.Rubro_Original).match(/^(\d+)/)?.[1] ?? 0), Rubro: s(g.Rubro_Original), Item: s(g.Item),
      Concepto: s(g.Concepto_Normalizado), Texto_Original: s(g.Concepto_Original), Proveedor: s(g.Proveedor), CUIT_Proveedor: cuitProv.get(s(g.ID_Proveedor)) === 'N/D' ? '' : cuitProv.get(s(g.ID_Proveedor)) ?? '',
      Importe: n(g.Importe), Otras_Columnas: 0, Es_Estimado: s(g.Es_Estimado) || 'NO', Es_Provisorio: s(g.Es_Provisorio) || 'NO',
      Comprobante_Citado: s(g.Comprobante) === 'N/D' ? '' : s(g.Comprobante), Periodo_Servicio: s(g.Periodo_Servicio) === 'N/D' ? '' : s(g.Periodo_Servicio), Estado_Pago: s(g.Estado_Pago),
      Respaldo_Tipo: r?.tipo ?? def.tipo, Respaldo_Detalle: r ? [r.doc, r.obs].filter((x) => x && x !== '—').join(' · ') : def.doc, Pagina: s(g.Pagina), Observacion: s(g.Observacion),
    });
  }

  B.CORRECCIONES.push(...sem.correcciones);

  // FLUJO
  for (const p of B.PERIODOS) {
    const id = s(p.ID_Periodo);
    let k = 0;
    const fid = () => `${id}-F${String(++k).padStart(2, '0')}`;
    B.FLUJO.push({ ID_Flujo: fid(), Barrio: p.Barrio, Mes: p.Mes, Tipo: 'SALDO_INICIAL', Categoria: '', Concepto: 'Saldo anterior', Ordinario: p.Fondo_Ord_Inicial, Extraordinario: p.Fondo_Ext_Inicial, Total: p.Saldo_Inicial, Observacion: '' });
    for (const x of (V.INGRESOS ?? []).filter((x) => x.ID_Periodo === id)) {
      const ord = s(x.Fondo) === 'ORDINARIO';
      B.FLUJO.push({ ID_Flujo: fid(), Barrio: p.Barrio, Mes: p.Mes, Tipo: 'INGRESO', Categoria: CAT_INGRESO[s(x.Origen)] ?? 'OTRO', Concepto: s(x.Concepto), Ordinario: ord ? n(x.Importe) : 0, Extraordinario: ord ? 0 : n(x.Importe), Total: n(x.Importe), Observacion: s(x.Observacion) });
    }
    for (const x of (V.EGRESOS_CAJA ?? []).filter((x) => x.ID_Periodo === id)) {
      const ord = s(x.Fondo) !== 'EXTRAORDINARIO';
      B.FLUJO.push({ ID_Flujo: fid(), Barrio: p.Barrio, Mes: p.Mes, Tipo: 'EGRESO', Categoria: CAT_EGRESO[s(x.Tipo_Egreso)] ?? 'OTRO', Concepto: s(x.Concepto), Ordinario: ord ? n(x.Importe) : 0, Extraordinario: ord ? 0 : n(x.Importe), Total: n(x.Importe), Observacion: s(x.Observacion) });
    }
    B.FLUJO.push({ ID_Flujo: fid(), Barrio: p.Barrio, Mes: p.Mes, Tipo: 'SALDO_FINAL', Categoria: '', Concepto: 'Saldo al cierre', Ordinario: p.Fondo_Ord_Final, Extraordinario: p.Fondo_Ext_Final, Total: p.Saldo_Final, Observacion: '' });
  }

  for (const x of V.PAGOS_PER_ANTERIORES ?? [])
    B.PAGOS_ANTERIORES.push({ ID_Pago: s(x.ID_Pago_Ant), Barrio: s(x.Barrio), Mes: s(x.Mes), Periodo_Origen: s(x.Periodo_Origen_Gasto).slice(-7), Texto: s(x.Concepto_Original), Importe: n(x.Importe) });

  for (const x of (V.SALDOS_PATRIMONIO ?? []).filter((x) => x.Bloque === 'COBROS_NO_IDENTIFICADOS')) {
    const m = s(x.Concepto).match(/(\d{1,2})\/(\d{4})/);
    B.NO_IDENTIFICADOS.push({ ID_Cobro: s(x.ID_Saldo), Barrio: s(x.Barrio), Mes: s(x.Mes), Mes_Origen: m ? `${m[2]}-${m[1].padStart(2, '0')}` : '', Importe: n(x.Importe) });
  }

  for (const c of V.COMPROBANTES ?? [])
    B.COMPROBANTES.push({
      ID_Comprobante: `${s(c.Barrio)}-${s(c.ID_Comprobante)}`, Barrio: s(c.Barrio), Mes: s(c.Mes), ID_Gasto: s(c.ID_Gasto).split(',')[0].trim(), Tipo: s(c.Tipo), Es_Fiscal: s(c.Es_Fiscal),
      Emisor: s(c.Emisor), CUIT_Emisor: s(c.CUIT_Emisor), Receptor: s(c.Receptor), Numero: s(c.Numero), Fecha: s(c.Fecha), Importe: n(c.Importe) === '' ? n(c.Importe_Archivo) : n(c.Importe),
      Periodo_Servicio: s(c.Periodo_Servicio), Archivo_ID: '', Observacion: [s(c.Revision), s(c.Nota)].filter(Boolean).join(' · '), Subido_Por: 'migración', Fecha_Carga: s(c.Fecha_Carga),
    });

  for (const m of V.MOVIMIENTOS_BANCO ?? [])
    B.MOVIMIENTOS_BANCO.push({
      ID_Mov: s(m.ID_Mov), Barrio: s(m.Barrio), Banco: s(m.Banco), Fecha: s(m.Fecha), Tipo: s(m.Tipo), Descripcion: s(m.Descripcion), Debito: n(m.Debito) || 0, Credito: n(m.Credito) || 0,
      Saldo: n(m.Saldo), Mismo_Titular: s(m.Mismo_Titular), Nota: s(m.Nota),
    });

  // HALLAZGOS (una fila por barrio)
  const resp = new Map((V.RESPUESTAS_ADMIN ?? []).filter((r) => r.ID_Hallazgo).map((r) => [s(r.ID_Hallazgo), s(r.Documentos_Muestran)]));
  const conDatos = new Set(B.PERIODOS.map((p) => s(p.Barrio)));
  for (const h of V.HALLAZGOS ?? []) {
    const cod = s(h.ID_Hallazgo);
    for (const bar of s(h.Barrios).split(/[,\s]+/).filter((b) => conDatos.has(b))) {
      const imp = Number(h[`Impacto_${bar}`] || 0);
      const ex = bar === 'S2' ? sem.hallazgos[cod] : undefined;
      const rec = s(h.Recurrencia);
      B.HALLAZGOS.push({
        ID_Hallazgo: `${bar}-${cod}`, Barrio: bar, Codigo: cod, Titulo: s(h.Titulo), Conclusion: s(h.Conclusion_Simple), Gravedad: s(h.Gravedad),
        Monto: ex ? ex.Monto : imp || '', Base_Monto: ex ? ex.Base_Monto : imp ? (rec === 'MENSUAL' ? 'por mes' : 'una vez') : 'sin monto',
        Probabilidad: ex ? ex.Probabilidad : rec === 'MENSUAL' ? 'Alta' : 'Media', Por_Que_Probabilidad: ex ? ex.Por_Que_Probabilidad : rec === 'MENSUAL' ? 'Se repite todos los meses.' : '',
        Donde_Verlo: DONDE[cod] ?? '', Que_Pedir: s(h.Que_Pedir), Estado_Reclamo: (ex?.Estado_Reclamo as string) ?? (s(h.Gravedad) === 'SIN INCONSISTENCIA' ? 'DESCARTADO' : s(h.Estado_Reclamo)),
        Lo_Que_Muestran: resp.get(cod) ?? '', Fecha_Alta: s(h.Fecha_Alta), Fecha_Solucion: s(h.Fecha_Solucion), Publicable: s(h.Publicable) || 'SI',
      });
    }
  }
  for (const h of sem.hallazgos_nuevos) B.HALLAZGOS.push({ ...h, ID_Hallazgo: `S2-${h.ID_Hallazgo}`, Barrio: 'S2', Codigo: h.ID_Hallazgo });
  B.HALLAZGOS = B.HALLAZGOS.map((h) => {
    const x = { ...h } as Fila;
    delete (x as Record<string, unknown>).Barrios;
    return x;
  });
  B.HALLAZGOS.push(...LH_EXTRA);

  B.EVENTOS.push(...sem.eventos);
  B.NOTAS.push(...sem.notas, ...NOTAS_GENERALES);
  B.MEDIDAS.push(...MEDIDAS_S2);
  const etiquetas = new Map((V.CONCEPTOS ?? []).map((c) => [s(c.Concepto_Normalizado), s(c.Etiqueta)]));
  B.CONCEPTOS.push(...REGLAS_CONCEPTO.map((r, i) => ({ Concepto: r.concepto, Etiqueta: etiquetas.get(r.concepto) ?? r.concepto, Patron: r.patron, Orden: i + 1 })));
  for (const x of V.INDICES ?? []) if (x.IPC_Var_Mensual !== '') B.INDICES.push({ Mes: s(x.Mes), IPC_Var_Mensual: n(x.IPC_Var_Mensual), Fuente: s(x.Fuente) });

  return limpiarBase(B, privados);
}

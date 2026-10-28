// Estructura de la planilla nueva. Es la única fuente: scripts/generar-gs.ts la copia a apps-script/Esquema.gs.
// Convenciones: Mes = "AAAA-MM"; fechas "AAAA-MM-DD"; importes en pesos con punto decimal (1234.56);
// SI/NO en mayúsculas; N/D cuando falta el dato.

export const ESQUEMA = {
  BARRIOS: {
    id: 'ID_Barrio',
    publica: true,
    descripcion: 'Un barrio por fila: lotes, coeficientes y datos del consorcio.',
    columnas: ['ID_Barrio', 'Nombre', 'Lotes', 'Unidades_Equivalentes', 'Coef_Lote_Reducido', 'Superficie_m2', 'Coef_FBV_Propios', 'Coef_FBV_Comunes', 'CUIT_Consorcio', 'Administrador', 'CUIT_Administrador', 'Activo'],
  },
  PERIODOS: {
    id: 'ID_Periodo',
    publica: true,
    descripcion: 'Una liquidación por fila: totales, saldos, fondos y patrimonio, tal como los informa el PDF.',
    columnas: [
      'ID_Periodo', 'Barrio', 'Mes', 'Fecha_Vencimiento', 'Recargo', 'Fecha_Cierre',
      'Total_Gastos', 'Repartido', 'Gastos_Particulares', 'Total_Expensas', 'Total_Con_Deudas',
      'Cuota_Lote_Comun', 'Cuota_Lote_Reducido', 'Unidades', 'Unidades_Con_Deuda', 'Lotes_Con_Particulares',
      'Saldo_Inicial', 'Ingresos', 'Egresos', 'Saldo_Final',
      'Fondo_Ord_Inicial', 'Fondo_Ord_Final', 'Fondo_Ext_Inicial', 'Fondo_Ext_Final',
      'Disponibilidades', 'Expensas_A_Cobrar', 'Deudas_A_Cobrar', 'Intereses_A_Cobrar', 'Redondeo',
      'Pendientes_Pago_Mes', 'Saldos_Pendientes_Total', 'Saldos_Pendientes_Cantidad', 'Pagos_Periodos_Anteriores', 'Patrimonio_Neto',
      'Controles_Fallidos', 'Fuente', 'Estado', 'Fecha_Carga',
    ],
  },
  GASTOS: {
    id: 'ID_Gasto',
    publica: true,
    descripcion: 'Un gasto liquidado por fila. Respaldo_Tipo: 1 completo, 2 parcial, 3 no fiscal, 4 solo citado, 5 nada o estimado.',
    columnas: [
      'ID_Gasto', 'Barrio', 'Mes', 'Rubro_Num', 'Rubro', 'Item', 'Concepto', 'Texto_Original', 'Proveedor', 'CUIT_Proveedor',
      'Importe', 'Otras_Columnas', 'Es_Estimado', 'Es_Provisorio', 'Comprobante_Citado', 'Periodo_Servicio', 'Estado_Pago',
      'Respaldo_Tipo', 'Respaldo_Detalle', 'Pagina', 'Observacion',
    ],
  },
  CORRECCIONES: {
    id: 'ID_Correccion',
    publica: true,
    descripcion: 'La liquidación correcta: importe que corresponde a cada gasto, con su criterio. Estado: APLICADA, SUGERIDA o DESCARTADA.',
    columnas: ['ID_Correccion', 'Barrio', 'Mes', 'ID_Gasto', 'Concepto', 'Importe_Liquidado', 'Importe_Correcto', 'Criterio', 'Detalle', 'Es_Estimado', 'Estado', 'Origen'],
  },
  FLUJO: {
    id: 'ID_Flujo',
    publica: true,
    descripcion: 'Detalle de egresos e ingresos de cada liquidación. Categoria: EN_TERMINO, ADEUDADAS, INTERESES, NO_IDENTIFICADOS, PAGO_GASTOS, SIN_DETALLE, AJUSTE, RECLASIFICACION, OTRO.',
    columnas: ['ID_Flujo', 'Barrio', 'Mes', 'Tipo', 'Categoria', 'Concepto', 'Ordinario', 'Extraordinario', 'Total', 'Observacion'],
  },
  PAGOS_ANTERIORES: {
    id: 'ID_Pago',
    publica: true,
    descripcion: 'Gastos de meses anteriores pagados en el mes.',
    columnas: ['ID_Pago', 'Barrio', 'Mes', 'Periodo_Origen', 'Texto', 'Importe'],
  },
  PENDIENTES: {
    id: 'ID_Pendiente',
    publica: true,
    descripcion: 'Gastos del mes que quedaron sin pagar (estado patrimonial).',
    columnas: ['ID_Pendiente', 'Barrio', 'Mes', 'Texto', 'Importe'],
  },
  NO_IDENTIFICADOS: {
    id: 'ID_Cobro',
    publica: true,
    descripcion: 'Cobros sin identificar que figuran en cada liquidación.',
    columnas: ['ID_Cobro', 'Barrio', 'Mes', 'Mes_Origen', 'Importe'],
  },
  COEFICIENTES: {
    id: 'ID_Coef',
    publica: true,
    descripcion: 'Coeficiente y cuota de cada lote (sin nombres ni deuda).',
    columnas: ['ID_Coef', 'Barrio', 'Mes', 'Lote', 'Coef_Pct', 'Cuota'],
  },
  COMPROBANTES: {
    id: 'ID_Comprobante',
    publica: true,
    descripcion: 'Facturas, extractos, presupuestos y transferencias que respaldan cada gasto. El archivo queda en Drive (privado).',
    columnas: [
      'ID_Comprobante', 'Barrio', 'Mes', 'ID_Gasto', 'Tipo', 'Es_Fiscal', 'Emisor', 'CUIT_Emisor', 'Receptor', 'Numero', 'Fecha', 'Importe',
      'Periodo_Servicio', 'Archivo_ID', 'Observacion', 'Subido_Por', 'Fecha_Carga',
    ],
  },
  MOVIMIENTOS_BANCO: {
    id: 'ID_Mov',
    publica: true,
    descripcion: 'Movimientos de los extractos bancarios.',
    columnas: ['ID_Mov', 'Barrio', 'Banco', 'Fecha', 'Tipo', 'Descripcion', 'Debito', 'Credito', 'Saldo', 'Mismo_Titular', 'Nota'],
  },
  HALLAZGOS: {
    id: 'ID_Hallazgo',
    publica: true,
    descripcion: 'Observaciones por barrio (ID = barrio-código): gravedad, monto, probabilidad y estado del reclamo. Base_Monto: por mes, una vez, saldo en riesgo o sin monto.',
    columnas: [
      'ID_Hallazgo', 'Barrio', 'Codigo', 'Titulo', 'Conclusion', 'Gravedad', 'Monto', 'Base_Monto', 'Probabilidad', 'Por_Que_Probabilidad', 'Donde_Verlo',
      'Que_Pedir', 'Estado_Reclamo', 'Lo_Que_Muestran', 'Fecha_Alta', 'Fecha_Solucion', 'Publicable',
    ],
  },
  EVENTOS: {
    id: 'ID_Evento',
    publica: true,
    descripcion: 'Cronología: liquidaciones, banco, reclamos y respuestas.',
    columnas: ['ID_Evento', 'Barrio', 'Fecha', 'Tipo', 'Hecho', 'Importe', 'Ref', 'Origen'],
  },
  NOTAS: {
    id: 'ID_Nota',
    publica: true,
    descripcion: 'Notas al pie de cada sección. Ambito: RESUMEN, RUBRO_3…RUBRO_11, FLUJO, ACUMULADO, RESPALDO, AHORROS, MATRIZ, PEDIDO.',
    columnas: ['ID_Nota', 'Barrio', 'Ambito', 'Num', 'Texto'],
  },
  MEDIDAS: {
    id: 'ID_Medida',
    publica: true,
    descripcion: 'Ahorros posibles. Grupo A corregir, B gestionar, C una sola vez. Calculo: CORRECCION:<concepto> toma la diferencia de la liquidación correcta; vacío usa Ahorro_Mensual.',
    columnas: ['ID_Medida', 'Barrio', 'Grupo', 'Medida', 'Hoy', 'Propuesta', 'Calculo', 'Ahorro_Mensual', 'Base', 'Ref'],
  },
  CONCEPTOS: {
    id: 'Concepto',
    publica: true,
    descripcion: 'Conceptos normalizados y el patrón (expresión regular) con el que el lector los reconoce en el PDF. Se evalúan en orden.',
    columnas: ['Concepto', 'Etiqueta', 'Patron', 'Orden', 'Que_Es'],
  },
  INDICES: {
    id: 'Mes',
    publica: true,
    descripcion: 'Inflación mensual del INDEC, solo como dato de referencia.',
    columnas: ['Mes', 'IPC_Var_Mensual', 'Fuente'],
  },
  EXPENSA_NUEVA: {
    id: 'ID_Linea',
    publica: true,
    descripcion: 'Expensa nueva para los propietarios: por concepto y mes, la explicación en palabras simples y si se puede ahorrar.',
    columnas: ['ID_Linea', 'Barrio', 'Mes', 'Concepto', 'Explicacion', 'Ahorrable', 'Ahorro_Estimado', 'Nota_Ahorro'],
  },
  EXPENSA_ESTADO: {
    id: 'ID_Expensa',
    publica: true,
    descripcion: 'Estado de la expensa nueva de cada mes: BORRADOR (solo la ve quien tiene la clave) o PUBLICADA. Mensaje: el texto de arriba.',
    columnas: ['ID_Expensa', 'Barrio', 'Mes', 'Estado', 'Mensaje', 'Fecha_Publicacion'],
  },
  CARGAS: {
    id: 'ID_Carga',
    publica: false,
    descripcion: 'Registro de cada PDF cargado.',
    columnas: ['ID_Carga', 'Barrio', 'Mes', 'Fecha', 'Usuario', 'Archivo_ID', 'Estado', 'Resumen'],
  },
} as const;

export type Hoja = keyof typeof ESQUEMA;
export const HOJAS = Object.keys(ESQUEMA) as Hoja[];
export type Fila = Record<string, string | number>;
export type Base = { [H in Hoja]: Fila[] };

export function baseVacia(): Base {
  return Object.fromEntries(HOJAS.map((h) => [h, []])) as unknown as Base;
}

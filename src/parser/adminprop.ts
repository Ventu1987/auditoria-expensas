// Lector de liquidaciones de expensas generadas por AdminProp (formato de RyM Administración).
// Recibe las líneas del PDF (pdfTexto.ts) y devuelve los datos estructurados, en centavos.
// Privacidad: del prorrateo y de los saldos pendientes NO se guarda ningún nombre ni la deuda de cada lote;
// solo coeficiente y cuota por lote, cantidades y totales.

import type { Fragmento, Linea } from './pdfTexto';

export type Cents = number;

export interface GastoExtraido {
  rubroNum: number;
  rubro: string;
  item: string;
  texto: string;
  proveedor: string;
  cuit: string;
  importe: Cents;
  otrasColumnas: Cents;
  total: Cents;
  pagina: number;
  estimado: boolean;
  provisorio: boolean;
  comprobante: string;
  periodoServicio: string;
  pendiente: boolean;
  concepto: string;
}

export interface LineaFlujo {
  concepto: string;
  ord: Cents;
  ext: Cents;
  total: Cents;
}

export interface Extraida {
  formato: 'AdminProp';
  barrioTexto: string;
  cuitConsorcio: string;
  cuitAdministrador: string;
  matricula: string;
  mes: string; // AAAA-MM
  fechaVencimiento: string; // AAAA-MM-DD
  recargo: string; // "5,50%"
  cuotaCupon: Cents;
  gastos: GastoExtraido[];
  rubros: { num: number; nombre: string; total: Cents; pct: string }[];
  totalGastos: Cents;
  prorrateo: {
    lotes: { lote: number; coefPct: string; cuota: Cents }[];
    unidades: number;
    unidadesConDeuda: number;
    lotesConParticulares: number;
    totales: { saldoAnterior: Cents; pagos: Cents; deuda: Cents; intereses: Cents; repartido: Cents; particulares: Cents; redondeo: Cents; total: Cents };
  };
  flujo: { fechaInicio: string; fechaCierre: string; saldoAnterior: LineaFlujo; lineas: LineaFlujo[]; saldoCierre: LineaFlujo };
  composicion: { efectivo: Cents; cuentaCorriente: Cents };
  resumenBanco: { saldoInicial: Cents; ingresos: Cents; egresos: Cents; saldoCierre: Cents };
  pagosAnteriores: { periodoOrigen: string; texto: string; importe: Cents }[];
  pagosAnterioresTotal: Cents;
  patrimonio: {
    disponibilidades: Cents;
    expensasACobrar: Cents;
    deudasACobrar: Cents;
    interesesACobrar: Cents;
    redondeo: Cents;
    devengadosPendientes: Cents;
    pendientes: { texto: string; importe: Cents }[];
    patrimonioNeto: Cents;
  };
  cobrosNoIdentificados: { importe: Cents; mes: string }[];
  saldosPendientes: { cantidad: number; total: Cents };
  controles: { control: string; documento: Cents; calculado: Cents; ok: boolean }[];
  avisos: string[];
}

export interface ReglaConcepto {
  concepto: string;
  patron: string; // expresión regular, sin barras
}

/** Reglas por defecto. La planilla (hoja CONCEPTOS, columna Patron) puede reemplazarlas o ampliarlas. */
export const REGLAS_CONCEPTO: ReglaConcepto[] = [
  { concepto: 'Impuesto inmobiliario ARBA (plan de pagos)', patron: 'ARBA.*(PLAN|CUOTA\\s*(5\\d|6\\d|7\\d)\\b)' },
  { concepto: 'Impuesto inmobiliario ARBA (cuota anual del predio)', patron: 'ARBA' },
  { concepto: 'Electricidad sectores comunes - Fideicomiso', patron: 'EDENOR.*SECTORES\\s+COMUNES' },
  { concepto: 'Electricidad - EDENOR', patron: 'EDENOR' },
  { concepto: 'Control de plagas / desratización', patron: 'PLAGAS|DESRATIZ' },
  { concepto: 'Mantenimiento Fideicomiso - espacios propios 80%', patron: 'ESPACIOS\\s+PROPIOS' },
  { concepto: 'Mantenimiento Fideicomiso - espacios comunes 20%', patron: 'ESPACIOS\\s+COMUNES' },
  { concepto: 'Sistema AdminProp', patron: 'ADMINPROP' },
  { concepto: 'Telered', patron: 'TELERED' },
  { concepto: 'Caja chica Fideicomiso', patron: 'CAJA\\s+CHICA' },
  { concepto: 'Reparación - control remoto (materiales + M.O.)', patron: 'CONTROL\\s+REMOTO' },
  { concepto: 'Reparación portón vehicular', patron: 'PORT[OÓ]N' },
  { concepto: 'Honorarios administración', patron: 'HONORARIOS' },
  { concepto: 'Gastos bancarios - Galicia', patron: 'GALICIA' },
  { concepto: 'Gastos bancarios - Roela', patron: 'ROELA' },
  { concepto: 'Seguro responsabilidad civil', patron: 'SEGURO|P[OÓ]LIZA' },
  { concepto: 'Bidones de agua garita', patron: 'BIDONES' },
  { concepto: 'Obra de cámaras (obra civil)', patron: 'OBRA\\s+CIVIL|ADICIONES\\s+OBRA' },
  { concepto: 'Equipamiento CCTV (PC, monitores, UPS)', patron: 'CCTV|MONITORES|\\bUPS\\b' },
  { concepto: 'Servicio de seguridad / vigilancia', patron: 'SEGURIDAD|VIGILANCIA' },
];

export function clasificar(texto: string, reglas: ReglaConcepto[] = REGLAS_CONCEPTO): string {
  for (const r of reglas) {
    try {
      if (new RegExp(r.patron, 'i').test(texto)) return r.concepto;
    } catch {
      /* patrón inválido en la planilla: se ignora */
    }
  }
  return 'Otro (revisar)';
}

// ---------- números ----------
const RE_IMPORTE = /^-?\$?\s*-?[\d.]+(,\d+)?$/;

/** "1.234,56" · "-27.714,23" · "655.859" · "$500000,00" → centavos. Devuelve null si no es un importe. */
export function aCentavos(s: string): Cents | null {
  let t = s.replace(/\$/g, '').replace(/\s/g, '');
  if (!t || t === '-' || !/\d/.test(t)) return null;
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const neg = t.startsWith('-');
  t = t.replace('-', '');
  const [ent, dec = ''] = t.split(',');
  const pesos = ent.replace(/\./g, '');
  const d2 = (dec + '00').slice(0, 2);
  const extra = dec.length > 2 ? Number('0.' + dec.slice(2)) >= 0.5 : false;
  const v = Number(pesos) * 100 + Number(d2) + (extra ? 1 : 0);
  return neg ? -v : v;
}

function esImporte(t: string): boolean {
  return RE_IMPORTE.test(t.trim()) && /\d/.test(t);
}

/** Importes de una línea, cada uno con la posición del signo $ que lo precede (o la suya). */
function importesConPeso(partes: Fragmento[]): { x: number; v: Cents }[] {
  const out: { x: number; v: Cents }[] = [];
  let pesoX: number | null = null;
  for (const p of partes) {
    const t = p.t.trim();
    if (t === '$') {
      pesoX = p.x;
      continue;
    }
    if (/^\$\s*-?[\d.,]+$/.test(t)) {
      out.push({ x: p.x, v: aCentavos(t) ?? 0 });
      pesoX = null;
      continue;
    }
    if (pesoX !== null) {
      if (t === '-') out.push({ x: pesoX, v: 0 });
      else if (esImporte(t)) out.push({ x: pesoX, v: aCentavos(t) ?? 0 });
      pesoX = null;
    }
  }
  return out;
}

const MESES: Record<string, string> = {
  ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04', MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08', SEPTIEMBRE: '09', SETIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
};

function fechaISO(ddmmaaaa: string): string {
  const m = ddmmaaaa.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function normal(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// ---------- limpieza de líneas ----------
const MARCA = /Generada por AdminProp/g;

function limpiar(lineas: Linea[]): Linea[] {
  const out: Linea[] = [];
  for (const l of lineas) {
    const partes = l.partes.map((p) => ({ ...p, t: p.t.replace(MARCA, '').trim() })).filter((p) => p.t);
    if (!partes.length) continue;
    // número de página suelto en el margen derecho
    if (partes.length === 1 && /^\d{1,2}$/.test(partes[0].t) && partes[0].x > 560) continue;
    out.push({ ...l, partes, texto: partes.map((p) => p.t).join(' ') });
  }
  return out;
}

// ---------- lector ----------
export function leerLiquidacion(lineasPdf: Linea[], reglas: ReglaConcepto[] = REGLAS_CONCEPTO): Extraida {
  const L = limpiar(lineasPdf);
  const avisos: string[] = [];
  const idx = (re: RegExp, desde = 0) => {
    for (let i = desde; i < L.length; i++) if (re.test(L[i].texto)) return i;
    return -1;
  };
  const corte = idx(/RECIBO DE COBRO/);
  const fin = corte >= 0 ? corte : L.length;

  // --- encabezado ---
  const txtEnc = L.slice(0, idx(/GASTOS DEL PER[IÍ]ODO/)).map((l) => l.texto).join('\n');
  const mLiq = txtEnc.match(/Liquidaci[oó]n:\s*(\d{1,2})\/(\d{4})/);
  const mes = mLiq ? `${mLiq[2]}-${mLiq[1].padStart(2, '0')}` : '';
  if (!mes) avisos.push('No se encontró el período de la liquidación.');
  const cuits = [...txtEnc.matchAll(/CUIT:\s*(\d{2}-\d{8}-\d)/g)].map((m) => m[1]);
  const cuitConsorcio = cuits.find((c) => c.startsWith('30') || c.startsWith('33')) ?? '';
  const cuitAdministrador = cuits.find((c) => c !== cuitConsorcio) ?? '';
  const matricula = txtEnc.match(/Mat\.?:\s*(\S+)/)?.[1] ?? '';
  const iBP = L.slice(0, 15).findIndex((l) => /Barrio Privado/i.test(l.texto));
  const barrioTexto = iBP >= 0 ? (L[iBP + 1]?.partes.filter((p) => p.x > 450).map((p) => p.t).join(' ') ?? '') : '';
  const mVto = txtEnc.match(/Luego del\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*([\d,]+%)/);
  const fechaVencimiento = mVto ? fechaISO(mVto[1]) : '';
  const recargo = mVto?.[2] ?? '';
  const lCuota = L.slice(0, 40).find((l) => /^Gastos Ord\./.test(l.texto) && /\d{1,2}\/\d{4}/.test(l.texto));
  const cuotaCupon = lCuota ? importesConPeso(lCuota.partes).at(-1)?.v ?? 0 : 0;

  // --- gastos ---
  const gastos: GastoExtraido[] = [];
  const rubros: Extraida['rubros'] = [];
  let totalGastos = 0;
  const iG = idx(/GASTOS DEL PER[IÍ]ODO/);
  const iGfin = idx(/^TOTAL DE GASTOS/, iG);
  let rubroNum = 0;
  let rubro = '';
  let actual: { item: string; textos: string[]; pagina: number } | null = null;
  for (let i = iG + 1; i <= iGfin && i >= 0; i++) {
    const l = L[i];
    const t = l.texto;
    const mR = t.match(/^(\d{1,2})\.\s*(.+?)\s+Gastos Ord\./);
    if (mR) {
      rubroNum = Number(mR[1]);
      rubro = `${mR[1]}. ${mR[2].trim()}`;
      actual = null;
      continue;
    }
    const mT = t.match(/^TOTAL RUBRO\s+(\d+)\s+([\d.,]+%)/);
    if (mT) {
      const v = importesConPeso(l.partes).at(-1)?.v ?? 0;
      rubros.push({ num: Number(mT[1]), nombre: rubro, total: v, pct: mT[2] });
      continue;
    }
    if (/^TOTAL DE GASTOS/.test(t)) {
      const nums = l.partes.map((p) => aCentavos(p.t)).filter((v): v is number => v !== null);
      totalGastos = nums.at(-1) ?? 0;
      break;
    }
    // ¿empieza un ítem?
    let partes = l.partes;
    const mI = partes[0]?.t.match(/^([a-z]{1,2})\.$/);
    if (mI && partes[0].x < 30) {
      actual = { item: mI[1], textos: [], pagina: l.pagina };
      partes = partes.slice(1);
    }
    if (!actual) continue;
    const imps = importesConPeso(partes);
    const textoLinea = partes
      .filter((p) => p.t !== '$' && !(esImporte(p.t) && p.x > 300) && !/^\$\s*-?[\d.,]+$/.test(p.t) && !(p.t === '-' && p.x > 300))
      .map((p) => p.t)
      .join(' ');
    if (textoLinea) actual.textos.push(textoLinea);
    if (imps.length) {
      const total = imps.at(-1)!.v;
      const importe = imps.length > 1 ? imps[0].v : total;
      const otras = imps.slice(1, -1).reduce((a, b) => a + b.v, 0);
      const texto = actual.textos.join(' ').replace(/\s+/g, ' ').trim();
      const mP = texto.match(/^(.+?)\s*\((\d{2}-?\d{8}-?\d)\)\s*-?\s*/);
      const proveedor = mP ? mP[1].trim() : texto.split(' - ')[0].trim();
      const cuit = mP ? mP[2].replace(/^(\d{2})-?(\d{8})-?(\d)$/, '$1-$2-$3') : '';
      const comp =
        texto.match(/FC\.?\s?[A-C]?-?\d{4,5}-\d{6,8}/i)?.[0] ??
        texto.match(/\bFC\.?\s?[A-Z]{0,2}\d{2,}/i)?.[0] ??
        texto.match(/P[OÓ]LIZA\s+(\d+)/i)?.[0] ??
        texto.match(/CUOTA\s+\d+/i)?.[0] ??
        '';
      const mS = normal(texto).match(/MES DE (ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/);
      gastos.push({
        rubroNum,
        rubro,
        item: actual.item,
        texto,
        proveedor,
        cuit,
        importe,
        otrasColumnas: otras,
        total,
        pagina: actual.pagina,
        estimado: /ESTIMAD/i.test(texto),
        provisorio: /PROVISORI/i.test(texto),
        comprobante: comp.trim(),
        periodoServicio: mS ? `${mes.slice(0, 4)}-${MESES[mS[1]]}` : '',
        pendiente: false,
        concepto: clasificar(texto, reglas),
      });
      actual = null;
    }
  }

  // --- prorrateo (sin nombres ni deuda por lote) ---
  const iP = idx(/PRORRATEO DE GASTOS/);
  const iPfin = idx(/DETALLE DE EGRESOS E INGRESOS/, iP);
  const lotes: Extraida['prorrateo']['lotes'] = [];
  let unidadesConDeuda = 0;
  let lotesConParticulares = 0;
  const totales = { saldoAnterior: 0, pagos: 0, deuda: 0, intereses: 0, repartido: 0, particulares: 0, redondeo: 0, total: 0 };
  for (let i = iP + 1; i < iPfin && i > 0; i++) {
    const l = L[i];
    const p = l.partes;
    if (p.length > 6 && /^\d{1,3}$/.test(p[0].t) && p[0].x < 35 && /^\d+-\d+$/.test(p[1]?.t ?? '')) {
      const resto = p.slice(2);
      const iPeso = resto.findIndex((q) => q.t === '$');
      const antes = (iPeso >= 0 ? resto.slice(0, iPeso) : resto).filter((q) => esImporte(q.t) || q.t === '-' || /^-?\d+(,\d+)?$/.test(q.t));
      // saldo, pagos, deuda, interés, %, cuota, [otras columnas], particular, redondeo
      if (antes.length >= 8) {
        const deuda = aCentavos(antes[2].t) ?? 0;
        if (deuda > 0) unidadesConDeuda++;
        const part = antes.at(-2)!.t === '-' ? 0 : aCentavos(antes.at(-2)!.t) ?? 0;
        if (part !== 0) lotesConParticulares++;
        lotes.push({ lote: Number(p[0].t), coefPct: antes[4].t, cuota: aCentavos(antes[5].t) ?? 0 });
      } else avisos.push(`Prorrateo: no se pudo leer la fila del lote ${p[0].t}.`);
    }
    if (/^TOTALES/.test(l.texto)) {
      // Los totales a veces vienen partidos en dos renglones ("21.893.342," y "71").
      const previa = L[i - 1];
      const tokens: Fragmento[] = [];
      const decimales = l.partes.filter((q) => /^\d{2}$/.test(q.t));
      const usados = new Set<Fragmento>();
      if (previa && previa.partes.some((q) => /,$/.test(q.t))) {
        for (const q of previa.partes) {
          if (/,$/.test(q.t)) {
            const d = decimales.find((dd) => !usados.has(dd) && dd.x > q.x && dd.x - q.x < 25);
            if (d) usados.add(d);
            tokens.push({ ...q, t: q.t + (d?.t ?? '00') });
          } else tokens.push(q);
        }
      }
      for (const q of l.partes) if (!usados.has(q) && q.t !== 'TOTALES') tokens.push(q);
      tokens.sort((a, b) => a.x - b.x);
      const iPct = tokens.findIndex((q) => /%$/.test(q.t));
      const nums = (arr: Fragmento[]) => arr.map((q) => (q.t === '-' ? 0 : aCentavos(q.t))).filter((v): v is number => v !== null);
      const pre = nums(tokens.slice(0, iPct));
      const post = nums(tokens.slice(iPct + 1));
      [totales.saldoAnterior, totales.pagos, totales.deuda, totales.intereses] = [pre[0] ?? 0, pre[1] ?? 0, pre[2] ?? 0, pre[3] ?? 0];
      totales.repartido = post[0] ?? 0;
      totales.total = post.at(-1) ?? 0;
      totales.redondeo = post.at(-2) ?? 0;
      totales.particulares = post.length >= 4 ? post.at(-3)! : 0;
    }
  }

  // --- detalle de egresos e ingresos ---
  const iF = idx(/DETALLE DE EGRESOS E INGRESOS/);
  const linFlujo = (l: Linea): LineaFlujo => {
    const cab = L.slice(iF, iF + 4).find((x) => /ORDINARIO/.test(x.texto));
    const xs = cab ? ['ORDINARIO', 'EXTRAORD', 'TOTAL'].map((k) => cab.partes.find((q) => q.t.startsWith(k))?.x ?? 0) : [384, 442, 523];
    const imps = importesConPeso(l.partes);
    const v = { ord: 0, ext: 0, total: 0 };
    for (const im of imps) {
      // el $ queda unos puntos a la izquierda del título de su columna
      const d = xs.map((x) => Math.abs(x - 5 - im.x));
      const k = d.indexOf(Math.min(...d));
      v[(['ord', 'ext', 'total'] as const)[k]] = im.v;
    }
    const concepto = l.partes.filter((q) => q.x < 370 && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(q.t) && q.t !== '$').map((q) => q.t).join(' ');
    return { concepto, ...v };
  };
  const iSA = idx(/^Saldo anterior al/, iF);
  const iSC = idx(/^Saldo al cierre/, iF);
  const saldoAnterior = linFlujo(L[iSA]);
  const saldoCierre = linFlujo(L[iSC]);
  const lineasFlujo: LineaFlujo[] = [];
  for (let i = iSA + 1; i < iSC; i++) {
    const lf = linFlujo(L[i]);
    if (lf.concepto) lineasFlujo.push(lf);
    else if (lineasFlujo.length) {
      // continuación de un concepto largo
      const ult = lineasFlujo.at(-1)!;
      if (!ult.ord && !ult.ext && !ult.total) Object.assign(ult, { ord: lf.ord, ext: lf.ext, total: lf.total });
    }
  }
  const fechaInicio = fechaISO(L[iSA]?.texto ?? '');
  const fechaCierre = fechaISO(L[iSC]?.texto ?? '');

  // --- composición y resumen bancario ---
  const valorDe = (re: RegExp, desde = 0, hasta = fin) => {
    for (let i = desde; i < hasta; i++) if (re.test(L[i].texto)) return importesConPeso(L[i].partes).at(-1)?.v ?? 0;
    return 0;
  };
  const iComp = idx(/COMPOSICI[OÓ]N DE SALDO/);
  const composicion = { efectivo: valorDe(/^EFECTIVO/, iComp), cuentaCorriente: valorDe(/^CUENTA CORRIENTE/, iComp) };
  const iRB = idx(/RESUMEN DE MOVIMIENTOS BANCARIOS/);
  const resumenBanco = {
    saldoInicial: valorDe(/^Saldo inicial/, iRB),
    ingresos: valorDe(/^Ingresos$|^Ingresos \$/, iRB),
    egresos: valorDe(/^Egresos$|^Egresos \$/, iRB),
    saldoCierre: valorDe(/^Saldo al cierre/, iRB),
  };

  // --- gastos pagados de períodos anteriores ---
  const iPA = idx(/GASTOS PAGADOS DE PERIODOS ANTERIORES/);
  const pagosAnteriores: Extraida['pagosAnteriores'] = [];
  let pagosAnterioresTotal = 0;
  if (iPA >= 0) {
    let cur: { periodoOrigen: string; textos: string[] } | null = null;
    for (let i = iPA + 1; i < fin; i++) {
      const l = L[i];
      if (/^TOTAL/.test(l.texto)) {
        pagosAnterioresTotal = importesConPeso(l.partes).at(-1)?.v ?? 0;
        break;
      }
      const m = l.texto.match(/^\((\d{2})\/(\d{4})\)\s*(.*)$/);
      if (m) cur = { periodoOrigen: `${m[2]}-${m[1]}`, textos: [] };
      if (!cur) continue;
      const imps = importesConPeso(l.partes);
      const txt = l.partes.filter((q) => q.t !== '$' && !(esImporte(q.t) && q.x > 400)).map((q) => q.t).join(' ').replace(/^\(\d{2}\/\d{4}\)\s*/, '');
      if (txt) cur.textos.push(txt);
      if (imps.length) {
        pagosAnteriores.push({ periodoOrigen: cur.periodoOrigen, texto: cur.textos.join(' ').replace(/\s+/g, ' ').trim(), importe: imps.at(-1)!.v });
        cur = null;
      }
    }
  }

  // --- estado patrimonial ---
  const iEP = idx(/ESTADO PATRIMONIAL/);
  const iPN = idx(/^PATRIMONIO NETO/, iEP);
  const iDev = idx(/^Gastos devengados pendientes/, iEP);
  const ultimoNum = (l: Linea) => {
    const ns = l.partes.map((q) => aCentavos(q.t.replace(/^.*\$(?=\s*-?[\d.])/, ''))).filter((v): v is number => v !== null);
    return ns.at(-1) ?? 0;
  };
  const pendientes: Extraida['patrimonio']['pendientes'] = [];
  if (iDev >= 0)
    for (let i = iDev + 1; i < iPN; i++) {
      const l = L[i];
      const v = ultimoNum(l);
      const texto = l.partes.filter((q) => q.x < 480).map((q) => q.t).join(' ').replace(/\$\s*$/, '').trim();
      if (v && /[A-Z]{3}/.test(texto)) pendientes.push({ texto, importe: v });
    }
  const patrimonio = {
    disponibilidades: valorDe(/^SALDO DE DISPONIBILIDADES/, iEP),
    expensasACobrar: valorDe(/^Expensas y otros conceptos a cobrar/, iEP),
    deudasACobrar: valorDe(/^Deudas a cobrar/, iEP),
    interesesACobrar: valorDe(/^Intereses a cobrar/, iEP),
    redondeo: valorDe(/^Redondeo Liquidaci/, iEP),
    devengadosPendientes: iDev >= 0 ? ultimoNum(L[iDev]) : 0,
    pendientes,
    patrimonioNeto: iPN >= 0 ? ultimoNum(L[iPN]) : 0,
  };

  // --- cobros no identificados ---
  const iCN = idx(/COBROS NO IDENTIFICADOS/, iEP);
  const iSP = idx(/SALDOS PENDIENTES DE PAGO/, iEP);
  const cobrosNoIdentificados: Extraida['cobrosNoIdentificados'] = [];
  if (iCN >= 0)
    for (let i = iCN + 1; i < (iSP >= 0 ? iSP : fin); i++)
      for (const m of L[i].texto.matchAll(/\d+\.\s*\$\s*([\d.,]+)\s*-\s*(\d{1,2})\/(\d{4})/g))
        cobrosNoIdentificados.push({ importe: aCentavos(m[1]) ?? 0, mes: `${m[3]}-${m[2].padStart(2, '0')}` });

  // --- saldos pendientes de pago (solo cantidad y total) ---
  const saldosPendientes = { cantidad: 0, total: 0 };
  if (iSP >= 0)
    for (let i = iSP + 1; i < fin; i++) {
      const l = L[i];
      if (/^TOTAL/.test(l.texto)) {
        saldosPendientes.total = importesConPeso(l.partes).at(-1)?.v ?? 0;
        break;
      }
      saldosPendientes.cantidad += importesConPeso(l.partes).length;
    }

  // --- gastos pendientes de pago: se marcan en cada gasto ---
  const libres = [...pendientes];
  for (const g of gastos) {
    const k = libres.findIndex((p) => p.importe === -g.total && normal(g.texto).startsWith(normal(p.texto).slice(0, 25)));
    if (k >= 0) {
      g.pendiente = true;
      libres.splice(k, 1);
    }
  }
  for (const g of gastos) {
    if (g.pendiente) continue;
    const k = libres.findIndex((p) => p.importe === -g.total);
    if (k >= 0) {
      g.pendiente = true;
      libres.splice(k, 1);
    }
  }

  // --- controles ---
  const controles: Extraida['controles'] = [];
  const ctl = (control: string, documento: Cents, calculado: Cents) => controles.push({ control, documento, calculado, ok: documento === calculado });
  for (const r of rubros) ctl(`Rubro ${r.num}: suma de sus gastos`, r.total, gastos.filter((g) => g.rubroNum === r.num).reduce((a, g) => a + g.total, 0));
  ctl('Total de gastos: suma de los rubros', totalGastos, rubros.reduce((a, r) => a + r.total, 0));
  ctl('Total de gastos: suma de los ítems', totalGastos, gastos.reduce((a, g) => a + g.total, 0));
  ctl('Flujo: saldo anterior + movimientos = saldo al cierre', saldoCierre.total, saldoAnterior.total + lineasFlujo.reduce((a, x) => a + x.total, 0));
  ctl('Resumen bancario: inicial + ingresos + egresos = cierre', resumenBanco.saldoCierre, resumenBanco.saldoInicial + resumenBanco.ingresos + resumenBanco.egresos);
  ctl('Resumen bancario contra el detalle de egresos e ingresos', resumenBanco.saldoCierre, saldoCierre.total);
  ctl('Gastos de períodos anteriores: suma', pagosAnterioresTotal, pagosAnteriores.reduce((a, x) => a + x.importe, 0));
  ctl('Gastos pendientes de pago: suma del detalle', patrimonio.devengadosPendientes, pendientes.reduce((a, x) => a + x.importe, 0));
  ctl(
    'Patrimonio neto: suma de sus partes',
    patrimonio.patrimonioNeto,
    patrimonio.disponibilidades + patrimonio.expensasACobrar + patrimonio.deudasACobrar + patrimonio.interesesACobrar + patrimonio.redondeo + patrimonio.devengadosPendientes,
  );
  ctl('Expensas a cobrar = repartido + particulares', patrimonio.expensasACobrar, totales.repartido + totales.particulares);
  ctl('Cobros no identificados del mes contra el flujo', lineasFlujo.find((x) => /no identificados/i.test(x.concepto))?.total ?? 0, cobrosNoIdentificados.filter((c) => c.mes === mes).reduce((a, c) => a + c.importe, 0));
  if (libres.length) avisos.push(`${libres.length} gasto(s) pendiente(s) de pago no se pudieron asociar a un gasto del mes.`);
  if (gastos.some((g) => g.concepto === 'Otro (revisar)')) avisos.push('Hay gastos que no coinciden con ningún concepto conocido: revisalos.');
  if (!lotes.length) avisos.push('No se pudo leer el prorrateo.');

  return {
    formato: 'AdminProp',
    barrioTexto,
    cuitConsorcio,
    cuitAdministrador,
    matricula,
    mes,
    fechaVencimiento,
    recargo,
    cuotaCupon,
    gastos,
    rubros,
    totalGastos,
    prorrateo: { lotes, unidades: lotes.length, unidadesConDeuda, lotesConParticulares, totales },
    flujo: { fechaInicio, fechaCierre, saldoAnterior, lineas: lineasFlujo, saldoCierre },
    composicion,
    resumenBanco,
    pagosAnteriores,
    pagosAnterioresTotal,
    patrimonio,
    cobrosNoIdentificados,
    saldosPendientes,
    controles,
    avisos,
  };
}

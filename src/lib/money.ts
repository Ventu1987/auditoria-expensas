// Importes en centavos enteros y coeficientes como fracciones exactas.
// Ningún cálculo usa punto flotante: así cada centavo se puede rastrear.

export type Cents = number;

export interface Ratio {
  num: bigint;
  den: bigint;
}

/** Convierte un importe de la planilla (número o texto "1234.56") a centavos. */
export function cents(v: number | string | null | undefined): Cents {
  if (v === null || v === undefined || v === '') return 0;
  const r = ratio(String(v));
  return Number(divRound(r.num * 100n, r.den));
}

/** "0.1373", "13.73%", "65585949/1157591942" o un número → fracción exacta. */
export function ratio(s: string | number): Ratio {
  let t = String(s).trim();
  let pct = false;
  if (t.endsWith('%')) {
    pct = true;
    t = t.slice(0, -1).trim().replace(',', '.');
  }
  if (t.includes('/')) {
    const [a, b] = t.split('/');
    const ra = ratio(a);
    const rb = ratio(b);
    return norm({ num: ra.num * rb.den, den: ra.den * rb.num * (pct ? 100n : 1n) });
  }
  if (/e/i.test(t)) t = Number(t).toFixed(20).replace(/0+$/, '');
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);
  const [ent, dec = ''] = t.split('.');
  const den = 10n ** BigInt(dec.length) * (pct ? 100n : 1n);
  const num = BigInt((ent || '0') + dec) * (neg ? -1n : 1n);
  return norm({ num, den });
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function norm(r: Ratio): Ratio {
  if (r.den < 0n) r = { num: -r.num, den: -r.den };
  const g = gcd(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

/** División entera con redondeo al más cercano, la mitad hacia afuera del cero. */
export function divRound(num: bigint, den: bigint): bigint {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (a * 2n + den) / (den * 2n);
  return neg ? -q : q;
}

/** Centavos × una o más fracciones, redondeado al centavo (mitad hacia arriba). */
export function mulRound(c: Cents, ...rs: Ratio[]): Cents {
  let num = BigInt(c);
  let den = 1n;
  for (const r of rs) {
    num *= r.num;
    den *= r.den;
  }
  return Number(divRound(num, den));
}

export function mulRatio(a: Ratio, b: Ratio): Ratio {
  return norm({ num: a.num * b.num, den: a.den * b.den });
}

export function subRatio(a: Ratio, b: Ratio): Ratio {
  return norm({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
}

export function sumRatios(rs: Ratio[]): Ratio {
  return rs.reduce((acc, r) => norm({ num: acc.num * r.den + r.num * acc.den, den: acc.den * r.den }), { num: 0n, den: 1n });
}

export function ratioOf(a: Cents, b: Cents): Ratio {
  return norm({ num: BigInt(a), den: BigInt(b) });
}

const MENOS = '−';

function miles(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** $ 1.234,56 · con signo opcional (+$ / −$). */
export function money(c: Cents, opts: { signo?: boolean } = {}): string {
  const neg = c < 0;
  const a = BigInt(Math.abs(c));
  const s = `$ ${miles(a / 100n)},${(a % 100n).toString().padStart(2, '0')}`;
  if (neg) return MENOS + s;
  return opts.signo && c > 0 ? '+' + s : s;
}

/** Porcentaje con coma decimal. pct(ratio(0.1373), 2) → "13,73%" */
export function pct(r: Ratio, decimales = 2, opts: { signo?: boolean } = {}): string {
  const escala = 10n ** BigInt(decimales);
  const v = divRound(r.num * 100n * escala, r.den);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const ent = a / escala;
  const dec = (a % escala).toString().padStart(decimales, '0');
  const s = `${miles(ent)}${decimales ? ',' + dec : ''}%`;
  if (neg) return MENOS + s;
  return opts.signo && v > 0n ? '+' + s : s;
}

/** Número decimal con coma, por ejemplo 0,09. */
export function num(r: Ratio, decimales = 2): string {
  return pct({ num: r.num, den: r.den * 100n }, decimales).replace('%', '');
}

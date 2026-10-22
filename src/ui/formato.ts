import { money } from '../lib/money';
import type { Celda, Formato } from '../vistas/tablas';

const coma = (s: string) => s.replace('.', ',');
const MENOS = '−';

export function fmt(v: Celda | undefined, f: Formato = 'money'): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') return v;
  switch (f) {
    case 'money':
      return money(Math.round(v));
    case 'pct':
      return (v < 0 ? MENOS : '') + coma((Math.abs(v) * 100).toFixed(1)) + '%';
    case 'pct4':
      return (v < 0 ? MENOS : '') + coma((Math.abs(v) * 100).toFixed(4)) + '%';
    case 'num4':
      return coma(v.toFixed(4));
    case 'num':
      return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    default:
      return String(v);
  }
}

export const fmtVar = (v: number | null) => (v === null ? '' : (v < 0 ? MENOS : v > 0 ? '+' : '') + coma((Math.abs(v) * 100).toFixed(1)) + '%');
export const pesos = (cts: number | null | undefined) => (cts === null || cts === undefined ? 'N/D' : money(Math.round(cts)));
export const mesLargo = (m: string) => {
  const n = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${n[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
};

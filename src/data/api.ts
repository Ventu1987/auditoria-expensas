// Lectura y escritura contra la planilla (Apps Script). Si la API no responde, se usa la copia incluida.
import copia from './copia.json';
import { HOJAS, baseVacia, type Base, type Fila, type Hoja } from './esquema';
import { limpiarBase } from './privacidad';

/** Dirección de la aplicación web de la planilla nueva. Se configura con la variable VITE_API (GitHub → Settings → Variables). */
export const API = (import.meta.env?.VITE_API as string | undefined) ?? '';
export interface Carga {
  base: Base;
  origen: 'api' | 'copia';
  detalle: string;
}

function normalizar(sheets: Record<string, Fila[]>): Base {
  const b = baseVacia();
  for (const h of HOJAS) b[h] = (sheets[h] ?? []) as Fila[];
  return b;
}

async function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado')), ms))]);
}

export async function cargarBase(): Promise<Carga> {
  if (API) {
    try {
      const r = await conTimeout(fetch(`${API}?accion=datos`), 15000);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? 'Error de la planilla');
      const base = normalizar(j.sheets);
      if (base.PERIODOS.length) return { base: limpiarBase(base), origen: 'api', detalle: `Planilla actualizada ${j.updated}` };
      return { base: limpiarBase(normalizar(copia.sheets as never)), origen: 'copia', detalle: 'La planilla no tiene liquidaciones: se muestra la copia incluida. Revisá que hayas subido la planilla inicial.' };
    } catch (e) {
      return { base: limpiarBase(normalizar(copia.sheets as never)), origen: 'copia', detalle: `La planilla no respondió (${(e as Error).message}). Se muestra la copia del ${copia.updated}.` };
    }
  }
  return { base: limpiarBase(normalizar(copia.sheets as never)), origen: 'copia', detalle: `Copia incluida en la app (${copia.updated}). Falta configurar la planilla.` };
}

export async function enviar<T = Record<string, unknown>>(cuerpo: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  if (!API) return { ok: false, error: 'Falta configurar la dirección de la planilla (VITE_API).' } as T & { ok: boolean; error?: string };
  // text/plain evita el pedido previo de CORS que Apps Script no responde
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
  return r.json();
}

export const guardar = (barrio: string, clave: string, hoja: Hoja, filas: Fila[]) => enviar({ accion: 'guardar', barrio, clave, hoja, filas });
export const borrar = (barrio: string, clave: string, hoja: Hoja, id: string) => enviar({ accion: 'borrar', barrio, clave, hoja, id });

export async function aBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function subirArchivo(barrio: string, clave: string, carpeta: string, mes: string, f: File): Promise<string> {
  const r = await enviar<{ archivoId: string }>({ accion: 'subirArchivo', barrio, clave, carpeta, mes, nombre: f.name, mime: f.type || 'application/pdf', base64: await aBase64(f) });
  if (!r.ok) throw new Error(r.error);
  return r.archivoId;
}

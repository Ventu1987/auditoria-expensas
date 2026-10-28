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

/** La copia incluida en la app: se muestra al instante mientras se lee la planilla. */
export function copiaIncluida(detalle?: string): Carga {
  return { base: limpiarBase(normalizar(copia.sheets as never)), origen: 'copia', detalle: detalle ?? `Copia incluida en la app (${copia.updated}).` };
}

async function leerPlanilla(ms: number): Promise<Base> {
  const r = await conTimeout(fetch(`${API}?accion=datos&t=${Date.now()}`, { cache: 'no-store' }), ms);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error ?? 'Error de la planilla');
  return normalizar(j.sheets);
}

/**
 * Lee la planilla. Google tarda a veces más de 30 segundos en "despertar" el script la primera vez:
 * se espera hasta 60 segundos y, si falla, se reintenta una vez.
 */
export async function cargarBase(): Promise<Carga> {
  if (!API) return copiaIncluida(`Copia incluida en la app (${copia.updated}). Falta configurar la planilla.`);
  let error = '';
  for (const ms of [60000, 60000]) {
    try {
      const base = await leerPlanilla(ms);
      if (base.PERIODOS.length) return { base: limpiarBase(base), origen: 'api', detalle: `Planilla en vivo (${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})` };
      return copiaIncluida('La planilla no tiene liquidaciones: se muestra la copia incluida. Revisá que hayas subido la planilla inicial.');
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return copiaIncluida(`La planilla no respondió (${error}). Se muestra la copia del ${copia.updated}. Tocá «Reintentar».`);
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

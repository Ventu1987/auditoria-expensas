// Lo que nunca se publica: padrón, nombres de propietarios, deuda por lote, nombres de empleados,
// CUIT de personas físicas (salvo el del administrador) y nombres de proveedores personas físicas.
// La planilla aplica las mismas reglas al guardar (Code.gs · limpiarFila_); esto es la segunda barrera.

import type { Base, Fila } from './esquema';

export const CUIT_ADMINISTRADOR = '20-25787636-6';

const VARIANTES: Record<string, string> = { a: 'aáàä', e: 'eéèë', i: 'iíìï', o: 'oóòö', u: 'uúùü', n: 'nñ' };

/** Regex que encuentra un nombre con o sin tildes, en mayúsculas o minúsculas. */
export function patronNombre(nombre: string): RegExp {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const cuerpo = [...base]
    .map((ch) => (/\s/.test(ch) ? '\\s+' : VARIANTES[ch] ? `[${VARIANTES[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
    .replace(/(\\s\+)+/g, '\\s+');
  return new RegExp(cuerpo, 'gi');
}

/** 20400609129 o 20-40060912-9 → 20-4006****-9 (salvo el administrador). */
export function enmascararCuits(texto: string): string {
  return texto.replace(/\b(2[0347])-?(\d{4})(\d{4})-?(\d)\b/g, (_m, p, a, b, v) => {
    const cuit = `${p}-${a}${b}-${v}`;
    return cuit === CUIT_ADMINISTRADOR ? cuit : `${p}-${a}****-${v}`;
  });
}

export function esPersonaFisica(cuit: string): boolean {
  const c = enmascararCuits(String(cuit ?? ''));
  return /^2[0347]-\d{4}(\*{4}|\d{4})-\d$/.test(c) && c !== CUIT_ADMINISTRADOR;
}

/** Limpia una fila de gasto o comprobante. `privados`: nombres que nunca se publican. */
export function limpiarFila(f: Fila, privados: string[] = []): Fila {
  const out: Fila = {};
  const cuitProv = String(f.CUIT_Proveedor ?? '');
  const fisica = cuitProv !== '' && esPersonaFisica(cuitProv);
  const nombreProv = fisica ? String(f.Proveedor ?? '').replace(/\s*\(.*\)\s*$/, '').trim() : '';
  const palabras = nombreProv.split(/\s+/).filter((w) => w.length >= 4 && !/^proveedor$|^persona$|^física$/i.test(w));
  for (const [k, v] of Object.entries(f)) {
    if (typeof v !== 'string') {
      out[k] = v;
      continue;
    }
    let t = enmascararCuits(v);
    for (const n of privados) {
      if (!n.trim()) continue;
      t = t.replace(patronNombre(n), '(persona excluida)');
      // también cada palabra suelta del nombre (un apellido solo)
      for (const w of n.trim().split(/\s+/).filter((x) => x.length >= 4))
        t = t.replace(new RegExp(`(?<![\\p{L}])${patronNombre(w).source}(?![\\p{L}])`, 'giu'), '(persona excluida)');
    }
    // cualquier nombre seguido de un CUIT de persona física ya enmascarado
    t = t.replace(/(?<![\p{L}])[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.]*(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.]*){0,4}\s*\((2[0347]-\d{4}\*{4}-\d)\)/gu, (m, cuit) => (/^Proveedor persona f/i.test(m) ? m : `Proveedor persona física (${cuit})`));
    if (fisica && k !== 'Proveedor' && k !== 'CUIT_Proveedor') {
      if (nombreProv) t = t.replace(patronNombre(nombreProv), 'Proveedor persona física');
      for (const w of palabras) t = t.replace(new RegExp(`(?<![\\p{L}])${patronNombre(w).source}(?![\\p{L}])`, 'giu'), '·');
      t = t.replace(/·(\s+·)*/g, 'persona física');
    }
    out[k] = t;
  }
  if (fisica) {
    out.CUIT_Proveedor = enmascararCuits(cuitProv);
    out.Proveedor = `Proveedor persona física (${out.CUIT_Proveedor})`;
  }
  for (const k of ['CUIT_Emisor'] as const) {
    if (f[k] && esPersonaFisica(String(f[k]))) {
      out[k] = enmascararCuits(String(f[k]));
      out.Emisor = 'Persona física';
    }
  }
  return out;
}

const EMPRESA = /\b(S\.?A\.?U?|S\.?R\.?L|SAS|COOP\w*|COOPERATIVA|FIDEICOMISO|FIDUCIARIA|BANCO|ADMINISTRACI[OÓ]N|EDENOR|ARBA|AFIP|ARCA|TELERED|PISO|SEGUROS?|PATRONAL|MUNICIPALIDAD|AYSA|CAJA|LIMITADA|LTDA|FC\w*|OP\d*|PAGO|CUENTA|COBROS?|EGRESOS?|INGRESOS?|DIFERENCIA|AJUSTE|SALDO)\b/i;

/**
 * Concepto suelto del flujo que parece un nombre de persona (2 a 4 palabras, solo letras, sin palabras de empresa).
 * Se oculta por las dudas: la persona que carga lo puede corregir antes de confirmar.
 */
export function pareceNombre(t: string): boolean {
  const x = t.trim();
  return /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,3}$/.test(x) && !EMPRESA.test(x);
}

export function limpiarBase(b: Base, privados: string[] = []): Base {
  const out = {} as Base;
  for (const [h, filas] of Object.entries(b)) (out as Record<string, Fila[]>)[h] = (filas as Fila[]).map((f) => limpiarFila(f, privados));
  return out;
}

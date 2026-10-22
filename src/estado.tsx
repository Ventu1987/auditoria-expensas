// Estado de la app: datos, barrio elegido, clave y pestaña. Un store mínimo, sin librerías.
import { useSyncExternalStore } from 'react';
import type { Base } from './data/esquema';
import { cargarBase, enviar } from './data/api';

export type Tema = 'claro' | 'oscuro' | 'sistema';
interface Estado {
  base: Base | null;
  origen: 'api' | 'copia' | '';
  detalle: string;
  cargando: boolean;
  barrio: string;
  clave: string;
  rol: string;
  tab: string;
  tema: Tema;
}

const leer = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const escribir = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
};
const leerSesion = (k: string) => {
  try {
    return sessionStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};

let estado: Estado = {
  base: null,
  origen: '',
  detalle: '',
  cargando: true,
  barrio: leer('barrio', 'S2'),
  clave: leerSesion('clave'),
  rol: leerSesion('rol'),
  tab: new URLSearchParams(location.hash.slice(1)).get('t') ?? 'resumen',
  tema: leer('tema', 'sistema') as Tema,
};
const subs = new Set<() => void>();
function set(p: Partial<Estado>) {
  estado = { ...estado, ...p };
  subs.forEach((f) => f());
}

const acciones = {
  async recargar() {
    set({ cargando: true });
    const c = await cargarBase();
    set({ base: c.base, origen: c.origen, detalle: c.detalle, cargando: false });
  },
  setBarrio(b: string) {
    escribir('barrio', b);
    set({ barrio: b, rol: '', clave: '' });
    try {
      sessionStorage.removeItem('clave');
    } catch {
      /* nada */
    }
  },
  async setClave(clave: string): Promise<string | null> {
    if (!clave) {
      set({ clave: '', rol: '' });
      return null;
    }
    const r = await enviar<{ rol: string }>({ accion: 'verificar', barrio: estado.barrio, clave });
    if (!r.ok) return r.error ?? 'Clave incorrecta';
    try {
      sessionStorage.setItem('clave', clave);
      sessionStorage.setItem('rol', r.rol);
    } catch {
      /* nada */
    }
    set({ clave, rol: r.rol });
    return null;
  },
  setTab(t: string) {
    history.replaceState(null, '', `#t=${t}`);
    set({ tab: t });
    window.scrollTo({ top: 0 });
  },
  setTema(t: Tema) {
    escribir('tema', t);
    document.documentElement.dataset.theme = t === 'sistema' ? '' : t === 'oscuro' ? 'dark' : 'light';
    set({ tema: t });
  },
};

type App = Estado & typeof acciones;
const snapshot = () => estado;
export function useApp(): App {
  const s = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), snapshot);
  return { ...s, ...acciones };
}
useApp.getState = (): App => ({ ...estado, ...acciones });

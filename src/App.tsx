import { useEffect, useMemo, useState } from 'react';
import { useApp } from './estado';
import { analizar } from './motor/analisis';
import { todasLasPestanas, type Pestana } from './vistas/tablas';
import { Tabla } from './ui/Tabla';
import { GrillaRiesgo } from './ui/Grilla';
import { Cargar } from './pantallas/Cargar';
import { Comprobantes } from './pantallas/Comprobantes';
import { Editar } from './pantallas/Editar';
import { Admin } from './pantallas/Admin';
import { ExpensaNueva } from './pantallas/ExpensaNueva';
import { descargarExcel } from './lib/excel';
import { Novedades } from './ui/Novedades';

const HERRAMIENTAS = [
  { id: 'expensa', titulo: 'Expensa nueva', C: ExpensaNueva },
  { id: 'cargar', titulo: 'Cargar expensa', C: Cargar },
  { id: 'comprobantes', titulo: 'Comprobantes', C: Comprobantes },
  { id: 'editar', titulo: 'Corregir y comentar', C: Editar },
  { id: 'admin', titulo: 'Administración', C: Admin },
];

function Clave() {
  const { clave, rol, setClave } = useApp();
  const [abierto, setAbierto] = useState(false);
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  if (rol)
    return (
      <button className="chip ok" onClick={() => setClave('')} title="Salir">
        {rol === 'admin' ? 'Administración' : `Auditor ${rol}`} · salir
      </button>
    );
  return abierto ? (
    <form
      className="clave"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await setClave(v);
        if (r) setErr(r);
        else setAbierto(false);
      }}
    >
      <input type="password" autoFocus placeholder="Clave del barrio" value={v} onChange={(e) => (setV(e.target.value), setErr(''))} />
      <button className="primario">Entrar</button>
      {err && <span className="xs mas">{err}</span>}
    </form>
  ) : (
    <button onClick={() => setAbierto(true)}>{clave ? 'Clave' : 'Clave'}</button>
  );
}

export default function App() {
  const s = useApp();
  useEffect(() => {
    s.recargar();
    s.setTema(s.tema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const barrios = useMemo(() => (s.base?.BARRIOS ?? []).filter((b) => b.Activo === 'SI'), [s.base]);
  const A = useMemo(() => (s.base ? analizar(s.base, s.barrio) : null), [s.base, s.barrio]);
  const pestanas: Pestana[] = useMemo(() => (A && s.base && A.meses.length ? todasLasPestanas(A, s.base) : []), [A, s.base]);
  const herr = HERRAMIENTAS.find((h) => h.id === s.tab);
  const actual = pestanas.find((p) => p.id === s.tab) ?? (herr ? null : pestanas[0]);

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <strong>Auditoría de expensas</strong>
          <span className={`chip ${s.origen === 'api' ? 'ok' : 'rev'}`} title={s.detalle}>
            {s.cargando ? 'Leyendo la planilla…' : s.origen === 'api' ? 'Planilla en vivo' : 'Copia'}
          </span>
        </div>
        <div className="controles-barra">
          <select aria-label="Barrio" value={s.barrio} onChange={(e) => s.setBarrio(e.target.value)}>
            {barrios.map((b) => (
              <option key={String(b.ID_Barrio)} value={String(b.ID_Barrio)}>
                {String(b.Nombre)}
              </option>
            ))}
          </select>
          <Clave />
          <button onClick={() => A && descargarExcel(pestanas, `Auditoria_${s.barrio}_${A.meses.at(-1) ?? ''}.xlsx`)} disabled={!pestanas.length}>
            Excel
          </button>
          <button onClick={() => window.print()}>PDF</button>
          <select aria-label="Tema" value={s.tema} onChange={(e) => s.setTema(e.target.value as never)}>
            <option value="sistema">Tema auto</option>
            <option value="claro">Claro</option>
            <option value="oscuro">Oscuro</option>
          </select>
        </div>
      </header>
      <nav className="pestanas" aria-label="Secciones">
        <button className={`destacada ${s.tab === 'expensa' ? 'activa' : ''}`} onClick={() => s.setTab('expensa')}>
          Expensa nueva
        </button>
        <span className="sep" />
        {pestanas.map((p) => (
          <button key={p.id} className={actual?.id === p.id ? 'activa' : ''} onClick={() => s.setTab(p.id)} title={p.corto}>
            {p.titulo}
          </button>
        ))}
        <span className="sep" />
        {HERRAMIENTAS.filter((h) => h.id !== 'expensa').map((h) => (
          <button key={h.id} className={`herr ${s.tab === h.id ? 'activa' : ''}`} onClick={() => s.setTab(h.id)}>
            {h.titulo}
          </button>
        ))}
      </nav>
      <main>
        {s.origen === 'copia' && (
          <p className="aviso rev small banner-origen">
            {s.cargando ? 'Leyendo la planilla… (la primera vez puede tardar hasta un minuto). Mientras tanto se ve la copia incluida.' : s.detalle}{' '}
            {!s.cargando && (
              <button className="link" onClick={() => s.recargar()}>
                Reintentar
              </button>
            )}
          </p>
        )}
        {A && !A.meses.length && !herr && <p className="aviso">Este barrio todavía no tiene liquidaciones cargadas. Usá "Cargar expensa".</p>}
        {herr ? (
          <herr.C />
        ) : (
          actual &&
          A && (
            <div className="pila">
              {actual.id === 'resumen' && <Novedades lista={A.novedades} mes={A.meses.at(-1)!} />}
              {actual.id === 'matriz' && <GrillaRiesgo M={A.matriz} />}
              {actual.tablas.map((t) => (
                <Tabla key={t.id} t={t} />
              ))}
            </div>
          )
        )}
      </main>
      <footer className="pie muted xs">
        Las observaciones son indicadores para revisar, no acusaciones. No se publican nombres de propietarios, deuda por lote ni CUIT de personas físicas. · {s.detalle}
      </footer>
    </div>
  );
}

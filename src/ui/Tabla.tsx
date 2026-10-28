import { useState } from 'react';
import type { TablaT } from '../vistas/tablas';
import { variaciones } from '../vistas/tablas';
import { fmt, fmtVar } from './formato';

export function Tabla({ t }: { t: TablaT }) {
  const [conVar, setConVar] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1100);
  const muestraVar = t.conVariacion && conVar;
  const nCols = t.columnas.length;
  const hayNota = t.filas.some((f) => f.nota);
  return (
    <section className="card" id={t.id}>
      <header className="card-cab">
        <div>
          <h2>{t.titulo}</h2>
          {t.bajada && <p className="muted small">{t.bajada}</p>}
        </div>
        {t.conVariacion && (
          <label className="chk small">
            <input type="checkbox" checked={conVar} onChange={(e) => setConVar(e.target.checked)} /> Variación mes a mes
          </label>
        )}
      </header>
      <div className={`tabla-caja${t.compacta ? ' compacta' : ''}`}>
        <table className={`tabla${(t.ancho ?? 40) <= 12 ? ' angosta' : ''}${t.columnas.length > 8 ? ' densa' : ''}`}>
          <thead>
            <tr>
              <th className="col-txt" style={{ minWidth: `${Math.min(t.ancho ?? 40, 64) * 0.5}em` }}>
                {t.formatos ? '' : 'Concepto'}
              </th>
              {t.columnas.map((c, j) => (
                <th key={c} className={t.formatos?.[j] === 'text' ? 'izq' : ''} style={t.anchos?.[j] ? { minWidth: `${t.anchos[j]}em` } : undefined}>
                  {c}
                </th>
              ))}
              {muestraVar && t.columnas.slice(1).map((c) => <th key={'v' + c} className="var">Var. {c.slice(0, 2)}</th>)}
              {hayNota && <th>Nota</th>}
            </tr>
          </thead>
          <tbody>
            {t.filas.map((f, i) =>
              f.estilo === 'seccion' ? (
                <tr key={i} className="seccion">
                  <td colSpan={1 + nCols + (muestraVar ? nCols - 1 : 0) + (hayNota ? 1 : 0)}>{f.texto}</td>
                </tr>
              ) : (
                <tr key={i} className={f.estilo ?? ''} id={f.id ? `fila-${f.id}` : undefined}>
                  <td className="col-txt">
                    {f.texto}
                    {f.fuente && <span className="fuente"> · {f.fuente}</span>}
                  </td>
                  {t.columnas.map((_, j) => {
                    const fo = t.formatos?.[j] ?? f.formato ?? 'money';
                    const v = f.valores[j];
                    const txt = fo === 'text' || typeof v === 'string';
                    return (
                      <td key={j} className={[txt ? 'txt' : 'num', f.celdas?.[j] ?? '', typeof v === 'number' && v < 0 && fo === 'money' ? 'neg' : ''].join(' ')}>
                        {fmt(v ?? null, fo)}
                      </td>
                    );
                  })}
                  {muestraVar &&
                    (f.variacion ? variaciones(f.valores).map((v, j) => <td key={'v' + j} className="num var">{fmtVar(v)}</td>) : t.columnas.slice(1).map((_, j) => <td key={'v' + j} className="var" />))}
                  {hayNota && <td className="nota">{f.nota ?? ''}</td>}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {!!t.notas?.length && (
        <div className="notas">
          <h3>Notas</h3>
          <ol>
            {t.notas.map((n) => (
              <li key={n.num} value={n.num}>
                {n.texto}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

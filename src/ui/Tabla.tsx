import { useState } from 'react';
import type { TablaT } from '../vistas/tablas';
import { variaciones } from '../vistas/tablas';
import { fmt, fmtVar } from './formato';

export function Tabla({ t }: { t: TablaT }) {
  const [conVar, setConVar] = useState(false);
  const muestraVar = t.conVariacion && conVar;
  const nCols = t.columnas.length;
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
      <div className="tabla-caja">
        <table className="tabla">
          <thead>
            <tr>
              <th className="col-txt" style={{ minWidth: `${Math.min(t.ancho ?? 40, 64) * 0.5}em` }}>
                {t.formatos ? '' : 'Concepto'}
              </th>
              {t.columnas.map((c) => (
                <th key={c}>{c}</th>
              ))}
              {muestraVar && t.columnas.slice(1).map((c) => <th key={'v' + c} className="var">Var. {c.slice(0, 2)}</th>)}
              {t.filas.some((f) => f.nota) && <th>Nota</th>}
            </tr>
          </thead>
          <tbody>
            {t.filas.map((f, i) =>
              f.estilo === 'seccion' ? (
                <tr key={i} className="seccion">
                  <td colSpan={1 + nCols + (muestraVar ? nCols - 1 : 0) + (t.filas.some((x) => x.nota) ? 1 : 0)}>{f.texto}</td>
                </tr>
              ) : (
                <tr key={i} className={f.estilo ?? ''}>
                  <td className="col-txt">{f.texto}</td>
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
                  {t.filas.some((x) => x.nota) && <td className="nota">{f.nota ?? ''}</td>}
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

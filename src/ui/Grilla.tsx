import { Fragment } from 'react';

/** Baja hasta la fila de la observación en la tabla y la resalta un momento. */
export function irAFila(codigo: string) {
  const tr = document.getElementById(`fila-${codigo}`);
  if (!tr) return;
  tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tr.classList.remove('destello');
  void (tr as HTMLElement).offsetWidth;
  tr.classList.add('destello');
}
import type { Analisis } from '../motor/analisis';

export function GrillaRiesgo({ M }: { M: Analisis['matriz'] }) {
  return (
    <section className="card">
      <h2>Matriz de riesgo: probabilidad × impacto</h2>
      <p className="muted small">
        {M.porPrioridad[0].cantidad} de {M.filas.length} observaciones son a la vez muy probables y de impacto alto: son las que hay que reclamar primero.
      </p>
      <div className="grilla-riesgo">
        <div />
        {['Probabilidad baja', 'Probabilidad media', 'Probabilidad alta'].map((t) => (
          <div key={t} className="eje">
            {t}
          </div>
        ))}
        {M.grilla.map((fila) => (
          <Fragment key={fila.impacto}>
            <div className="eje lado">
              Impacto {fila.impacto.toLowerCase()}
            </div>
            {fila.celdas.map((c) => (
              <div key={fila.impacto + c.probabilidad} className={`celda p${c.puntaje === 9 ? 'r' : c.puntaje === 6 ? 'a' : 'g'}`}>
                {c.codigos.map((k) => (
                  <button key={k} className="codigo" onClick={() => irAFila(k)} title="Ver la observación">
                    {k}
                  </button>
                ))}
                {c.resueltos.map((k) => (
                  <span key={k} className="codigo resuelto" title="Resuelto">
                    {k} ✓
                  </span>
                ))}
                {!c.codigos.length && !c.resueltos.length && <span className="muted">—</span>}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <p className="muted xs">Tocá un código para ir a la observación. Rojo: urgente (probabilidad alta e impacto alto). Ámbar: prioridad alta. Gris: media o baja. Probabilidad: que se repita o siga afectando en los próximos meses.</p>
    </section>
  );
}

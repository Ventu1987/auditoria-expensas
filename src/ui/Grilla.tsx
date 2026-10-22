import { Fragment } from 'react';
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
                  <span key={k} className="codigo">
                    {k}
                  </span>
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
      <p className="muted xs">Rojo: urgente (probabilidad alta e impacto alto). Ámbar: prioridad alta. Gris: media o baja. Probabilidad: que se repita o siga afectando en los próximos meses.</p>
    </section>
  );
}

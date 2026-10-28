import { useState } from 'react';
import { colorNovedad, type Novedad } from '../motor/analisis';
import { guardar } from '../data/api';
import { useApp } from '../estado';
import { mesLargo, pesos } from './formato';

function Aclaracion({ n, mes }: { n: Novedad; mes: string }) {
  const { barrio, clave, recargar } = useApp();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(n.aclaracion ?? '');
  const [ocupado, setOcupado] = useState(false);
  if (!editando)
    return (
      <>
        {n.aclaracion && <div className="acl">{n.aclaracion}</div>}
        {clave && (
          <button className="link xs" onClick={() => setEditando(true)}>
            {n.aclaracion ? 'editar aclaración' : '+ aclarar'}
          </button>
        )}
      </>
    );
  return (
    <div>
      <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por qué pasa esto, con montos" />
      <button
        className="primario"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          const id = n.idNota ?? `${barrio}-NOV-${mes}-${n.clave.replace(/[^\w]+/g, '_').slice(0, 40)}`;
          const r = await guardar(barrio, clave, 'NOTAS', [{ ID_Nota: id, Barrio: barrio, Ambito: `NOVEDAD:${mes}:${n.clave}`, Num: 1, Texto: texto }]);
          setOcupado(false);
          if (!r.ok) return alert(r.error);
          setEditando(false);
          await recargar();
        }}
      >
        Guardar
      </button>{' '}
      <button onClick={() => setEditando(false)}>Cancelar</button>
    </div>
  );
}

export function TablaNovedades({ lista, mes, editable = true }: { lista: Novedad[]; mes: string; editable?: boolean }) {
  if (!lista.length) return null;
  return (
    <div className="tabla-caja">
      <table className="tabla nov">
        <thead>
          <tr>
            <th className="col-txt">Novedad</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((n, i) => {
            const col = colorNovedad(n.importe);
            return (
              <tr key={i} className={n.tipo === 'cuota' ? 'cuota' : ''}>
                <td className="col-txt">
                  <span className={`punto ${col}`} />
                  {n.texto}
                  {editable ? <Aclaracion n={n} mes={mes} /> : n.aclaracion && <div className="acl">{n.aclaracion}</div>}
                </td>
                <td className={`monto ${col}`}>{n.importe === undefined ? '' : pesos(n.importe)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Novedades({ lista, mes }: { lista: Novedad[]; mes: string }) {
  if (!lista.length) return null;
  return (
    <section className="card">
      <h2>Novedades de {mesLargo(mes)}</h2>
      <p className="muted small">
        Contra el mes anterior, de mayor a menor monto. <span className="punto mas" />más de $ 100.000 · <span className="punto rev" />hasta $ 99.999,99 ·{' '}
        <span className="punto ok" />bajas. Al final, la cuota del lote común.
      </p>
      <TablaNovedades lista={lista} mes={mes} />
    </section>
  );
}

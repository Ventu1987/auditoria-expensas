import { useState } from 'react';
import type { Fila, Hoja } from '../data/esquema';
import { guardar } from '../data/api';
import { etiqueta } from '../motor/base';
import { TIPOS_RESPALDO } from '../motor/analisis';
import { useApp } from '../estado';
import { mesLargo, pesos } from '../ui/formato';

const aNum = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const aTxt = (n: unknown) => (n === '' || n === undefined || n === null ? '' : String(n).replace('.', ','));

function useGuardar() {
  const { barrio, clave, recargar } = useApp();
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function g(hoja: Hoja, filas: Fila[]) {
    setOcupado(true);
    setMsg('');
    const r = await guardar(barrio, clave, hoja, filas);
    setOcupado(false);
    if (!r.ok) return setMsg(r.error ?? 'Error');
    setMsg('Guardado.');
    await recargar();
  }
  return { g, msg, ocupado };
}

function Correcciones() {
  const { base, barrio, clave } = useApp();
  const meses = [...new Set(base!.GASTOS.filter((g) => g.Barrio === barrio).map((g) => String(g.Mes)))].sort().reverse();
  const [mes, setMes] = useState(meses[0] ?? '');
  const [cambios, setCambios] = useState<Record<string, Fila>>({});
  const { g, msg, ocupado } = useGuardar();
  const gastos = base!.GASTOS.filter((x) => x.Barrio === barrio && x.Mes === mes);
  const corr = (id: string) => cambios[id] ?? base!.CORRECCIONES.find((k) => k.ID_Gasto === id);
  const set = (gasto: Fila, campo: string, valor: string | number) => {
    const id = String(gasto.ID_Gasto);
    const actual = corr(id) ?? { ID_Correccion: `K-${id}`, Barrio: barrio, Mes: mes, ID_Gasto: id, Concepto: gasto.Concepto, Importe_Liquidado: gasto.Importe, Importe_Correcto: gasto.Importe, Criterio: '', Detalle: '', Es_Estimado: 'NO', Estado: 'APLICADA', Origen: 'manual' };
    setCambios({ ...cambios, [id]: { ...actual, [campo]: valor, Origen: actual.Origen === 'semilla' ? 'semilla' : 'manual' } });
  };
  const resp: Record<string, Fila> = {};
  return (
    <section className="card">
      <h2>Liquidación correcta y respaldo</h2>
      <p className="muted small">El importe que corresponde a cada gasto y por qué. Solo cuentan las correcciones en estado APLICADA. El respaldo se calcula con los comprobantes, pero se puede fijar a mano.</p>
      <label>
        Mes{' '}
        <select value={mes} onChange={(e) => (setMes(e.target.value), setCambios({}))}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {mesLargo(m)}
            </option>
          ))}
        </select>
      </label>
      <div className="tabla-caja">
        <table className="tabla edit">
          <thead>
            <tr>
              <th className="col-txt">Gasto</th>
              <th>Liquidado</th>
              <th>Correcto</th>
              <th>Criterio</th>
              <th>Por qué</th>
              <th>Estado</th>
              <th>Respaldo</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((x) => {
              const k = corr(String(x.ID_Gasto));
              return (
                <tr key={String(x.ID_Gasto)} className={k?.Estado === 'SUGERIDA' ? 'rev' : ''}>
                  <td className="col-txt">{etiqueta(base!, String(x.Concepto))}</td>
                  <td className="num">{pesos(Math.round(Number(x.Importe) * 100))}</td>
                  <td>
                    <input inputMode="decimal" value={k ? aTxt(k.Importe_Correcto) : ''} placeholder="igual" onChange={(e) => set(x, 'Importe_Correcto', e.target.value === '' ? x.Importe : aNum(e.target.value))} />
                  </td>
                  <td>
                    <input className="corto" value={String(k?.Criterio ?? '')} onChange={(e) => set(x, 'Criterio', e.target.value)} placeholder="H23" />
                  </td>
                  <td>
                    <input value={String(k?.Detalle ?? '')} onChange={(e) => set(x, 'Detalle', e.target.value)} />
                  </td>
                  <td>
                    <select value={String(k?.Estado ?? '')} onChange={(e) => set(x, 'Estado', e.target.value)}>
                      <option value="">—</option>
                      <option>APLICADA</option>
                      <option>SUGERIDA</option>
                      <option>DESCARTADA</option>
                    </select>
                  </td>
                  <td>
                    <select
                      defaultValue={String(x.Respaldo_Tipo)}
                      onChange={(e) => {
                        resp[String(x.ID_Gasto)] = { ID_Gasto: x.ID_Gasto, Barrio: barrio, Respaldo_Tipo: Number(e.target.value) };
                        g('GASTOS', [resp[String(x.ID_Gasto)]]);
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((t) => (
                        <option key={t} value={t}>
                          {TIPOS_RESPALDO[t].nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="primario" disabled={!clave || ocupado || !Object.keys(cambios).length} onClick={() => g('CORRECCIONES', Object.values(cambios)).then(() => setCambios({}))}>
        Guardar correcciones ({Object.keys(cambios).length})
      </button>
      {msg && <span className="small"> {msg}</span>}
    </section>
  );
}

function Observaciones() {
  const { base, barrio, clave } = useApp();
  const [cambios, setCambios] = useState<Record<string, Fila>>({});
  const { g, msg, ocupado } = useGuardar();
  const hs = base!.HALLAZGOS.filter((h) => h.Barrio === barrio);
  const val = (h: Fila, k: string) => String((cambios[String(h.ID_Hallazgo)] ?? h)[k] ?? '');
  const set = (h: Fila, k: string, v: string | number) => setCambios({ ...cambios, [String(h.ID_Hallazgo)]: { ...(cambios[String(h.ID_Hallazgo)] ?? h), [k]: v } });
  const nuevo = () => {
    const n = hs.filter((h) => /^N-\d+$/.test(String(h.Codigo))).length + 1;
    const cod = `N-${String(n).padStart(2, '0')}`;
    const fila: Fila = { ID_Hallazgo: `${barrio}-${cod}-${Date.now() % 10000}`, Barrio: barrio, Codigo: cod, Titulo: 'Nueva observación', Gravedad: 'A REVISAR', Monto: '', Base_Monto: 'una vez', Probabilidad: 'Media', Estado_Reclamo: 'NUEVO', Fecha_Alta: new Date().toISOString().slice(0, 10), Publicable: 'SI' };
    g('HALLAZGOS', [fila]);
  };
  return (
    <section className="card">
      <h2>Observaciones (matriz de riesgo y pedido)</h2>
      <p className="muted small">Cambiá la probabilidad, el monto o el estado del reclamo: la matriz y el pedido se recalculan.</p>
      <div className="tabla-caja">
        <table className="tabla edit">
          <thead>
            <tr>
              <th>Código</th>
              <th className="col-txt">Problema</th>
              <th>Gravedad</th>
              <th>Monto</th>
              <th>Cómo se mide</th>
              <th>Probabilidad</th>
              <th>Estado del reclamo</th>
              <th>Qué pedir</th>
            </tr>
          </thead>
          <tbody>
            {hs.map((h) => (
              <tr key={String(h.ID_Hallazgo)}>
                <td className="txt">{String(h.Codigo)}</td>
                <td className="col-txt">
                  <input value={val(h, 'Titulo')} onChange={(e) => set(h, 'Titulo', e.target.value)} />
                </td>
                <td>
                  <select value={val(h, 'Gravedad')} onChange={(e) => set(h, 'Gravedad', e.target.value)}>
                    {['CRÍTICO', 'IMPORTANTE', 'A REVISAR', 'SIN INCONSISTENCIA'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input inputMode="decimal" className="medio" value={aTxt(val(h, 'Monto'))} onChange={(e) => set(h, 'Monto', e.target.value === '' ? '' : aNum(e.target.value))} />
                </td>
                <td>
                  <select value={val(h, 'Base_Monto')} onChange={(e) => set(h, 'Base_Monto', e.target.value)}>
                    {['por mes', 'una vez', 'saldo en riesgo', 'sin monto'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={val(h, 'Probabilidad')} onChange={(e) => set(h, 'Probabilidad', e.target.value)}>
                    {['Alta', 'Media', 'Baja'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={val(h, 'Estado_Reclamo')} onChange={(e) => set(h, 'Estado_Reclamo', e.target.value)}>
                    {[...new Set(['NUEVO', 'PENDIENTE DE RECLAMAR', 'RECLAMADO', 'RESPONDIDO PARCIALMENTE', 'RESPONDIDO SIN FUNDAMENTO', 'SIN RESPUESTA', 'SOLUCIONADO', 'DESCARTADO', val(h, 'Estado_Reclamo')])].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={val(h, 'Que_Pedir')} onChange={(e) => set(h, 'Que_Pedir', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fila-botones">
        <button className="primario" disabled={!clave || ocupado || !Object.keys(cambios).length} onClick={() => g('HALLAZGOS', Object.values(cambios)).then(() => setCambios({}))}>
          Guardar cambios ({Object.keys(cambios).length})
        </button>
        <button disabled={!clave || ocupado} onClick={nuevo}>
          + Nueva observación
        </button>
        {msg && <span className="small">{msg}</span>}
      </div>
    </section>
  );
}

function Eventos() {
  const { barrio, clave } = useApp();
  const [d, setD] = useState({ Fecha: new Date().toISOString().slice(0, 10), Tipo: 'Reclamo', Hecho: '', Importe: '', Ref: '' });
  const { g, msg, ocupado } = useGuardar();
  return (
    <section className="card">
      <h2>Agregar a la cronología</h2>
      <div className="grilla-form">
        <label>
          Fecha
          <input type="date" value={d.Fecha} onChange={(e) => setD({ ...d, Fecha: e.target.value })} />
        </label>
        <label>
          Tipo
          <select value={d.Tipo} onChange={(e) => setD({ ...d, Tipo: e.target.value })}>
            {['Reclamo', 'Respuesta', 'Liquidación', 'Banco', 'Propietario', 'Asamblea', 'Otro'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="ancho">
          Qué pasó
          <input value={d.Hecho} onChange={(e) => setD({ ...d, Hecho: e.target.value })} />
        </label>
        <label>
          Importe
          <input inputMode="decimal" value={d.Importe} onChange={(e) => setD({ ...d, Importe: e.target.value })} />
        </label>
        <label>
          Ref.
          <input value={d.Ref} onChange={(e) => setD({ ...d, Ref: e.target.value })} placeholder="H19" />
        </label>
      </div>
      <button
        className="primario"
        disabled={!clave || ocupado || !d.Hecho}
        onClick={() => g('EVENTOS', [{ ID_Evento: `${barrio}-EV${Date.now()}`, Barrio: barrio, ...d, Importe: d.Importe ? aNum(d.Importe) : '', Origen: 'manual' }]).then(() => setD({ ...d, Hecho: '', Importe: '', Ref: '' }))}
      >
        Agregar
      </button>
      {msg && <span className="small"> {msg}</span>}
    </section>
  );
}

function Notas() {
  const { base, barrio, clave } = useApp();
  const [ambito, setAmbito] = useState('RESUMEN');
  const [cambios, setCambios] = useState<Record<string, Fila>>({});
  const { g, msg, ocupado } = useGuardar();
  const ambitos = [...new Set(['RESUMEN', 'FLUJO', 'ACUMULADO', 'RESPALDO', 'AHORROS', 'MATRIZ', 'PEDIDO', ...base!.GASTOS.filter((x) => x.Barrio === barrio).map((x) => `RUBRO_${x.Rubro_Num}`)])];
  const ns = base!.NOTAS.filter((n) => n.Ambito === ambito && (n.Barrio === barrio || n.Barrio === 'TODOS')).sort((a, b) => Number(a.Num) - Number(b.Num));
  return (
    <section className="card">
      <h2>Notas al pie</h2>
      <label>
        Sección{' '}
        <select value={ambito} onChange={(e) => (setAmbito(e.target.value), setCambios({}))}>
          {ambitos.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      {ns.map((n) => (
        <label key={String(n.ID_Nota)} className="nota-edit">
          ({String(n.Num)})
          <textarea rows={3} value={String((cambios[String(n.ID_Nota)] ?? n).Texto)} onChange={(e) => setCambios({ ...cambios, [String(n.ID_Nota)]: { ...n, Texto: e.target.value } })} />
        </label>
      ))}
      <div className="fila-botones">
        <button className="primario" disabled={!clave || ocupado || !Object.keys(cambios).length} onClick={() => g('NOTAS', Object.values(cambios)).then(() => setCambios({}))}>
          Guardar notas
        </button>
        <button
          disabled={!clave || ocupado}
          onClick={() => {
            const num = Math.max(0, ...ns.map((n) => Number(n.Num))) + 1;
            g('NOTAS', [{ ID_Nota: `${barrio}-${ambito}-${num}`, Barrio: barrio, Ambito: ambito, Num: num, Texto: 'Nota nueva' }]);
          }}
        >
          + Nota
        </button>
        {msg && <span className="small">{msg}</span>}
      </div>
    </section>
  );
}

export function Editar() {
  const { base, clave } = useApp();
  if (!base) return null;
  return (
    <div className="pila">
      {!clave && <p className="aviso rev">Para guardar cambios necesitás la clave del barrio.</p>}
      <Correcciones />
      <Observaciones />
      <Eventos />
      <Notas />
    </div>
  );
}

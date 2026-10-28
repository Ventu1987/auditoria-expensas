import { useEffect, useMemo, useState } from 'react';
import type { Fila } from '../data/esquema';
import { guardar } from '../data/api';
import { useApp } from '../estado';
import { expensaNueva, type ExpensaNueva as EN, type LineaExpensa } from '../motor/expensaNueva';
import { mesLargo, pesos } from '../ui/formato';

const pct = (x: number | null, signo = false) => (x === null ? '' : `${signo && x > 0 ? '+' : x < 0 ? '−' : ''}${(Math.round(Math.abs(x) * 1000) / 10).toString().replace('.', ',')}%`);
const conSigno = (c: number) => (c > 0 ? '+' : '') + pesos(c);
const millones = (c: number) => `$ ${(Math.abs(c) / 1e8).toFixed(1).replace('.', ',')} M`;
const fechaLarga = (f: string) => (f.length >= 10 ? `${Number(f.slice(8, 10))} de ${mesLargo(f.slice(0, 7)).replace(/ \d+$/, '')}` : f);
const aNum = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const aTxt = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));

const RESPALDO_ICONO: Record<number, [string, string]> = {
  1: ['ok', 'Con factura'],
  2: ['rev', 'Respaldo parcial'],
  3: ['mas', 'Sin factura'],
  4: ['rev', 'Factura citada, no presentada'],
  5: ['mas', 'Sin comprobante'],
};

interface Cambio {
  explicacion?: string;
  ahorrable?: boolean;
  ahorro?: string;
  notaAhorro?: string;
  correcto?: string;
}

// ---------------------------------------------------------------- flujo de caja: cascada

function Cascada({ F }: { F: EN['flujo'] }) {
  const pasos: { texto: string; desde: number; hasta: number; tipo: 'saldo' | 'mas' | 'menos' }[] = [];
  let acc = F.saldoInicial;
  pasos.push({ texto: 'Teníamos', desde: 0, hasta: acc, tipo: 'saldo' });
  for (const e of F.entradas) {
    pasos.push({ texto: e.texto, desde: acc, hasta: acc + e.valor, tipo: e.valor >= 0 ? 'mas' : 'menos' });
    acc += e.valor;
  }
  for (const s of F.salidas) {
    pasos.push({ texto: s.texto, desde: acc, hasta: acc + s.valor, tipo: s.valor >= 0 ? 'mas' : 'menos' });
    acc += s.valor;
  }
  pasos.push({ texto: 'Quedan', desde: 0, hasta: F.saldoFinal, tipo: 'saldo' });
  const max = Math.max(...pasos.map((p) => Math.max(p.desde, p.hasta)), 1);
  const min = Math.min(0, ...pasos.map((p) => Math.min(p.desde, p.hasta)));
  const W = 760;
  const H = 260;
  const top = 26;
  const bottom = 64;
  const y = (v: number) => top + ((max - v) / (max - min)) * (H - top - bottom);
  const bw = W / pasos.length;
  const color = { saldo: 'var(--accent)', mas: 'var(--ok)', menos: 'var(--mas)' };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cascada" role="img" aria-label="Cómo cambió la plata del barrio en el mes">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      {pasos.map((p, i) => {
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        const y1 = y(Math.max(p.desde, p.hasta));
        const h = Math.max(2, Math.abs(y(p.desde) - y(p.hasta)));
        const etiqueta = p.tipo === 'saldo' ? millones(p.hasta) : `${p.hasta >= p.desde ? '+' : '−'}${millones(p.hasta - p.desde).slice(0)}`;
        return (
          <g key={i}>
            {i > 0 && <line x1={x - bw * 0.36} x2={x} y1={y(p.desde)} y2={y(p.desde)} stroke="var(--muted)" strokeDasharray="3 3" />}
            <rect x={x} y={y1} width={w} height={h} rx={3} fill={color[p.tipo]} />
            <text x={x + w / 2} y={y1 - 6} textAnchor="middle" className="cas-val">
              {etiqueta}
            </text>
            <foreignObject x={i * bw + 2} y={H - bottom + 6} width={bw - 4} height={bottom - 6}>
              <div className="cas-txt">{p.texto}</div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- una línea de gasto

function Linea({ l, edit, cambio, onCambio }: { l: LineaExpensa; edit: boolean; cambio: Cambio; onCambio: (c: Cambio) => void }) {
  const [ico, txtResp] = RESPALDO_ICONO[l.respaldo] ?? ['mas', ''];
  const ahorrable = cambio.ahorrable ?? l.ahorrable;
  const correctoEditable = edit && l.idsGasto.length === 1;
  const difCorr = l.correcto !== null && l.correcto !== l.actual ? l.correcto : null;
  return (
    <div className={`en-linea${ahorrable ? ' ahorrable' : ''}`}>
      <div className="en-concepto">
        <div className="en-nombre">
          {l.etiqueta} <span className={`en-resp ${ico}`} title={txtResp}>{txtResp}</span>
        </div>
        {l.queEs && <div className="en-quees">{l.queEs}</div>}
        {l.proveedor && <div className="en-prov">{l.proveedor}</div>}
      </div>
      <div className="en-num en-ant">
        <span className="en-lbl">Mes anterior</span>
        {l.anterior === null ? '—' : pesos(l.anterior)}
      </div>
      <div className="en-num en-act">
        <span className="en-lbl">Este mes</span>
        {pesos(l.actual)}
        {(difCorr !== null || correctoEditable) && (
          <div className="en-corr">
            {correctoEditable ? (
              <label>
                correspondería{' '}
                <input inputMode="decimal" value={cambio.correcto ?? aTxt(l.correcto ?? l.actual)} onChange={(e) => onCambio({ ...cambio, correcto: e.target.value })} />
              </label>
            ) : (
              <>correspondería {pesos(difCorr!)}</>
            )}
          </div>
        )}
      </div>
      <div className={`en-num en-var ${l.variacion === null ? '' : l.variacion > 0 ? 'sube' : l.variacion < 0 ? 'baja' : ''}`}>
        <span className="en-lbl">Variación</span>
        {l.variacion === null ? <span className="en-nuevo">nuevo</span> : l.variacion === 0 ? 'igual' : (
          <>
            {conSigno(l.variacion)}
            <small>{pct(l.variacionPct, true)}</small>
          </>
        )}
      </div>
      <div className="en-porque">
        <span className="en-lbl">Por qué</span>
        {edit ? (
          <textarea rows={3} value={cambio.explicacion ?? l.explicacion} onChange={(e) => onCambio({ ...cambio, explicacion: e.target.value })} />
        ) : (
          <p>{l.explicacion}</p>
        )}
        {edit && l.explicacionAuto && cambio.explicacion === undefined && <span className="xs muted">Texto automático: editalo si querés.</span>}
      </div>
      <div className="en-ahorro">
        {edit ? (
          <>
            <label className="chk small">
              <input type="checkbox" checked={ahorrable} onChange={(e) => onCambio({ ...cambio, ahorrable: e.target.checked })} /> Se puede ahorrar
            </label>
            {ahorrable && (
              <>
                <input inputMode="decimal" placeholder="Ahorro por mes" value={cambio.ahorro ?? aTxt(l.ahorro)} onChange={(e) => onCambio({ ...cambio, ahorro: e.target.value })} />
                <input placeholder="Cómo (opcional)" value={cambio.notaAhorro ?? l.notaAhorro} onChange={(e) => onCambio({ ...cambio, notaAhorro: e.target.value })} />
              </>
            )}
          </>
        ) : (
          ahorrable && (
            <span className="en-chip-ahorro" title={l.notaAhorro}>
              Se puede ahorrar{l.ahorro ? ` ${pesos(l.ahorro)}` : ''}
            </span>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pantalla

export function ExpensaNueva() {
  const { base, barrio, clave, origen, recargar } = useApp();
  const conClave = !!clave;
  const publicados = useMemo(
    () => new Set((base?.EXPENSA_ESTADO ?? []).filter((x) => x.Barrio === barrio && x.Estado === 'PUBLICADA').map((x) => String(x.Mes))),
    [base, barrio],
  );
  const mesesTodos = useMemo(() => {
    if (!base) return [];
    const P = base.PERIODOS.filter((p) => p.Barrio === barrio).map((p) => String(p.Mes));
    const G = new Set(base.GASTOS.filter((g) => g.Barrio === barrio && Number(g.Importe)).map((g) => String(g.Mes)));
    return [...new Set(P)].filter((m) => G.has(m)).sort();
  }, [base, barrio]);
  // sin clave se ven solo los meses publicados (en la copia de demostración, todos)
  const visibles = conClave || origen === 'copia' ? mesesTodos : mesesTodos.filter((m) => publicados.has(m));
  const [mes, setMes] = useState('');
  useEffect(() => {
    if (!visibles.includes(mes)) setMes(visibles.at(-1) ?? '');
  }, [visibles.join(), mes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [edit, setEdit] = useState(false);
  const [cambios, setCambios] = useState<Record<string, Cambio>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const E = useMemo(() => (base && mes ? expensaNueva(base, barrio, mes) : null), [base, barrio, mes]);

  if (!base) return null;
  if (!E)
    return (
      <section className="card">
        <h2>Expensa nueva</h2>
        <p className="muted">{mesesTodos.length ? 'Todavía no hay una expensa publicada para este barrio.' : 'Este barrio todavía no tiene liquidaciones cargadas.'}</p>
      </section>
    );

  const lineas = E.rubros.flatMap((r) => r.lineas);
  const nCambios = Object.keys(cambios).length + (mensaje !== null ? 1 : 0);

  async function guardarTodo(estadoNuevo?: string) {
    if (!E) return;
    setOcupado(true);
    setMsg('Guardando…');
    try {
      const filasEN: Fila[] = [];
      const filasK: Fila[] = [];
      for (const [id, c] of Object.entries(cambios)) {
        const l = lineas.find((x) => x.id === id)!;
        filasEN.push({
          ID_Linea: l.id, Barrio: barrio, Mes: E.mes, Concepto: l.concepto,
          Explicacion: c.explicacion !== undefined ? (c.explicacion.trim() === (l.explicacionAuto ? l.explicacion : '').trim() ? '' : c.explicacion) : l.explicacionAuto ? '' : l.explicacion,
          Ahorrable: (c.ahorrable ?? l.ahorrable) ? 'SI' : 'NO',
          Ahorro_Estimado: c.ahorro !== undefined ? (c.ahorro ? aNum(c.ahorro) : '') : l.ahorro === null ? '' : l.ahorro / 100,
          Nota_Ahorro: c.notaAhorro ?? l.notaAhorro,
        });
        if (c.correcto !== undefined && l.idsGasto.length === 1) {
          const v = aNum(c.correcto);
          const previa = base!.CORRECCIONES.find((k) => k.ID_Gasto === l.idsGasto[0]);
          filasK.push({
            ...(previa ?? {}), ID_Correccion: previa?.ID_Correccion ?? `K-${l.idsGasto[0]}`, Barrio: barrio, Mes: E.mes, ID_Gasto: l.idsGasto[0], Concepto: l.concepto,
            Importe_Liquidado: l.actual / 100, Importe_Correcto: v, Estado: 'APLICADA', Origen: previa?.Origen ?? 'expensa nueva',
          });
        }
      }
      if (filasEN.length) {
        const r = await guardar(barrio, clave, 'EXPENSA_NUEVA', filasEN);
        if (!r.ok) throw new Error(r.error);
      }
      if (filasK.length) {
        const r = await guardar(barrio, clave, 'CORRECCIONES', filasK);
        if (!r.ok) throw new Error(r.error);
      }
      if (mensaje !== null || estadoNuevo) {
        const r = await guardar(barrio, clave, 'EXPENSA_ESTADO', [
          {
            ID_Expensa: `${barrio}-${E.mes}`, Barrio: barrio, Mes: E.mes, Estado: estadoNuevo ?? E.estado, Mensaje: mensaje ?? E.mensaje,
            Fecha_Publicacion: estadoNuevo === 'PUBLICADA' ? new Date().toISOString().slice(0, 10) : E.fechaPublicacion,
          },
        ]);
        if (!r.ok) throw new Error(r.error);
      }
      setCambios({});
      setMensaje(null);
      setMsg(estadoNuevo === 'PUBLICADA' ? 'Publicada: ya la ven todos.' : estadoNuevo === 'BORRADOR' ? 'Volvió a borrador.' : 'Guardado.');
      await recargar();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function imprimir() {
    setEdit(false);
    document.body.classList.add('imprime-expensa');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('imprime-expensa');
    }, 150);
  }

  const F = E.flujo;
  const difCuota = E.cuotaAnt === null ? null : E.cuota - E.cuotaAnt;

  return (
    <div className="pila expensa-nueva">
      <section className="card en-barra no-print">
        <label>
          Mes{' '}
          <select value={mes} onChange={(e) => (setMes(e.target.value), setCambios({}), setMensaje(null))}>
            {[...visibles].reverse().map((m) => (
              <option key={m} value={m}>
                {mesLargo(m)}
                {conClave ? (publicados.has(m) ? ' · publicada' : ' · borrador') : ''}
              </option>
            ))}
          </select>
        </label>
        <span className={`chip ${E.estado === 'PUBLICADA' ? 'ok' : 'rev'}`}>{E.estado === 'PUBLICADA' ? `Publicada${E.fechaPublicacion ? ` el ${fechaLarga(E.fechaPublicacion)}` : ''}` : 'Borrador'}</span>
        <span className="sep-flex" />
        {conClave && (
          <label className="chk small">
            <input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} /> Editar
          </label>
        )}
        {conClave && nCambios > 0 && (
          <button className="primario" disabled={ocupado} onClick={() => guardarTodo()}>
            Guardar cambios ({nCambios})
          </button>
        )}
        {conClave && E.estado !== 'PUBLICADA' && (
          <button disabled={ocupado} onClick={() => guardarTodo('PUBLICADA')}>
            Publicar
          </button>
        )}
        {conClave && E.estado === 'PUBLICADA' && (
          <button disabled={ocupado} onClick={() => guardarTodo('BORRADOR')}>
            Volver a borrador
          </button>
        )}
        <button onClick={imprimir}>Descargar PDF</button>
        {msg && <span className="small">{msg}</span>}
      </section>

      {/* 1 · tu expensa */}
      <section className="card en-hero">
        <div className="en-hero-txt">
          <p className="en-kicker">
            {E.nombre} · Expensa de {mesLargo(E.mes)} · lote común
          </p>
          <p className="en-cuota">{pesos(E.cuota)}</p>
          <p className="en-sub">
            {E.vencimiento && <>Vence el {fechaLarga(E.vencimiento)}{E.recargo ? `; después, ${pct(E.recargo)} de recargo` : ''}. </>}
            {difCuota !== null && (
              <>
                {difCuota === 0 ? 'Igual que el mes anterior.' : `${difCuota > 0 ? 'Sube' : 'Baja'} ${pesos(Math.abs(difCuota))} (${pct(difCuota / E.cuotaAnt!)}) respecto de ${mesLargo(E.anterior!).replace(/ \d+$/, '')}`}
                {E.principal && difCuota !== 0 && <>, sobre todo por {E.principal.nuevo ? `un gasto nuevo: ${E.principal.etiqueta.toLowerCase()}` : `${E.principal.etiqueta.toLowerCase()} (${conSigno(E.principal.variacion)})`}.</>}
              </>
            )}
          </p>
          {E.cuotaCorrecta !== null && E.cuotaCorrecta !== E.cuota && (
            <p className="en-correcta">
              Según la revisión de los comprobantes, correspondería {pesos(E.cuotaCorrecta)} ({conSigno(E.cuotaCorrecta - E.cuota)}).
            </p>
          )}
          {E.reducida !== null && (
            <p className="xs muted">
              Lote de coeficiente reducido: {pesos(E.reducida)}. {E.particulares ? `Además, ${E.lotesConParticulares ?? 'algunos'} lotes pagan cargos particulares (canon de obra y otros) por ${pesos(E.particulares)} en total.` : ''}
            </p>
          )}
        </div>
        {(edit || E.mensaje || mensaje) && (
          <div className="en-mensaje">
            {edit ? (
              <textarea rows={4} placeholder="Mensaje para los propietarios (opcional)" value={mensaje ?? E.mensaje} onChange={(e) => setMensaje(e.target.value)} />
            ) : (
              <p>{E.mensaje}</p>
            )}
          </div>
        )}
      </section>

      {/* 2 · de cada $100 */}
      <section className="card">
        <h2>De cada $ 100 de gastos, adónde van</h2>
        <div className="en-peso">
          {[...E.peso].sort((a, b) => b.valor - a.valor).map((p) => (
            <div key={p.nombre} className="en-peso-fila">
              <span className="en-peso-nom">{p.nombre}</span>
              <span className="en-peso-barra">
                <span style={{ width: `${Math.max(0.5, p.pct * 100)}%` }} />
              </span>
              <span className="en-peso-val">$ {Math.round(p.pct * 100)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3 · rubro por rubro */}
      <section className="card">
        <h2>Los gastos del mes, rubro por rubro</h2>
        <p className="muted small">
          En grande, lo que liquidó la administración. En chico, lo que correspondería según la revisión de los comprobantes, cuando es distinto. Al lado de cada gasto, si tiene factura.
        </p>
        {E.rubros.map((r) => (
          <div key={r.num} className="en-rubro">
            <div className="en-rubro-cab">
              <h3>
                {r.num}. {r.nombre}
              </h3>
              <div className="en-rubro-tot">
                {pesos(r.total)}
                {r.anterior !== null && r.anterior !== r.total && <small className={r.total > r.anterior ? 'sube' : 'baja'}> {pct((r.total - r.anterior) / Math.abs(r.anterior), true)}</small>}
                {r.correcto !== null && r.correcto !== r.total && <div className="en-corr">correspondería {pesos(r.correcto)}</div>}
              </div>
            </div>
            {r.lineas.map((l) => (
              <Linea key={l.id} l={l} edit={edit} cambio={cambios[l.id] ?? {}} onCambio={(c) => setCambios({ ...cambios, [l.id]: c })} />
            ))}
          </div>
        ))}
        <div className="en-total">
          <div>
            <strong>Total de gastos del mes</strong>
            {E.totalAnterior !== null && <div className="xs muted">Mes anterior: {pesos(E.totalAnterior)} ({pct((E.totalGastos - E.totalAnterior) / E.totalAnterior, true)})</div>}
          </div>
          <div className="en-num">
            {pesos(E.totalGastos)}
            {E.totalCorrecto !== null && E.totalCorrecto !== E.totalGastos && <div className="en-corr">correspondería {pesos(E.totalCorrecto)}</div>}
          </div>
        </div>
      </section>

      {/* 4 · cómo se reparte */}
      <section className="card">
        <h2>Cómo se reparte entre los lotes</h2>
        <p>
          El gasto del mes se divide entre los {E.unidades ?? 'N/D'} lotes según su coeficiente. Cada lote común paga el {pct(E.coefPct)} del total repartido ({pesos(E.repartido)}): {pesos(E.cuota)}.
          {E.reducida !== null && E.reducidaCoef && <> El lote de coeficiente reducido paga el {Math.round(E.reducidaCoef * 100)}% de un lote común: {pesos(E.reducida)}.</>}
        </p>
        {E.repartido - E.totalGastos > 100000 && (
          <p className="aviso rev small">Este mes se repartió {pesos(E.repartido - E.totalGastos)} más que lo gastado. La liquidación no explica a qué se destina esa diferencia.</p>
        )}
      </section>

      {/* 5 · flujo de caja */}
      <section className="card">
        <h2>La plata del barrio este mes</h2>
        <p className="muted small">Como la cuenta de una casa: con cuánto empezamos, cuánto entró, cuánto salió y con cuánto terminamos.</p>
        <Cascada F={F} />
        <div className="en-flujo">
          <div className="en-flujo-fila fuerte">
            <span>Teníamos en el banco al empezar el mes</span>
            <span>{pesos(F.saldoInicial)}</span>
          </div>
          <div className="en-flujo-grupo">Entró</div>
          {F.entradas.map((e) => (
            <div key={e.texto} className="en-flujo-fila">
              <span>{e.texto}</span>
              <span className="baja">+{pesos(e.valor)}</span>
            </div>
          ))}
          <div className="en-flujo-fila sub">
            <span>Total que entró</span>
            <span>+{pesos(F.entro)}</span>
          </div>
          <div className="en-flujo-grupo">Salió</div>
          {F.salidas.map((s) => (
            <div key={s.texto} className="en-flujo-fila">
              <span>
                {s.texto}
                {s.texto === 'Pagos a proveedores' && F.pagosAnteriores ? <span className="xs muted"> · incluye {pesos(F.pagosAnteriores)} de gastos de meses anteriores</span> : null}
              </span>
              <span className="sube">{pesos(s.valor)}</span>
            </div>
          ))}
          <div className="en-flujo-fila sub">
            <span>Total que salió</span>
            <span>{pesos(F.salio)}</span>
          </div>
          <div className="en-flujo-fila fuerte">
            <span>Quedan en el banco al cerrar el mes</span>
            <span>{pesos(F.saldoFinal)}</span>
          </div>
          {F.control !== 0 && <p className="aviso rev small">Las cuentas de la liquidación no cierran por {pesos(F.control)}.</p>}
        </div>
        {F.libre !== null && (
          <div className={`en-libre ${F.libre < 0 ? 'neg' : ''}`}>
            <h3>¿Cuánta de esa plata es realmente libre?</h3>
            <div className="en-flujo-fila">
              <span>Quedan en el banco</span>
              <span>{pesos(F.saldoFinal)}</span>
            </div>
            <div className="en-flujo-fila">
              <span>Menos lo que el barrio todavía les debe a los proveedores</span>
              <span>−{pesos(F.pendientes!)}</span>
            </div>
            {F.fondoExt ? (
              <div className="en-flujo-fila">
                <span>Menos el fondo para obras (extraordinario), que no se usa para gastos del mes</span>
                <span>−{pesos(F.fondoExt)}</span>
              </div>
            ) : null}
            <div className="en-flujo-fila fuerte">
              <span>{F.libre >= 0 ? 'Plata libre' : 'Faltante si hoy se pagara todo lo que se debe'}</span>
              <span>{pesos(F.libre)}</span>
            </div>
            {F.deudaVecinos !== null && (
              <p className="small">
                Del otro lado, {F.lotesConDeuda ?? 'algunos'} lotes deben {pesos(F.deudaVecinos)} de expensas{F.intereses ? ` y ${pesos(F.intereses)} de intereses` : ''}. Cuando paguen, esa plata entra a la cuenta
                {F.libre < 0 && F.deudaVecinos + (F.intereses ?? 0) >= -F.libre ? ' y alcanza para cubrir el faltante' : ''}.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 6 · dónde se puede ahorrar */}
      {E.ahorro.lineas.length > 0 && (
        <section className="card">
          <h2>Dónde se puede ahorrar</h2>
          <ul className="en-ahorros">
            {E.ahorro.lineas.map((l) => (
              <li key={l.id}>
                <span>
                  <strong>{l.etiqueta}</strong>
                  {l.notaAhorro && <span className="muted"> · {l.notaAhorro}</span>}
                </span>
                <span className="en-num">{l.ahorro ? `${pesos(l.ahorro)} por mes` : 'a estimar'}</span>
              </li>
            ))}
          </ul>
          <p className="en-total-ahorro">
            Ahorro posible: <strong>{pesos(E.ahorro.mensual)}</strong> por mes para el barrio, <strong>{pesos(E.ahorro.porLote)}</strong> por mes para cada lote común ({pesos(E.ahorro.porLote * 12)} por año).
          </p>
        </section>
      )}

      {/* 7 · observaciones pendientes */}
      {E.observaciones.length > 0 && (
        <section className="card en-obs">
          <h2>Temas pendientes con la administración</h2>
          <p className="muted small">Consultas y pedidos de documentación ya hechos a la administración que todavía no tienen una respuesta completa. Los más importantes primero.</p>
          <ul>
            {E.observaciones.map((o) => (
              <li key={o.codigo}>
                {o.titulo} <span className="xs muted">({o.estado})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="xs muted en-pie">
        Elaborado con la liquidación de la administración y los comprobantes disponibles. No incluye nombres de propietarios ni la deuda de cada lote.
      </p>
    </div>
  );
}

import { useState } from 'react';
import type { Fila } from '../data/esquema';
import { enviar, guardar, borrar, subirArchivo } from '../data/api';
import { respaldoSugerido, TIPOS_RESPALDO } from '../motor/analisis';
import { etiqueta } from '../motor/base';
import { useApp } from '../estado';
import { mesLargo, pesos } from '../ui/formato';

const TIPOS = ['FACTURA', 'EXTRACTO', 'PÓLIZA', 'BOLETA', 'PRESUPUESTO', 'TRANSFERENCIA', 'RECIBO', 'ORDEN DE PAGO', 'OTRO'];

function Formulario({ gasto, alGuardar }: { gasto: Fila; alGuardar: () => Promise<void> }) {
  const { barrio, clave } = useApp();
  const [f, setF] = useState<File | null>(null);
  const [d, setD] = useState({ Tipo: 'FACTURA', Es_Fiscal: 'SI', Emisor: '', CUIT_Emisor: '', Receptor: '', Numero: '', Fecha: '', Importe: '', Observacion: '' });
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setD({ ...d, [k]: v, ...(k === 'Tipo' ? { Es_Fiscal: /FACTURA|EXTRACTO|PÓLIZA|BOLETA/.test(v) ? 'SI' : 'NO' } : {}) });
  async function enviarlo() {
    setOcupado(true);
    setMsg('');
    try {
      const archivoId = f ? await subirArchivo(barrio, clave, 'comprobantes', String(gasto.Mes), f) : '';
      const fila: Fila = {
        ID_Comprobante: `${barrio}-${Date.now()}`, Barrio: barrio, Mes: String(gasto.Mes), ID_Gasto: String(gasto.ID_Gasto), ...d,
        Importe: d.Importe ? Number(d.Importe.replace(/\./g, '').replace(',', '.')) : '', Periodo_Servicio: '', Archivo_ID: archivoId, Subido_Por: barrio, Fecha_Carga: new Date().toISOString().slice(0, 10),
      };
      const r = await guardar(barrio, clave, 'COMPROBANTES', [fila]);
      if (!r.ok) throw new Error(r.error);
      // actualiza el tipo de respaldo del gasto con la sugerencia
      const base = useApp.getState().base!;
      const tipo = respaldoSugerido(gasto, [...base.COMPROBANTES, fila]);
      await guardar(barrio, clave, 'GASTOS', [{ ID_Gasto: String(gasto.ID_Gasto), Barrio: barrio, Respaldo_Tipo: tipo, Respaldo_Detalle: [d.Tipo, d.Numero, d.Emisor].filter(Boolean).join(' ') }]);
      setMsg('Guardado.');
      setF(null);
      await alGuardar();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="form-comp">
      <label className="boton-archivo small">
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setF(e.target.files?.[0] ?? null)} />
        {f ? f.name : 'Elegir archivo (PDF o foto)'}
      </label>
      <div className="grilla-form">
        <label>
          Tipo
          <select value={d.Tipo} onChange={(e) => set('Tipo', e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          ¿Es fiscal?
          <select value={d.Es_Fiscal} onChange={(e) => set('Es_Fiscal', e.target.value)}>
            <option>SI</option>
            <option>NO</option>
          </select>
        </label>
        <label>
          Emisor
          <input value={d.Emisor} onChange={(e) => set('Emisor', e.target.value)} placeholder="Empresa" />
        </label>
        <label>
          CUIT del emisor
          <input value={d.CUIT_Emisor} onChange={(e) => set('CUIT_Emisor', e.target.value)} placeholder="30-00000000-0" />
        </label>
        <label>
          A nombre de
          <input value={d.Receptor} onChange={(e) => set('Receptor', e.target.value)} placeholder="Barrio, Fideicomiso…" />
        </label>
        <label>
          Número
          <input value={d.Numero} onChange={(e) => set('Numero', e.target.value)} />
        </label>
        <label>
          Fecha
          <input type="date" value={d.Fecha} onChange={(e) => set('Fecha', e.target.value)} />
        </label>
        <label>
          Importe
          <input inputMode="decimal" value={d.Importe} onChange={(e) => set('Importe', e.target.value)} placeholder="1.234,56" />
        </label>
        <label className="ancho">
          Observación
          <input value={d.Observacion} onChange={(e) => set('Observacion', e.target.value)} />
        </label>
      </div>
      <button className="primario" disabled={!clave || ocupado} onClick={enviarlo}>
        {ocupado ? 'Guardando…' : 'Guardar comprobante'}
      </button>
      {msg && <span className="small"> {msg}</span>}
    </div>
  );
}

export function Comprobantes() {
  const { base, barrio, clave, recargar } = useApp();
  const meses = [...new Set((base?.GASTOS ?? []).filter((g) => g.Barrio === barrio).map((g) => String(g.Mes)))].sort().reverse();
  const [mes, setMes] = useState(meses[0] ?? '');
  const [abierto, setAbierto] = useState('');
  if (!base) return null;
  const gastos = base.GASTOS.filter((g) => g.Barrio === barrio && g.Mes === mes);
  async function verArchivo(id: string) {
    const r = await enviar<{ url: string }>({ accion: 'enlace', barrio, clave, archivoId: id });
    if (r.ok) window.open(r.url, '_blank', 'noopener');
    else alert(r.error);
  }
  return (
    <div className="pila">
      <section className="card">
        <h2>Comprobantes de cada gasto</h2>
        <p className="muted small">Subí la factura, el extracto o lo que haya de cada gasto. Con eso la app calcula sola el tipo de respaldo. Los archivos quedan en Drive, privados; solo se ven con la clave.</p>
        <label>
          Mes{' '}
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {mesLargo(m)}
              </option>
            ))}
          </select>
        </label>
      </section>
      {gastos.map((g) => {
        const cs = base.COMPROBANTES.filter((c) => c.ID_Gasto === g.ID_Gasto);
        const tipo = Number(g.Respaldo_Tipo) || respaldoSugerido(g, base.COMPROBANTES);
        return (
          <section className="card gasto" key={String(g.ID_Gasto)}>
            <header className="card-cab">
              <div>
                <h3>{etiqueta(base, String(g.Concepto))}</h3>
                <p className="muted xs">{String(g.Texto_Original)}</p>
              </div>
              <div className="der">
                <div className="num grande">{pesos(Math.round(Number(g.Importe) * 100))}</div>
                <span className={`chip t${tipo}`}>{TIPOS_RESPALDO[tipo]?.nombre}</span>
              </div>
            </header>
            {!!cs.length && (
              <ul className="comps">
                {cs.map((c) => (
                  <li key={String(c.ID_Comprobante)}>
                    <span className={c.Es_Fiscal === 'SI' ? 'ok' : 'mas'}>{String(c.Tipo)}</span> {String(c.Numero ?? '')} {String(c.Emisor ?? '')}{' '}
                    {c.Importe !== '' && <span className="num">{pesos(Math.round(Number(c.Importe) * 100))}</span>} <span className="muted xs">{String(c.Observacion ?? '')}</span>
                    {c.Archivo_ID && clave && (
                      <button className="link" onClick={() => verArchivo(String(c.Archivo_ID))}>
                        ver archivo
                      </button>
                    )}
                    {clave && String(c.Subido_Por) !== 'migración' && (
                      <button className="link" onClick={async () => (await borrar(barrio, clave, 'COMPROBANTES', String(c.ID_Comprobante)), recargar())}>
                        quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {abierto === g.ID_Gasto ? (
              <Formulario gasto={g} alGuardar={recargar} />
            ) : (
              <button disabled={!clave} onClick={() => setAbierto(String(g.ID_Gasto))}>
                + Agregar comprobante
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

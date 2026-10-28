import { useMemo, useState } from 'react';
import type { Base, Fila } from '../data/esquema';
import { enviar, subirArchivo } from '../data/api';
import { prepararCarga, type Preparada } from '../data/cargar';
import type { Extraida, ReglaConcepto } from '../parser/adminprop';
import { analizar } from '../motor/analisis';
import { pesos, mesLargo } from '../ui/formato';
import { useApp } from '../estado';
import { TablaNovedades } from '../ui/Novedades';

async function leerPdf(f: File): Promise<Extraida> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const { lineasDePdf } = await import('../parser/pdfTexto');
  const { leerLiquidacion } = await import('../parser/adminprop');
  return { ...leerLiquidacion(await lineasDePdf(new Uint8Array(await f.arrayBuffer()), pdfjs as never), reglasDe(useApp.getState().base)) };
}

function reglasDe(base: Base | null): ReglaConcepto[] | undefined {
  const cs = (base?.CONCEPTOS ?? []).filter((c) => c.Patron).sort((a, b) => Number(a.Orden) - Number(b.Orden));
  return cs.length ? cs.map((c) => ({ concepto: String(c.Concepto), patron: String(c.Patron) })) : undefined;
}

export function Cargar() {
  const { base, barrio, clave, recargar } = useApp();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ext, setExt] = useState<Extraida | null>(null);
  const [prep, setPrep] = useState<Preparada | null>(null);
  const [aplicar, setAplicar] = useState<Record<string, boolean>>({});
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conceptos = useMemo(() => (base?.CONCEPTOS ?? []).map((c) => String(c.Concepto)), [base]);

  // vista previa del análisis con el mes nuevo
  const previa = useMemo(() => {
    if (!prep || !base) return null;
    const nueva = Object.fromEntries(Object.entries(base).map(([h, fs]) => [h, (fs as Fila[]).filter((f) => !(f.Barrio === barrio && f.Mes === prep.mes && h !== 'HALLAZGOS'))])) as unknown as Base;
    for (const [h, fs] of Object.entries(prep.filas)) (nueva as unknown as Record<string, Fila[]>)[h] = [...(nueva as unknown as Record<string, Fila[]>)[h], ...(fs as Fila[])];
    try {
      return analizar(nueva, barrio).novedades;
    } catch {
      return [];
    }
  }, [prep, base, barrio]);

  if (!base) return null;
  const existe = prep && base.PERIODOS.some((p) => p.Barrio === barrio && p.Mes === prep.mes);

  async function leer(f: File) {
    setArchivo(f);
    setEstado({ tipo: 'info', texto: 'Leyendo el PDF…' });
    setExt(null);
    setPrep(null);
    try {
      const e = await leerPdf(f);
      if (!e.mes || !e.gastos.length) throw new Error('No parece una liquidación de AdminProp: no se encontraron el período ni los gastos.');
      let privados: string[] = [];
      if (clave) {
        const r = await enviar<{ nombres: string[] }>({ accion: 'privados', barrio, clave });
        if (r.ok) privados = r.nombres;
      }
      const p = prepararCarga(e, barrio, base!, privados);
      setExt(e);
      setPrep(p);
      setAplicar(Object.fromEntries((p.filas.CORRECCIONES ?? []).map((k) => [String(k.ID_Correccion), false])));
      setEstado(null);
    } catch (err) {
      setEstado({ tipo: 'error', texto: (err as Error).message });
    }
  }

  function cambiarGasto(id: string, campo: string, valor: string) {
    if (!prep) return;
    const gastos = (prep.filas.GASTOS ?? []).map((g) => (g.ID_Gasto === id ? { ...g, [campo]: valor } : g));
    setPrep({ ...prep, filas: { ...prep.filas, GASTOS: gastos } });
  }

  async function confirmar() {
    if (!prep || !archivo) return;
    setOcupado(true);
    setEstado({ tipo: 'info', texto: 'Subiendo el PDF a Drive…' });
    try {
      const archivoId = await subirArchivo(barrio, clave, 'liquidaciones', prep.mes, archivo);
      setEstado({ tipo: 'info', texto: 'Guardando en la planilla…' });
      const filas = { ...prep.filas, CORRECCIONES: (prep.filas.CORRECCIONES ?? []).map((k) => ({ ...k, Estado: aplicar[String(k.ID_Correccion)] ? 'APLICADA' : 'SUGERIDA' })) };
      const r = await enviar({ accion: 'cargarLiquidacion', barrio, clave, mes: prep.mes, filas, archivoId, reemplazar: !!existe, resumen: prep.resumen });
      if (!r.ok) throw new Error(r.error);
      setEstado({ tipo: 'ok', texto: `Listo: ${mesLargo(prep.mes)} quedó cargada (${(r as { filas?: number }).filas ?? 0} filas). Ahora podés subir los comprobantes.` });
      setExt(null);
      setPrep(null);
      await recargar();
    } catch (err) {
      setEstado({ tipo: 'error', texto: (err as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="pila">
      <section className="card">
        <h2>Cargar la liquidación del mes</h2>
        <p className="muted small">
          Elegí el PDF que manda la administración. La app lo lee en tu navegador, te muestra todo para revisar y recién cuando confirmás lo guarda en la planilla (y el PDF en
          Drive). No se guardan nombres de propietarios ni la deuda de cada lote.
        </p>
        {!clave && <p className="aviso rev">Para guardar necesitás la clave del barrio (arriba, en "Clave").</p>}
        <label className="boton-archivo">
          <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
          {archivo ? `Cambiar PDF (${archivo.name})` : 'Elegir PDF de la liquidación'}
        </label>
        {estado && <p className={`aviso ${estado.tipo === 'error' ? 'mas' : estado.tipo === 'ok' ? 'ok' : ''}`}>{estado.texto}</p>}
      </section>

      {ext && prep && (
        <>
          <section className="card">
            <h2>
              {mesLargo(prep.mes)} · {ext.barrioTexto || barrio}
            </h2>
            <p className="small">{prep.resumen}</p>
            {existe && <p className="aviso rev">Ese mes ya está cargado: al confirmar se reemplaza (las correcciones y comentarios hechos a mano se conservan).</p>}
            {ext.cuitConsorcio && base.BARRIOS.find((b) => b.ID_Barrio === barrio)?.CUIT_Consorcio && ext.barrioTexto && !new RegExp(barrio === 'S2' ? 'senderos 2|senderos ii' : barrio === 'S1' ? 'senderos 1|senderos i\\b' : 'huella', 'i').test(ext.barrioTexto) && (
              <p className="aviso mas">El PDF dice «{ext.barrioTexto}». ¿Elegiste bien el barrio?</p>
            )}
            <h3>Controles del documento</h3>
            <ul className="controles">
              {ext.controles.map((c) => (
                <li key={c.control} className={c.ok ? 'ok' : 'mas'}>
                  {c.ok ? '✓' : '✗'} {c.control}
                  {!c.ok && ` · documento ${pesos(c.documento)}, calculado ${pesos(c.calculado)}`}
                </li>
              ))}
            </ul>
            {!!prep.avisos.length && (
              <>
                <h3>A revisar</h3>
                <ul>{prep.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </>
            )}
            {!!previa?.length && (
              <>
                <h3>Novedades respecto del mes anterior</h3>
                <TablaNovedades lista={previa} mes={prep.mes} editable={false} />
              </>
            )}
          </section>

          <section className="card">
            <h2>Gastos leídos</h2>
            <p className="muted small">Revisá el concepto de cada gasto (es lo que permite compararlo mes a mes).</p>
            <div className="tabla-caja">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Rubro</th>
                    <th className="col-txt">Texto de la liquidación</th>
                    <th>Concepto</th>
                    <th>Importe</th>
                    <th>Estimado</th>
                    <th>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {(prep.filas.GASTOS ?? []).map((g) => (
                    <tr key={String(g.ID_Gasto)}>
                      <td className="txt">{String(g.Rubro_Num)}</td>
                      <td className="col-txt small">{String(g.Texto_Original)}</td>
                      <td>
                        <select value={String(g.Concepto)} onChange={(e) => cambiarGasto(String(g.ID_Gasto), 'Concepto', e.target.value)} className={g.Concepto === 'Otro (revisar)' ? 'rev' : ''}>
                          {[...new Set([...conceptos, String(g.Concepto)])].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="num">{pesos(Math.round(Number(g.Importe) * 100))}</td>
                      <td className="txt">{g.Es_Estimado === 'SI' ? 'Sí' : ''}</td>
                      <td className="txt small">{g.Estado_Pago === 'PENDIENTE' ? 'Pendiente' : 'Pagado'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!!prep.filas.CORRECCIONES?.length && (
            <section className="card">
              <h2>Correcciones sugeridas</h2>
              <p className="muted small">Salen de lo que se corrigió el mes anterior para el mismo concepto. Marcá las que querés aplicar ya; las demás quedan como sugeridas para revisar después.</p>
              <ul className="lista-chk">
                {prep.filas.CORRECCIONES.map((k) => (
                  <li key={String(k.ID_Correccion)}>
                    <label className="chk">
                      <input type="checkbox" checked={!!aplicar[String(k.ID_Correccion)]} onChange={(e) => setAplicar({ ...aplicar, [String(k.ID_Correccion)]: e.target.checked })} />
                      <span>
                        <b>{String(k.Concepto)}</b>: {pesos(Math.round(Number(k.Importe_Liquidado) * 100))} → {pesos(Math.round(Number(k.Importe_Correcto) * 100))} ({String(k.Criterio)}). <span className="muted">{String(k.Detalle)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card fila-botones">
            <button className="primario" disabled={!clave || ocupado} onClick={confirmar}>
              {ocupado ? 'Guardando…' : existe ? 'Confirmar y reemplazar el mes' : 'Confirmar y guardar'}
            </button>
            <button
              onClick={() => {
                setExt(null);
                setPrep(null);
                setArchivo(null);
              }}
            >
              Descartar
            </button>
          </section>
        </>
      )}
    </div>
  );
}

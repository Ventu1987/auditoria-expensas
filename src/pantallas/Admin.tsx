import { API } from '../data/api';
import { useApp } from '../estado';

export function Admin() {
  const { rol, origen, detalle } = useApp();
  return (
    <div className="pila">
      <section className="card">
        <h2>Configuración</h2>
        <dl className="defs">
          <dt>Planilla (API)</dt>
          <dd className="mono xs">{API || 'Sin configurar: la app muestra la copia incluida.'}</dd>
          <dt>Datos que se ven</dt>
          <dd>{origen === 'api' ? 'Planilla en vivo' : 'Copia incluida en la app'} · {detalle}</dd>
          <dt>Tu acceso</dt>
          <dd>{rol ? (rol === 'admin' ? 'Administración (todos los barrios)' : `Auditor de ${rol}`) : 'Solo lectura'}</dd>
        </dl>
      </section>
    </div>
  );
}

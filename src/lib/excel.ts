// Descarga a Excel de todas las pestañas (valores, con formato de moneda y colores).
import type { Pestana, TablaT } from '../vistas/tablas';
import { variaciones } from '../vistas/tablas';

const COLORES: Record<string, string> = { mas: 'FFFBE5E2', rev: 'FFFFF2CC', ok: 'FFE3F1E9', total: 'FFEEEEEE', seccion: 'FF24508F', gris: 'FFFFFFFF' };
const MON = '"$ "#,##0.00;[Red]-"$ "#,##0.00;"-"';

export async function descargarExcel(pestanas: Pestana[], nombre: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Auditoría de expensas';
  const usados = new Set<string>();
  for (const p of pestanas) {
    let n = p.titulo.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
    while (usados.has(n)) n = n.slice(0, 29) + '_' + usados.size;
    usados.add(n);
    const ws = wb.addWorksheet(n, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    let r = 1;
    for (const t of p.tablas) r = escribirTabla(ws, t, r) + 2;
    ws.getColumn(1).width = Math.max(...p.tablas.map((t) => t.ancho ?? 40), 12);
    for (let c = 2; c <= 30; c++) ws.getColumn(c).width = 17;
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function escribirTabla(ws: any, t: TablaT, r0: number): number {
  let r = r0;
  ws.getCell(r, 1).value = t.titulo;
  ws.getCell(r, 1).font = { bold: true, size: 13 };
  r++;
  if (t.bajada) {
    ws.getCell(r, 1).value = t.bajada;
    ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF666666' } };
    r++;
  }
  const cab = ['', ...t.columnas, ...(t.conVariacion ? t.columnas.slice(1).map((c) => `Var. ${c.slice(0, 2)}`) : []), ...(t.filas.some((f) => f.nota) ? ['Nota'] : [])];
  cab.forEach((h, j) => {
    const c = ws.getCell(r, j + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE4F0' } };
  });
  r++;
  for (const f of t.filas) {
    if (f.estilo === 'seccion') {
      for (let j = 1; j <= cab.length; j++) ws.getCell(r, j).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORES.seccion } };
      ws.getCell(r, 1).value = f.texto;
      ws.getCell(r, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      r++;
      continue;
    }
    ws.getCell(r, 1).value = f.texto;
    if (f.estilo === 'total' || f.estilo === 'negrita') ws.getCell(r, 1).font = { bold: true };
    t.columnas.forEach((_, j) => {
      const v = f.valores[j];
      const fo = t.formatos?.[j] ?? f.formato ?? 'money';
      const c = ws.getCell(r, j + 2);
      if (typeof v === 'number') {
        if (fo === 'money') {
          c.value = v / 100;
          c.numFmt = MON;
        } else if (fo === 'pct' || fo === 'pct4') {
          c.value = v;
          c.numFmt = fo === 'pct' ? '0.0%' : '0.0000%';
        } else c.value = v;
      } else if (v !== null && v !== undefined) c.value = v;
      const est = f.celdas?.[j] ?? (f.estilo && f.estilo !== 'negrita' && f.estilo !== 'gris' ? f.estilo : undefined);
      if (est && COLORES[est]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORES[est] } };
      if (f.estilo === 'total' || f.estilo === 'negrita') c.font = { bold: true };
    });
    let j = t.columnas.length + 2;
    if (t.conVariacion) {
      if (f.variacion)
        variaciones(f.valores).forEach((v, k) => {
          const c = ws.getCell(r, j + k);
          if (v !== null) {
            c.value = v;
            c.numFmt = '0.0%;[Red]-0.0%';
          }
        });
      j += t.columnas.length - 1;
    }
    if (f.nota) ws.getCell(r, j).value = f.nota;
    r++;
  }
  if (t.notas?.length) {
    r++;
    ws.getCell(r, 1).value = 'Notas';
    ws.getCell(r, 1).font = { bold: true };
    r++;
    for (const n of t.notas) {
      ws.getCell(r, 1).value = `(${n.num}) ${n.texto}`;
      ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
      ws.mergeCells(r, 1, r, Math.max(cab.length, 6));
      ws.getRow(r).height = Math.min(90, 15 * Math.ceil(n.texto.length / 140));
      r++;
    }
  }
  return r;
}

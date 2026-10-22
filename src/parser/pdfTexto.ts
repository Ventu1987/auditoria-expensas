// Convierte un PDF en líneas de texto con la posición de cada fragmento.
// Funciona en el navegador y en Node (pruebas): recibe el módulo de pdf.js ya cargado.

export interface Fragmento {
  x: number;
  /** donde termina el fragmento (sirve para columnas alineadas a la derecha) */
  x2: number;
  t: string;
}
export interface Linea {
  pagina: number;
  y: number;
  partes: Fragmento[];
  texto: string;
}

interface PdfJs {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; disableFontFace?: boolean }): { promise: Promise<PdfDoc> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}
interface Item {
  str: string;
  transform: number[];
  width: number;
}

export async function lineasDePdf(data: Uint8Array, pdfjs: PdfJs): Promise<Linea[]> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, verbosity: 0 } as never).promise;
  const out: Linea[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as Item[]).filter((i) => typeof i.str === 'string' && i.str.trim() !== '');
    // Agrupa por altura (tolerancia de 2,5 puntos).
    const filas: { y: number; items: Item[] }[] = [];
    for (const it of items) {
      const y = it.transform[5];
      let f = filas.find((r) => Math.abs(r.y - y) <= 2.5);
      if (!f) filas.push((f = { y, items: [] }));
      f.items.push(it);
    }
    filas.sort((a, b) => b.y - a.y);
    for (const f of filas) {
      f.items.sort((a, b) => a.transform[4] - b.transform[4]);
      // Une fragmentos pegados (menos de 1,5 puntos de separación).
      const partes: Fragmento[] = [];
      for (const it of f.items) {
        const x = it.transform[4];
        const ult = partes[partes.length - 1];
        if (ult && x - ult.x2 < 1.5) {
          ult.t += it.str;
          ult.x2 = x + it.width;
        } else partes.push({ x, x2: x + it.width, t: it.str });
      }
      for (const pt of partes) pt.t = pt.t.replace(/\s+/g, ' ').trim();
      const ps = partes.filter((pt) => pt.t);
      out.push({ pagina: p, y: f.y, partes: ps, texto: ps.map((pt) => pt.t).join(' ') });
    }
  }
  return out;
}

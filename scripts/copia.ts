// Arma la copia de respaldo de la app (src/data/copia.json) migrando los datos de la auditoría anterior.
// Uso: npx vite-node scripts/copia.ts [archivo.json de la API vieja]   (por defecto tests/S2.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { migrar } from '../src/data/migracion';
const f = process.argv[2] ?? 'tests/S2.json';
const vieja = JSON.parse(readFileSync(f, 'utf8'));
const base = migrar(vieja);
writeFileSync('src/data/copia.json', JSON.stringify({ updated: vieja.updated ?? '', fuente: 'Copia migrada de la auditoría', sheets: base }));
console.log(Object.entries(base).map(([h, v]) => `${h}: ${(v as unknown[]).length}`).join(' · '));

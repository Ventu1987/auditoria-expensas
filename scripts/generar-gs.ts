// Copia el esquema de src/data/esquema.ts a apps-script/Esquema.gs (el Apps Script no puede importar TypeScript).
import { writeFileSync } from 'node:fs';
import { ESQUEMA } from '../src/data/esquema';
const js = `// Generado por scripts/generar-gs.ts a partir de src/data/esquema.ts. No editar a mano.\nvar ESQUEMA = ${JSON.stringify(ESQUEMA, null, 2)};\n`;
writeFileSync(new URL('../apps-script/Esquema.gs', import.meta.url), js);
console.log('apps-script/Esquema.gs actualizado');

// src 内で import している @lucide/vue のアイコン名が実在するか確認する
import fs from 'node:fs';
import path from 'node:path';
import * as lucide from '@lucide/vue';

const names = new Set(Object.keys(lucide));
const files = fs.readdirSync('src', { recursive: true }).filter((f) => /\.(vue|js)$/.test(f));
let missing = 0;
for (const f of files) {
  const s = fs.readFileSync(path.join('src', f), 'utf8');
  const m = s.match(/import\s*\{([^}]+)\}\s*from\s*'@lucide\/vue'/);
  if (!m) continue;
  for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!names.has(n)) {
      console.log(`MISSING ${f}: ${n}`);
      missing++;
    }
  }
}
console.log(`missing icons: ${missing}`);
process.exit(missing ? 1 : 0);

// electron-builder に同梱された変換ツールで Windows 用アイコンを生成する。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { runIconsTool } = require('app-builder-lib/out/toolsets/icons.js');
const assets = fileURLToPath(new URL('../electron/assets/', import.meta.url));
await runIconsTool({
  inputFile: fileURLToPath(new URL('../electron/assets/icon.svg', import.meta.url)),
  outputFormat: 'ico',
  outDir: assets,
});

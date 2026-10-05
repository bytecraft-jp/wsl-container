// Vite 開発サーバーを起動してから Electron を立ち上げる
// 使い方: npm run dev        (開発: ホットリロード)
//         node scripts/dev.mjs --prod  (ビルド済み dist を表示)
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const prod = process.argv.includes('--prod');
const env = { ...process.env };
// VS Code のターミナルなどから継承すると Electron が Node として起動してしまう
delete env.ELECTRON_RUN_AS_NODE;

let server = null;
if (!prod) {
  server = await createServer();
  await server.listen();
  env.VITE_DEV_SERVER_URL = server.resolvedUrls.local[0];
  console.log(`Vite dev server: ${env.VITE_DEV_SERVER_URL}`);
}

const child = spawn(electronPath, ['.', ...process.argv.slice(2).filter((a) => a !== '--prod')], { stdio: 'inherit', env });
child.on('close', async (code) => {
  await server?.close();
  process.exit(code ?? 0);
});

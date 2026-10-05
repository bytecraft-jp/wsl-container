// 開発用: --remote-debugging-port で起動したアプリを CDP で操作してスクリーンショットを撮る
// 使い方: node scripts/cdp.mjs <port> <出力先.png> "<評価する JS>" [待機ms]
import fs from 'node:fs';

const [port = '9229', out = 'shot.png', expr = '', wait = '1500'] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const match = process.env.CDP_MATCH || 'index.html';
const page = targets.find((t) => t.type === 'page' && t.url.includes(match)) || targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
if (expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) logs.push(`[eval error] ${r.result.exceptionDetails.exception?.description}`);
  else if (r.result?.result?.value !== undefined) logs.push(`[eval] ${JSON.stringify(r.result.result.value)}`);
}
await new Promise((r) => setTimeout(r, Number(wait)));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(logs.join('\n') || '(no console output)');
console.log(`saved ${out}`);
ws.close();

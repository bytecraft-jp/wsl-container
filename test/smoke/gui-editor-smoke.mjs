// 実際の Vue + CodeMirror を非表示の Electron テストウィンドウで検証する。
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';

const html = `<!doctype html><html><body>
<div id="app" style="height:320px;width:600px"></div>
<script type="module">
import { createApp, h, nextTick } from 'vue';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import CodeEditor from '/src/components/CodeEditor.vue';
import { createGuiBuilder } from '/src/lib/gui/builder.js';
const draft = createGuiBuilder();
let saves = 0;
createApp({ render: () => h(CodeEditor, {
  modelValue: draft.dockerfile.value,
  language: 'dockerfile',
  'onUpdate:modelValue': value => { draft.dockerfile.value = value; },
  onSave: () => { saves++; },
}) }).mount('#app');
window.runSmoke = async () => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
  const original = view.state.doc.toString();
  view.dispatch({ changes: { from: view.state.doc.length, insert: '\\n# 手編集テスト\\n' } });
  await nextTick();
  const edited = draft.dockerfile.value;
  check(edited.includes('手編集テスト'), 'editor input did not update v-model');
  draft.custom.packages = 'inkscape';
  await nextTick();
  check(view.state.doc.toString() === edited, 'form change overwrote editor');
  check(undo(view), 'undo was unavailable');
  await nextTick();
  check(draft.dockerfile.value === original, 'v-model echo broke undo history');
  draft.regenerate();
  await nextTick();
  check(view.state.doc.toString().includes('--no-install-recommends inkscape'), 'regeneration did not update editor');
  view.focus();
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }));
  check(saves === 1, 'Ctrl+S did not save');
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ('# long document\\n').repeat(100) } });
  await nextTick();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const scroller = document.querySelector('.cm-scroller');
  check(scroller.scrollHeight > scroller.clientHeight, 'long Dockerfile cannot scroll');
  check(document.querySelector('.code-editor').getBoundingClientRect().height <= 322, 'editor overflowed its container');
  return { input: true, preservesEdits: true, undo: true, regeneration: true, ctrlS: true, scrolling: true };
};
</script></body></html>`;
const server = await createServer({ logLevel: 'error', optimizeDeps: {
  include: ['vue', 'codemirror', '@codemirror/view', '@codemirror/commands'],
}, plugins: [{ name: 'gui-editor-smoke', configureServer(vite) {
  vite.middlewares.use('/__gui-smoke', (_, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(html.replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module" src="/data/gui-editor-smoke-entry.js"></script>'));
  });
} }] });
await server.listen();
const runner = path.resolve('data/gui-editor-smoke.cjs');
await fs.mkdir(path.dirname(runner), { recursive: true });
const entry = path.resolve('data/gui-editor-smoke-entry.js');
await fs.writeFile(entry, html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
await fs.writeFile(runner, `const {app,BrowserWindow}=require('electron');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
 try {
  await win.loadURL(process.env.GUI_SMOKE_URL);
  const result=await win.webContents.executeJavaScript(
   '(async()=>{for(let i=0;i<200&&!window.runSmoke;i++)await new Promise(r=>setTimeout(r,100));return await window.runSmoke();})()');
  console.log(JSON.stringify(result)); app.exit(0);
 } catch(e) { console.error(e); app.exit(1); }
});`);
try {
  const env = { ...process.env, GUI_SMOKE_URL: server.resolvedUrls.local[0] + '__gui-smoke' };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [runner], { env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) throw Error(`GUI editor smoke failed: ${code}`);
} finally {
  await server.close();
  await fs.unlink(runner);
  await fs.unlink(entry);
}

// Actual renderer/preload/loader; WSL calls are simulated, no containers are changed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..');

if (!process.versions.electron) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-presets-ui-'));
  const env = { ...process.env, WCS_PRESET_SMOKE_DIR: temp };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error); process.exitCode = 1; fs.rmSync(temp, { recursive: true, force: true }); });
  child.on('exit', code => { fs.rmSync(temp, { recursive: true, force: true }); process.exitCode = code || 0; });
} else {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const { loadPresets, prepareBuild } = require('../../electron/gui/presets.cjs');
  const temp = process.env.WCS_PRESET_SMOKE_DIR;
  app.setPath('userData', path.join(temp, 'profile'));
  const options = { builtinsDir: path.join(root, 'electron/gui/presets'), customDir: path.join(temp, 'presets'), buildsDir: path.join(temp, 'builds') };
  const calls = [];
  const handle = (channel, fn) => ipcMain.handle(channel, async (_event, ...args) => {
    calls.push({ channel, args });
    try { return { ok: true, data: await fn(...args) }; } catch (error) { return { ok: false, error: error.message }; }
  });
  handle('settings:get', () => ({ pollInterval: 60000 }));
  handle('wslc:status', () => ({ found: true }));
  handle('wslc:run', () => ({ code: 0, stdout: '', stderr: '' }));
  handle('gui-presets:list', () => loadPresets(options));
  handle('gui-presets:prepare-build', id => prepareBuild(id, options));
  handle('app:paths', () => ({ guiBuilds: options.buildsDir }));
  handle('fs:join', (...parts) => path.join(...parts));
  handle('app:openViewer', () => true);
  handle('app:openPath', () => true);
  handle('app:showItem', () => true);
  let win;
  handle('stream:start', id => { setTimeout(() => win.webContents.send('stream:exit', id, 0), 30); });
  app.whenReady().then(async () => {
    win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), backgroundThrottling: false } });
    const evaluate = code => win.webContents.executeJavaScript(code);
    const until = async predicate => {
      for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
      throw Error('UI condition timed out');
    };
    try {
      await win.loadFile(path.join(root, 'dist/index.html'), { hash: '/gui' });
      await until(() => evaluate('document.querySelectorAll(".preset").length === 9'));
      const directory = path.join(options.customDir, 'smoke');
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch\n');
      fs.writeFileSync(path.join(directory, 'preset.yaml'), 'id: smoke\ntitle: UI追加テスト\nimage: local/smoke:latest\nport: 5800\nhostPort: 3601\nbuild:\n  context: .\n  requires: [ubuntu-base]\nreadyCommand: ["sh", "-c", "test -f /tmp/ready"]\n');
      fs.writeFileSync(path.join(options.customDir, 'invalid.yaml'), 'id: [');
      await evaluate('Array.from(document.querySelectorAll(".page-header button")).find(b => b.textContent.includes("再読み込み")).click()');
      await until(() => evaluate('document.querySelectorAll(".preset").length === 10'));
      assert.ok(await evaluate('document.querySelector(".notice.error").textContent.includes("invalid.yaml")'));
      await evaluate('Array.from(document.querySelectorAll(".preset")).find(p => p.textContent.includes("UI追加テスト")).querySelector("button.primary").click()');
      await until(() => calls.some(c => c.channel === 'app:openViewer'));
      const builds = calls.filter(c => c.channel === 'stream:start' && c.args[1][0] === 'build').map(c => c.args[1]);
      assert.equal(builds.length, 2);
      assert.equal(builds[0][2], 'wcs-gui/ubuntu-base:22.04');
      const build = builds[1];
      // 自作プリセットはコピーせず、自分のフォルダーをそのままビルドする
      const context = fs.realpathSync(directory);
      assert.deepEqual(build, ['build', '-t', 'local/smoke:latest', '-f', path.join(context, 'Dockerfile'), context]);
      const run = calls.find(c => c.channel === 'stream:start' && c.args[1][0] === 'run').args[1];
      assert.ok(run.includes('127.0.0.1:3601:5800'));
      assert.ok(run.includes('wcs-gui-smoke-config:/config'));
      assert.ok(calls.some(c => c.channel === 'wslc:run' && JSON.stringify(c.args[0]) === JSON.stringify(['exec', 'wcs-gui-smoke', 'sh', '-c', 'test -f /tmp/ready'])));
      assert.equal(calls.find(c => c.channel === 'app:openViewer').args[0], 'http://127.0.0.1:3601/');
      console.log(JSON.stringify({ builtinCards: 9, reloadAddsCard: true, invalidFileReported: true, customBuild: true, readiness: true, viewer: true }));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
}

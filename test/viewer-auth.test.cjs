const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveViewerAuth } = require('../electron/services/viewer-auth.cjs');
const { parseJsonLines } = require('../electron/services/wslc.cjs');

const url = 'https://127.0.0.1:3100/';
const details = { url, firstAuthAttempt: true };
const auth = { isProxy: false, scheme: 'basic', host: '127.0.0.1', port: 3100 };
function engine({ image = 'kasmweb/chrome:1.19.0-rolling-daily', port = '3100', ip = '127.0.0.1', labels } = {}) {
  return { parseJsonLines, async run(args) {
    const data = args[0] === 'ps' ? { ID: 'chrome-id', Image: image, Labels: labels ? 'wcs.gui.auth=kasm' : '' } : {
      Config: { Image: image, Labels: labels, Env: ['TZ=Asia/Tokyo', 'VNC_PW=test-password=with-equals'] },
      NetworkSettings: { Ports: { '6901/tcp': [{ HostIp: ip, HostPort: port }] } },
    };
    return { code: 0, stdout: JSON.stringify(data) };
  } };
}

test('Chrome の実際の公開ポートにだけコンテナーのパスワードを渡す', async () => {
  assert.deepEqual(await resolveViewerAuth(url, details, auth, engine()), {
    username: 'kasm_user', password: 'test-password=with-equals',
  });
  for (const config of [{ port: '3200' }, { ip: '0.0.0.0' }, { image: 'lscr.io/linuxserver/chromium:latest' }]) {
    assert.equal(await resolveViewerAuth(url, details, auth, engine(config)), null);
  }
});

test('custom Kasm presets authenticate only when explicitly labeled and bound to the viewer port', async () => {
  const config = { image: 'custom/kasm:latest', labels: { 'wcs.gui.auth': 'kasm' } };
  assert.equal((await resolveViewerAuth(url, details, auth, engine(config))).username, 'kasm_user');
  assert.equal(await resolveViewerAuth(url, details, auth, engine({ ...config, port: '3200' })), null);
  assert.equal(await resolveViewerAuth(url, details, auth, engine({ ...config, labels: {} })), null);
});

test('別ホスト・別ポート・プロキシ・認証失敗後には資格情報を渡さない', async () => {
  const noRead = { run() { throw new Error('must not inspect'); } };
  for (const [d, a] of [
    [{ ...details, url: 'https://example.com:3100/' }, auth],
    [{ ...details, url: 'https://127.0.0.1:3200/' }, auth],
    [details, { ...auth, isProxy: true }],
    [details, { ...auth, host: 'example.com' }],
    [details, { ...auth, port: 3200 }],
    [{ ...details, firstAuthAttempt: false }, auth],
  ]) assert.equal(await resolveViewerAuth(url, d, a, noRead), null);
});

test('Ubuntu Chrome keeps its profile volume and uses the common Japanese GUI settings', async (t) => {
  const path = require('node:path');
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-presets-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { GUI_PRESETS, setGuiPresets } = await import('../src/lib/gui/presets.js');
  setGuiPresets(require('../electron/gui/presets.cjs').loadPresets({ builtinsDir: path.resolve('electron/gui/presets'), customDir: dir }).presets);
  const { presetForm } = await import('../src/lib/gui/presetForm.js');
  const { buildRunArgs } = await import('../src/lib/runArgs.js');
  const chrome = GUI_PRESETS.find((p) => p.id === 'chrome');
  const first = presetForm(chrome);
  const args = buildRunArgs(first);
  assert.ok(args.includes('127.0.0.1:3100:5800'));
  assert.ok(args.includes('wcs.gui.scheme=http'));
  assert.ok(args.includes('wcs-gui-chrome-config:/config'));
  assert.ok(args.includes('wcs-gui/chrome:latest'));
  assert.equal(first.env.some(e => e.key === 'VNC_PW'), false);
  const kasm = presetForm({ ...chrome, auth: 'kasm' });
  assert.match(kasm.env.find(e => e.key === 'VNC_PW').value, /^[a-f0-9]{32}$/);
  assert.equal(GUI_PRESETS.some((p) => p.id === 'chromium'), false);
});

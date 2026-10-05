const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { loadPresets } = require('../electron/gui/presets.cjs');
test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-presets-viewer-'));
  const { setGuiPresets } = await import('../src/lib/gui/presets.js');
  setGuiPresets(loadPresets({ builtinsDir: path.resolve('electron/gui/presets'), customDir: dir }).presets);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GNOME の開始ページを既存コンテナーにも適用し、同じホスト内で開く', async () => {
  const { presetGuiPath } = await import('../src/lib/gui/presets.js');
  const { guiViewerUrl } = await import('../src/lib/gui/viewer.js');
  const path = presetGuiPath({ Names: 'wcs-gui-ubuntu-gnome' });
  assert.equal(path, '/vnc.html?autoconnect=1&resize=remote');
  assert.equal(presetGuiPath({ Image: 'wcs-gui/ubuntu-gnome:latest' }), path);
  assert.equal(guiViewerUrl('3400', 'http', path), 'http://127.0.0.1:3400/vnc.html?autoconnect=1&resize=remote');
  assert.equal(guiViewerUrl('3200'), 'http://127.0.0.1:3200/');
  assert.throws(() => guiViewerUrl('3400', 'http', '//example.com/vnc.html'));
});

test('GUI の開始ページは実行ラベルと複製フォームに保持される', async () => {
  const { emptyRunForm, buildRunArgs, formFromInspect, GUI_PORT_LABEL, GUI_PATH_LABEL } = await import('../src/lib/runArgs.js');
  const form = emptyRunForm();
  Object.assign(form, { image: 'wcs-gui/ubuntu-gnome:latest', guiPort: '3400', guiPath: '/vnc.html?autoconnect=1&resize=remote' });
  assert.ok(buildRunArgs(form).includes(`${GUI_PATH_LABEL}=${form.guiPath}`));
  const config = { Image: form.image, Labels: { [GUI_PORT_LABEL]: '3400', [GUI_PATH_LABEL]: form.guiPath } };
  assert.equal(formFromInspect({ Config: config }).guiPath, form.guiPath);
  delete config.Labels[GUI_PATH_LABEL];
  assert.equal(formFromInspect({ Config: config }).guiPath, form.guiPath);
});

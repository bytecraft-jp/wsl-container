// Electron実環境でdataへの設定保存とwslcの保存先設定を確認する (ウィンドウは開かない)。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { paths, applyElectronPaths } = require('../../electron/services/paths.cjs');
const storage = require('../../electron/storage/wslc-storage.cjs');
const wslc = require('../../electron/services/wslc.cjs');

applyElectronPaths();
app.whenReady().then(async () => {
  assert.equal(app.getPath('userData'), paths.electron);
  assert.equal(app.getPath('sessionData'), paths.electron);
  const settings = require('../../electron/services/settings.cjs');
  settings.set({ pollInterval: settings.load().pollInterval });
  assert.ok(fs.existsSync(paths.settings));
  if (!wslc.findWslc()) throw new Error('Windows標準のwslc.exeが見つかりません');
  storage.ensureStoragePath(paths.wslcStorage);
  const result = await wslc.run(['info', '--format', 'json'], { timeout: 60000 });
  assert.equal(result.code, 0, result.stderr);
  const info = JSON.parse(result.stdout);
  console.log(JSON.stringify({
    data: paths.data,
    settings: paths.settings,
    cache: app.getPath('sessionData'),
    compose: paths.compose,
    guiBuilds: paths.guiBuilds,
    wslc: wslc.findWslc(),
    version: info.Client?.Version,
    storagePath: require('yaml').parse(fs.readFileSync(storage.settingsFile(), 'utf8')).session.storagePath,
  }, null, 2));
  assert.equal(path.dirname(paths.settings), paths.data);
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

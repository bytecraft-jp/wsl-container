const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const YAML = require('yaml');
const storage = require('../electron/storage/wslc-storage.cjs');

function isolatedModule(name, dependencies, processStub = process) {
  const filename = path.resolve('electron', 'services', name);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename), process: processStub,
    require: (id) => dependencies[id] || require(id),
  }, { filename });
  return module.exports;
}

test('開発版・展開exe・ポータブルexeのルートと相対Composeパス', () => {
  for (const packaged of [false, true]) {
    for (const portable of [false, true]) {
      const executableDir = path.resolve('release', 'app');
      const portableDir = path.resolve('release');
      const app = { isPackaged: packaged };
      const p = isolatedModule('paths.cjs', { electron: { app } }, {
        execPath: path.join(executableDir, 'studio.exe'),
        resourcesPath: path.join(executableDir, 'resources'),
        env: portable ? { PORTABLE_EXECUTABLE_DIR: portableDir } : {},
      });
      const expected = packaged ? (portable ? portableDir : executableDir) : path.resolve('.');
      assert.equal(p.paths.data, path.join(expected, 'data'));
      const compose = path.join(p.paths.compose, 'demo', 'compose.yaml');
      assert.equal(p.fromStored(p.toStored(compose)), compose);
      assert.equal(path.isAbsolute(p.toStored(compose)), false);
    }
  }
});

test('wslcの設定・コメント保持、初回バックアップ、冪等性、不正YAML保護', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-storage-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.yaml');
  const original = '# keep me\nsession:\n  memorySize: 2GB\ncredentialStore: wincred\n';
  fs.writeFileSync(file, original);
  const data = path.join(dir, 'data');
  assert.equal(storage.ensureStoragePath(data, { file }).changed, true);
  const updated = fs.readFileSync(file, 'utf8');
  const parsed = YAML.parse(updated);
  assert.equal(parsed.session.storagePath, data);
  assert.equal(parsed.session.memorySize, '2GB');
  assert.equal(parsed.credentialStore, 'wincred');
  assert.ok(updated.includes('# keep me'));
  assert.equal(fs.readFileSync(`${file}.wcs-backup`, 'utf8'), original);
  assert.equal(storage.ensureStoragePath(data, { file }).changed, false);
  fs.writeFileSync(file, 'session: [');
  assert.throws(() => storage.ensureStoragePath(data, { file }), /解析/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'session: [');
});

test('旧設定を保持してdataへコピーし、Composeパスを相対保存する', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-settings-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const legacy = path.join(dir, 'roaming', 'WSL Container Studio', 'settings.json');
  const root = path.join(dir, 'project');
  const file = path.join(root, 'data', 'settings.json');
  const compose = path.join(root, 'data', 'compose', 'demo', 'compose.yaml');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, '\uFEFF' + JSON.stringify({ hubUsername: 'demo', composeProjects: [] }));
  const settings = isolatedModule('settings.cjs', {
    electron: { app: { getPath: () => path.join(dir, 'roaming') }, safeStorage: {} },
    './paths.cjs': {
      paths: { settings: file },
      toStored: (p) => path.relative(root, p),
      fromStored: (p) => path.isAbsolute(p) ? p : path.join(root, p),
    },
  });
  assert.equal(settings.publicSettings().hubUsername, 'demo');
  settings.set({ composeProjects: [{ name: 'demo', file: compose }] });
  assert.equal(settings.publicSettings().composeProjects[0].file, compose);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).composeProjects[0].file, path.relative(root, compose));
  assert.ok(fs.existsSync(legacy));
});

test('選択した保存先を再起動後も使い、手動のwslc設定をdataに戻さない', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-storage-choice-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'wslc.yaml');
  const fallback = path.join(dir, 'project', 'data');
  const custom = path.join(dir, 'other-drive');
  const options = { file };
  assert.equal(storage.resolveStoragePath('', fallback, options), fallback);
  fs.writeFileSync(file, YAML.stringify({ session: { storagePath: custom } }));
  assert.equal(storage.resolveStoragePath('', fallback, options), custom);
  const selected = path.join(dir, 'selected');
  storage.ensureStoragePath(selected, options);
  assert.equal(storage.resolveStoragePath(selected, fallback, options), selected);
  assert.equal(storage.resolveStoragePath('', fallback, options), selected);
  fs.writeFileSync(file, 'session:\n  storagePath: default\n');
  assert.equal(storage.resolveStoragePath('', fallback, options), process.env.LOCALAPPDATA || fallback);
  assert.throws(() => storage.resolveStoragePath('relative', fallback, options), /絶対パス/);
  fs.writeFileSync(file, 'session: [');
  assert.throws(() => storage.resolveStoragePath('', fallback, options), /解析/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'session: [');
});

test('仮想ディスクを表示する際に重複・存在しない保存先を除外し、データを保持する', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-vhd-list-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const vhd = storage.vhdPath(dir, 'demo');
  fs.mkdirSync(path.dirname(vhd), { recursive: true });
  fs.writeFileSync(vhd, 'existing data');
  const found = storage.findVhds([dir, dir, path.join(dir, 'missing'), null]);
  assert.deepEqual(found, [{ session: 'demo', path: vhd, size: 13 }]);
  assert.equal(fs.readFileSync(vhd, 'utf8'), 'existing data');
});

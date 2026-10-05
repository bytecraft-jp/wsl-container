const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPresets, prepareBuild, presetFiles, savePresetFile } = require('../electron/gui/presets.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-presets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { builtinsDir: path.join(root, 'builtin'), customDir: path.join(root, 'custom'), buildsDir: path.join(root, 'builds') };
  fs.mkdirSync(options.builtinsDir);
  fs.mkdirSync(options.customDir);
  return options;
}
const preset = (id, extra = {}) => ({ id, title: id, image: `example/${id}:latest`, port: 5800, ...extra });
const write = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));

test('Ubuntu apps share the Japanese base and keep profile volumes and host ports', (t) => {
  const options = fixture(t);
  options.builtinsDir = path.resolve(__dirname, '../electron/gui/presets');
  options.examplesDir = path.resolve(__dirname, '../electron/gui/examples');
  const { presets, errors } = loadPresets(options);
  assert.deepEqual(errors, []);
  assert.equal(presets.length, 10);
  assert.equal(presets.filter(p => !p.hidden).length, 9);
  const chrome = presets.find(p => p.id === 'chrome');
  assert.equal(chrome.guiPath, '/vnc.html?autoconnect=1&resize=remote');
  assert.deepEqual(chrome.env, {});
  assert.equal(chrome.configTarget, '/config');
  assert.equal(chrome.hostPort, 3100);
  const gnome = presets.find(p => p.id === 'ubuntu-gnome');
  assert.equal(gnome.containerName, 'wcs-gui-ubuntu-gnome');
  assert.equal(gnome.build.context, path.join(options.builtinsDir, 'ubuntu-gnome'));
  assert.ok(gnome.readyCommand[2].includes('gnome-shell'));
  for (const { id } of presets.filter(p => !p.hidden)) {
    const plan = prepareBuild(id, options);
    assert.deepEqual(plan.map(p => p.id), ['ubuntu-base', id]);
    assert.equal(plan[1].directory, path.join(options.buildsDir, id));
    assert.ok(fs.readFileSync(path.join(plan[1].directory, 'Dockerfile'), 'utf8').startsWith('FROM wcs-gui/ubuntu-base:22.04\n'));
    assert.equal(fs.existsSync(path.join(plan[1].directory, 'startapp.sh')), false);
  }
  assert.ok(fs.existsSync(path.join(options.customDir, 'examples', 'gimp', 'preset.yaml.example')));
  fs.writeFileSync(path.join(options.customDir, 'examples', 'README.md'), 'my notes');
  loadPresets(options);
  assert.equal(fs.readFileSync(path.join(options.customDir, 'examples', 'README.md'), 'utf8'), 'my notes');
});

test('build dependencies are ordered once and unknown/cyclic dependencies fail before copying', (t) => {
  const options = fixture(t);
  const add = (id, requires = []) => {
    const dir = path.join(options.customDir, id);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM scratch');
    write(dir, 'preset.yaml', preset(id, { build: { context: '.', requires } }));
  };
  add('base'); add('middle', ['base']); add('app', ['base', 'middle']);
  assert.deepEqual(prepareBuild('app', options).map(p => p.id), ['base', 'middle', 'app']);
  add('missing', ['no-such-preset']);
  assert.throws(() => prepareBuild('missing', options), /見つかりません/);
  assert.equal(fs.existsSync(path.join(options.buildsDir, 'missing')), false);
  add('loop-a', ['loop-b']); add('loop-b', ['loop-a']);
  assert.throws(() => prepareBuild('loop-a', options), /循環/);
});

test('adding YAML, JSON and a folder manifest is discovered on reload', (t) => {
  const options = fixture(t);
  assert.equal(loadPresets(options).presets.length, 0);
  fs.writeFileSync(path.join(options.customDir, 'first.yml'), '\uFEFFid: first\ntitle: 日本語アプリ\nimage: example/first\nport: 3000\nenv:\n  FLAG: true\n  COUNT: 2\n');
  write(options.customDir, 'second.json', preset('second', { hostPort: 3600, order: 1 }));
  fs.mkdirSync(path.join(options.customDir, 'third'));
  write(path.join(options.customDir, 'third'), 'preset.yaml', preset('third'));
  fs.writeFileSync(path.join(options.customDir, 'inactive.yaml.example'), 'invalid');
  const { presets, errors } = loadPresets(options);
  assert.deepEqual(errors, []);
  assert.equal(presets.length, 3);
  assert.equal(presets[0].id, 'second');
  assert.deepEqual(presets.find(p => p.id === 'first').env, { FLAG: 'true', COUNT: '2' });
  assert.equal(presets.find(p => p.id === 'third').containerName, 'wcs-gui-third');
});

test('custom files override builtins; malformed files and duplicates do not hide valid presets', (t) => {
  const options = fixture(t);
  write(options.builtinsDir, 'base.yaml', preset('same'));
  write(options.customDir, 'a.yaml', preset('same', { title: 'custom' }));
  write(options.customDir, 'b.json', preset('same', { title: 'duplicate' }));
  fs.writeFileSync(path.join(options.customDir, 'bad.yaml'), 'id: [');
  write(options.customDir, 'good.json', preset('good'));
  const { presets, errors } = loadPresets(options);
  assert.equal(presets.length, 2);
  assert.equal(presets.find(p => p.id === 'same').title, 'custom');
  assert.equal(presets.find(p => p.id === 'same').sourceKind, 'custom');
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => e.message.includes('重複')));
});

test('custom presets build from their own folder without copying', (t) => {
  const options = fixture(t);
  const directory = path.join(options.customDir, 'terminal');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  write(directory, 'preset.yaml', preset('terminal', { build: { context: '.', dockerfile: 'Containerfile' }, readyCommand: ['sh', '-c', 'test -f /tmp/ready'] }));
  fs.writeFileSync(path.join(directory, 'Containerfile'), 'FROM scratch\nCOPY assets /assets\n');
  const result = prepareBuild('terminal', options).at(-1);
  assert.equal(result.directory, fs.realpathSync(directory));
  assert.equal(result.dockerfile, 'Containerfile');
  assert.equal(fs.existsSync(path.join(options.buildsDir, 'terminal')), false);
  assert.throws(() => prepareBuild('../escape', options), /見つかりません/);
});

test('builtin build folders are recreated so stale files never remain', (t) => {
  const options = fixture(t);
  const directory = path.join(options.builtinsDir, 'app');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  write(directory, 'preset.yaml', preset('app', { build: { context: '.' } }));
  fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch\n');
  fs.writeFileSync(path.join(directory, 'assets', 'binary'), Buffer.from([0, 255, 1]));
  const result = prepareBuild('app', options).at(-1);
  assert.equal(result.directory, path.join(options.buildsDir, 'app'));
  assert.deepEqual(fs.readFileSync(path.join(result.directory, 'assets', 'binary')), Buffer.from([0, 255, 1]));
  fs.writeFileSync(path.join(result.directory, 'stale.sh'), 'old');
  fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch\nCMD ["new"]\n');
  prepareBuild('app', options).at(-1);
  assert.equal(fs.existsSync(path.join(result.directory, 'stale.sh')), false);
  assert.match(fs.readFileSync(path.join(result.directory, 'Dockerfile'), 'utf8'), /new/);
});

test('invalid identity, port, readiness and external paths are reported without loading', (t) => {
  const options = fixture(t);
  const invalid = [preset('../escape'), preset('port', { port: 0 }), preset('ready', { readyCommand: [] }), preset('url', { guiPath: '//example.com' }), preset('build', { build: { context: '../builtin' } })];
  invalid.forEach((p, i) => write(options.customDir, `${i}.json`, p));
  const result = loadPresets(options);
  assert.equal(result.presets.length, 0);
  assert.equal(result.errors.length, invalid.length);
});

test('build preparation rejects assets linked outside the preset directory', (t) => {
  const options = fixture(t);
  const directory = path.join(options.customDir, 'linked');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch');
  fs.symlinkSync(options.builtinsDir, path.join(directory, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  write(directory, 'preset.yaml', preset('linked', { build: { context: '.' } }));
  assert.throws(() => prepareBuild('linked', options), /リンク/);
});

test('editor lists preset files and saving a builtin copies it to the custom folder', (t) => {
  const options = fixture(t);
  const directory = path.join(options.builtinsDir, 'app');
  fs.mkdirSync(path.join(directory, 'conf'), { recursive: true });
  write(directory, 'preset.yaml', preset('app', { build: { context: '.' } }));
  fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch');
  fs.writeFileSync(path.join(directory, 'conf', 'a.conf'), 'x=1');
  fs.writeFileSync(path.join(directory, 'icon.bin'), Buffer.from([0, 1, 2]));
  const listed = presetFiles('app', options);
  assert.equal(listed.kind, 'builtin');
  assert.deepEqual(listed.files.map(f => f.name), ['preset.yaml', 'Dockerfile', 'conf/a.conf']);
  assert.equal(listed.saveDirectory, path.join(options.customDir, 'app'));
  savePresetFile('app', 'Dockerfile', 'FROM scratch\nCMD ["edited"]', options);
  assert.equal(fs.readFileSync(path.join(directory, 'Dockerfile'), 'utf8'), 'FROM scratch');
  assert.match(fs.readFileSync(path.join(options.customDir, 'app', 'Dockerfile'), 'utf8'), /edited/);
  assert.ok(fs.existsSync(path.join(options.customDir, 'app', 'conf', 'a.conf')));
  const custom = presetFiles('app', options);
  assert.equal(custom.kind, 'custom');
  savePresetFile('app', 'conf/a.conf', 'x=2', options);
  assert.equal(fs.readFileSync(path.join(options.customDir, 'app', 'conf', 'a.conf'), 'utf8'), 'x=2');
  assert.throws(() => savePresetFile('app', '../escape.txt', 'x', options), /編集できない/);
  assert.throws(() => savePresetFile('app', 'new-file', 'x', options), /編集できない/);
});

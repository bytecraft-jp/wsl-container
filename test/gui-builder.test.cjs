const test = require('node:test');
const assert = require('node:assert/strict');

test('GUI Dockerfile の手編集はフォーム変更と再読み込みで保持される', async () => {
  const { createGuiBuilder } = await import('../src/lib/gui/builder.js');
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const draft = createGuiBuilder(storage);
  draft.custom.packages = 'inkscape';
  assert.match(draft.dockerfile.value, /FROM wcs-gui\/ubuntu-base:22\.04\n/);
  assert.match(draft.dockerfile.value, /apt-get install .* inkscape/);
  const edited = draft.dockerfile.value + '\nRUN echo custom\n';
  draft.dockerfile.value = edited;
  draft.custom.packages = 'gimp';
  draft.custom.appName = 'My app';
  assert.equal(draft.dockerfile.value, edited);
  assert.equal(draft.manuallyEdited.value, true);
  const restored = createGuiBuilder(storage);
  assert.equal(restored.dockerfile.value, edited);
  assert.equal(restored.custom.appName, 'My app');
  restored.regenerate();
  assert.equal(restored.manuallyEdited.value, false);
  assert.doesNotMatch(restored.dockerfile.value, /echo custom|fonts-noto-cjk/);
  restored.custom.packages = 'xterm';
  assert.match(restored.dockerfile.value, /apt-get install .* xterm/);
});

test('壊れたドラフトや保存不可でも GUI Dockerfile を編集できる', async () => {
  const { createGuiBuilder } = await import('../src/lib/gui/builder.js');
  const draft = createGuiBuilder({ getItem: () => '{', setItem: () => { throw new Error('full'); } });
  draft.dockerfile.value = '';
  draft.custom.appName = 'Test';
  assert.equal(draft.dockerfile.value, '');
});

test('自作 GUI アプリ: 手編集した Dockerfile の CMD を表示し、preset.yaml の追加項目を保持する', async () => {
  const { dockerfileCommand, usesStartScript, builderPreset, builderPresetYaml } = await import('../src/lib/gui/builder.js');
  const YAML = require('yaml');
  assert.equal(dockerfileCommand('FROM x\nCMD ["/usr/local/bin/startapp.sh"]\n'), '/usr/local/bin/startapp.sh');
  assert.equal(dockerfileCommand('FROM x\nCMD ["a", "--b"]\nCMD ["google-chrome", \\\n  "--no-sandbox", "--x y"]\n'), 'google-chrome --no-sandbox "--x y"');
  assert.equal(dockerfileCommand('FROM x\nCMD gimp --new\n'), 'gimp --new');
  assert.equal(dockerfileCommand('FROM x\n'), '');
  assert.equal(usesStartScript('COPY startapp.sh /usr/local/bin/startapp.sh'), true);
  assert.equal(usesStartScript('CMD ["google-chrome"]'), false);

  const form = { appName: 'Proxy Chrome', packages: '', port: '5900' };
  assert.equal(builderPreset(form, true).description, '自作 GUI アプリ（Dockerfile を手編集）');
  const fresh = YAML.parse(builderPresetYaml(builderPreset(form)));
  assert.equal(fresh.id, 'proxy-chrome');
  assert.equal(fresh.hostPort, 5900);
  const existing = '# 自分のメモ\nid: proxy-chrome\ntitle: old\nport: 5800\nguiPath: /custom\nenv:\n  PXPROXY_HOST: 192.168.0.10 # Windows\nhostPort: 5900\n';
  const merged = builderPresetYaml(builderPreset({ ...form, port: '5901' }), existing);
  const parsed = YAML.parse(merged);
  assert.equal(parsed.title, 'Proxy Chrome');
  assert.equal(parsed.hostPort, 5901);
  assert.equal(parsed.guiPath, '/custom');
  assert.deepEqual(parsed.env, { PXPROXY_HOST: '192.168.0.10' });
  assert.deepEqual(parsed.build, { context: '.', requires: ['ubuntu-base'] });
  assert.match(merged, /# 自分のメモ/);
  assert.match(merged, /# Windows/);
  assert.equal(YAML.parse(builderPresetYaml(builderPreset(form), 'not: [valid')).id, 'proxy-chrome');
});

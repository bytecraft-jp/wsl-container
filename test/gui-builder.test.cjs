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

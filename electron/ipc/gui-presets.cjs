// GUI プリセットの読み込み・ビルド準備・ファイル編集
const guiPresets = require('../gui/presets.cjs');
const { paths } = require('../services/paths.cjs');

const options = () => ({
  builtinsDir: paths.builtinGuiPresets,
  examplesDir: paths.guiExamples,
  customDir: paths.guiPresets,
  buildsDir: paths.guiBuilds,
});

module.exports = function registerGuiPresets({ handle }) {
  handle('gui-presets:list', () => guiPresets.loadPresets(options()));
  handle('gui-presets:prepare-build', (id) => guiPresets.prepareBuild(id, options()));
  handle('gui-presets:files', (id) => guiPresets.presetFiles(id, options()));
  handle('gui-presets:save-file', (id, name, content) => guiPresets.savePresetFile(id, name, content, options()));
};

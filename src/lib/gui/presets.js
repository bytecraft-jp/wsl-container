import { reactive } from 'vue';

// GUI プリセットの一覧。定義ファイルはメインプロセスが読み込む (electron/gui/presets.cjs)
export const GUI_PRESETS = reactive([]);
export function setGuiPresets(presets) { GUI_PRESETS.splice(0, GUI_PRESETS.length, ...presets); }

/** ラベルに開始ページがないコンテナーにも、プリセットの開始ページを適用する。 */
export function presetGuiPath(c) {
  const byName = GUI_PRESETS.find((p) => (p.containerName || `wcs-gui-${p.id}`) === c.Names);
  return (byName || GUI_PRESETS.find((p) => p.image === c.Image))?.guiPath || '';
}

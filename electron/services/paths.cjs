// すべてのデータを <ProjectRoot>/data に集約するためのパス定義
//   開発時    : リポジトリのルート/data
//   exe 実行時: exe と同じフォルダー/data (ポータブル版は PORTABLE_EXECUTABLE_DIR)
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function projectRoot() {
  if (!app.isPackaged) return path.resolve(__dirname, '..', '..');
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
}

const root = projectRoot();
const dataDir = path.join(root, 'data');

const paths = {
  root,
  data: dataDir,
  settings: path.join(dataDir, 'settings.json'),
  electron: path.join(dataDir, 'electron'), // Electron のキャッシュ・ストレージ
  compose: path.join(dataDir, 'compose'), // Compose プロジェクトの既定の保存先
  guiBuilds: path.join(dataDir, 'gui-builds'), // ビルド用ファイル (同梱プリセットのコピー・自作 GUI アプリ)
  guiPresets: path.join(dataDir, 'gui-presets'), // ファイルで追加する GUI プリセット
  builtinGuiPresets: path.join(__dirname, '..', 'gui', 'presets'), // 同梱 GUI プリセット
  guiExamples: path.join(__dirname, '..', 'gui', 'examples'), // data/gui-presets/examples へ初回コピーする見本
  appIcon: app.isPackaged ? path.join(process.resourcesPath, 'assets', 'icon.ico') : path.join(__dirname, '..', 'assets', 'icon.ico'),
  // wslc の session.storagePath。VHD は <storagePath>\wslc\sessions\<session>\storage.vhdx に作られる
  wslcStorage: dataDir,
};

/** app の ready より前に呼ぶ */
function applyElectronPaths() {
  for (const d of [paths.data, paths.electron, paths.compose, paths.guiBuilds, paths.guiPresets]) fs.mkdirSync(d, { recursive: true });
  app.setPath('userData', paths.electron);
  app.setPath('sessionData', paths.electron);
  app.setPath('logs', path.join(paths.electron, 'logs'));
  app.setPath('crashDumps', path.join(paths.electron, 'crashDumps'));
}

/** data 配下のパスは相対パスで保存し、フォルダーごと移動しても動くようにする */
function toStored(p) {
  if (!p) return p;
  const rel = path.relative(paths.root, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
}

function fromStored(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(paths.root, p);
}

module.exports = { paths, applyElectronPaths, toStored, fromStored };

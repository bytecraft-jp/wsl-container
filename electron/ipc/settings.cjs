// アプリ設定と、wslc の保存先・VHDX の縮小
const path = require('node:path');
const { dialog } = require('electron');
const wslc = require('../services/wslc.cjs');
const settings = require('../services/settings.cjs');
const { paths } = require('../services/paths.cjs');
const storage = require('../storage/wslc-storage.cjs');
const { validateTarget, compactVhd } = require('../storage/vhd-compact.cjs');

module.exports = function registerSettings({ handle, send, state, getWindow }) {
  handle('settings:get', () => settings.publicSettings());
  handle('settings:set', (patch) => {
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'wslcStoragePath')) {
      throw new Error('保存先は設定画面の「保存先を変更」から変更してください');
    }
    const s = settings.set(patch);
    wslc.setSession(s.session);
    return s;
  });
  handle('settings:setSecret', (key, value) => {
    if (key !== 'hubToken') throw new Error('invalid key');
    return settings.setSecret(key, value);
  });

  const storageState = () => ({
    storagePath: paths.wslcStorage,
    vhds: storage.findVhds([paths.wslcStorage, paths.data, process.env.LOCALAPPDATA]),
    compactBusy: state.compactBusy,
    compactResult: state.compactResult,
  });
  handle('storage:get', storageState);
  handle('storage:setPath', (target) => {
    if (typeof target !== 'string' || !target.trim() || !path.isAbsolute(target.trim())) {
      throw new Error('保存先には絶対パスのフォルダーを指定してください');
    }
    const destination = path.resolve(target.trim());
    storage.ensureStoragePath(destination);
    const s = settings.set({ wslcStoragePath: destination });
    paths.wslcStorage = destination;
    return { ...storageState(), settings: s };
  });
  handle('storage:compact', async (jobId, target) => {
    if (state.compactBusy) throw new Error('VHDX の最適化はすでに実行中です');
    if (state.activeOperations || state.streams.size || state.ptys.size) throw new Error('実行中のタスクとターミナルを終了してから再実行してください');
    const vhd = validateTarget(target, storageState().vhds);
    // 旧保存先のディスクでは、同名の現行セッションを停止しない。
    const prepare = path.resolve(path.dirname(path.dirname(path.dirname(path.dirname(vhd.path))))).toLowerCase() === path.resolve(paths.wslcStorage).toLowerCase();
    state.compactBusy = true;
    state.compactResult = null;
    try {
      const confirmation = await dialog.showMessageBox(getWindow(), {
        type: 'warning', title: 'VHDX の縮小・最適化',
        message: prepare ? `セッション「${vhd.session}」を停止して最適化しますか？` : '停止済みの VHDX を最適化しますか？',
        detail: `${vhd.path}\n\n${prepare ? 'このセッションのコンテナーと GUI アプリは停止します。完了後、必要なコンテナーを起動してください。' : '旧保存先のディスクです。使用している外部のセッションがあれば、先に終了してください。'}\nイメージやボリュームは削除しません。空き領域の状態によってサイズが減らない場合もあります。\n管理者権限が必要な場合は Windows の確認画面が表示されます。`,
        buttons: ['キャンセル', prepare ? '停止して最適化' : '最適化'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (confirmation.response !== 1) return { cancelled: true };
      validateTarget(target, storageState().vhds);
      state.compactResult = await compactVhd(vhd, { exe: wslc.findWslc(), prepare, log: (d) => send('stream:data', jobId, d) });
      const r = state.compactResult;
      send('stream:data', jobId, `完了: ${r.before} → ${r.after} bytes (${r.reclaimed} bytes 削減)\n`);
      return r;
    } finally { state.compactBusy = false; }
  });
};

// IPC ハンドラーの共通処理と、ハンドラー間で共有する状態
const { ipcMain } = require('electron');
const wslc = require('../services/wslc.cjs');

// wslc を使う操作。VHDX の最適化中は受け付けず、実行中の件数を数える
const usesWslc = (ch) => /^(wslc:|compose:|registry:)/.test(ch) || ['stream:start', 'pty:start', 'settings:set', 'storage:setPath'].includes(ch);

function createIpc(getWindow) {
  const state = {
    streams: new Map(),
    ptys: new Map(),
    compactBusy: false,
    compactResult: null,
    activeOperations: 0,
    lastWslcStatus: null,
  };

  function send(channel, ...args) {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  }

  /** 戻り値は { ok, data } / { ok: false, error }。preload 側で例外に戻す */
  function handle(ch, fn) {
    ipcMain.handle(ch, async (_e, ...args) => {
      let counted = false;
      try {
        if (ch === 'wslc:status' && state.compactBusy) {
          return { ok: true, data: { ...(state.lastWslcStatus || { found: !!wslc.findWslc(), ok: true }), maintenance: true } };
        }
        if (usesWslc(ch)) {
          if (state.compactBusy) throw new Error('VHDX の最適化中です。完了までお待ちください');
          state.activeOperations++;
          counted = true;
        }
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      } finally {
        if (counted) state.activeOperations--;
      }
    });
  }

  /** ウィンドウを閉じたときに実行中のストリームと端末を止める */
  function stopAll() {
    state.streams.forEach((s) => s.kill());
    state.ptys.forEach((p) => p.kill());
    state.streams.clear();
    state.ptys.clear();
  }

  return { handle, send, state, getWindow, stopAll };
}

module.exports = { createIpc };

// wslc コマンドの実行・ストリーミング・端末 (ConPTY)
const { ipcMain } = require('electron');
const wslc = require('../services/wslc.cjs');
const pty = require('../services/pty.cjs');

module.exports = function registerWslc({ handle, send, state }) {
  handle('wslc:run', (args, opts) => {
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) throw new Error('invalid args');
    return wslc.run(args, opts || {});
  });
  handle('wslc:status', async () => {
    const exe = wslc.findWslc();
    if (!exe) return { found: false };
    const v = await wslc.run(['info', '--format', 'json'], { timeout: 60000 });
    let info = null;
    try { info = JSON.parse(v.stdout); } catch { /* ignore */ }
    state.lastWslcStatus = { found: true, path: exe, ok: v.code === 0, info, error: v.code === 0 ? '' : v.stderr, pty: pty.hasPty() };
    return state.lastWslcStatus;
  });

  handle('stream:start', (id, args, opts = {}) => {
    const h = wslc.stream(args, {
      cwd: opts.cwd,
      onData: (d) => send('stream:data', id, d),
      onExit: (code) => {
        state.streams.delete(id);
        send('stream:exit', id, code);
      },
    });
    state.streams.set(id, h);
    return true;
  });
  handle('stream:stop', (id) => {
    state.streams.get(id)?.kill();
    state.streams.delete(id);
    return true;
  });

  handle('pty:start', (id, opts) => {
    const p = pty.start(opts, {
      onData: (d) => send('pty:data', id, d),
      onExit: (code) => {
        state.ptys.delete(id);
        send('pty:exit', id, code);
      },
    });
    state.ptys.set(id, p);
    return true;
  });
  ipcMain.on('pty:write', (_e, id, data) => state.ptys.get(id)?.write(data));
  ipcMain.on('pty:resize', (_e, id, c, r) => state.ptys.get(id)?.resize(c, r));
  handle('pty:stop', (id) => {
    state.ptys.get(id)?.kill();
    state.ptys.delete(id);
    return true;
  });
};

// コンテナー内シェル用の疑似端末。node-pty (ConPTY) が使えない場合はパイプ接続にフォールバック
const { spawn } = require('node:child_process');
const wslc = require('./wslc.cjs');

let nodePty = null;
try {
  nodePty = require('@lydell/node-pty');
} catch {
  nodePty = null;
}

const SHELL_PICK = 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi';

function buildArgs(opts) {
  if (opts.kind === 'exec') {
    const shell = opts.shell && opts.shell !== 'auto' ? [opts.shell] : ['sh', '-c', SHELL_PICK];
    const user = opts.user ? ['-u', opts.user] : [];
    return ['exec', '-it', ...user, opts.container, ...shell];
  }
  if (opts.kind === 'attach') return ['attach', opts.container];
  if (opts.kind === 'run') return opts.args;
  throw new Error(`unknown pty kind: ${opts.kind}`);
}

function start(opts, { onData, onExit }) {
  const exe = wslc.findWslc();
  if (!exe) {
    onData('wslc.exe が見つかりません。\r\n');
    onExit(-1);
    return { write() {}, resize() {}, kill() {} };
  }
  const args = wslc.withSession(buildArgs(opts));
  if (nodePty) {
    const p = nodePty.spawn(exe, args, {
      name: 'xterm-256color',
      cols: opts.cols || 120,
      rows: opts.rows || 30,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    p.onData(onData);
    p.onExit(({ exitCode }) => onExit(exitCode));
    return {
      write: (d) => p.write(d),
      resize: (c, r) => {
        try { p.resize(c, r); } catch { /* ignore */ }
      },
      kill: () => {
        try { p.kill(); } catch { /* ignore */ }
      },
    };
  }
  const child = spawn(exe, args, { windowsHide: true });
  const fix = (d) => d.toString('utf8').replace(/\r?\n/g, '\r\n');
  child.stdout.on('data', (d) => onData(fix(d)));
  child.stderr.on('data', (d) => onData(fix(d)));
  child.on('close', (c) => onExit(c ?? -1));
  return {
    write: (d) => child.stdin.write(d.replace(/\r/g, '\n')),
    resize() {},
    kill: () => child.kill(),
  };
}

module.exports = { start, hasPty: () => !!nodePty };

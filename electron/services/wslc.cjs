// wslc.exe (WSL3 Container CLI) の呼び出しラッパー
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CANDIDATES = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WSL', 'wslc.exe'),
  'C:\\Program Files\\WSL\\wslc.exe',
];

let cachedPath = null;
function findWslc() {
  if (cachedPath) return cachedPath;
  for (const c of CANDIDATES) {
    if (fs.existsSync(c)) return (cachedPath = c);
  }
  return null;
}

let sessionName = '';
function setSession(name) {
  sessionName = (name || '').trim();
}

function withSession(args) {
  return sessionName ? ['--session', sessionName, ...args] : args;
}

/** wslc を実行して結果をまとめて返す */
function run(args, { input, cwd, timeout = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const exe = findWslc();
    if (!exe) {
      resolve({ code: -1, stdout: '', stderr: 'wslc.exe が見つかりません。WSL3 をインストールしてください。' });
      return;
    }
    const child = spawn(exe, withSession(args), { cwd, windowsHide: true });
    const out = [];
    const err = [];
    const timer = timeout ? setTimeout(() => child.kill(), timeout) : null;
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: '', stderr: String(e.message || e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** 長時間実行 (logs -f, pull, build など) をストリームで返す */
function stream(args, { cwd, onData, onExit } = {}) {
  const exe = findWslc();
  if (!exe) {
    onData?.('wslc.exe が見つかりません。\n');
    onExit?.(-1);
    return { kill() {} };
  }
  const child = spawn(exe, withSession(args), { cwd, windowsHide: true });
  child.stdout.on('data', (d) => onData?.(d.toString('utf8')));
  child.stderr.on('data', (d) => onData?.(d.toString('utf8')));
  child.on('error', (e) => onData?.(`${e.message}\n`));
  child.on('close', (code) => onExit?.(code ?? -1));
  child.stdin.end();
  return {
    kill() {
      try { child.kill(); } catch { /* ignore */ }
    },
  };
}

/** JSON Lines (または JSON 配列) の出力をパース */
function parseJsonLines(text) {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try { return JSON.parse(t); } catch { /* fallthrough */ }
  }
  return t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

module.exports = { findWslc, run, stream, parseJsonLines, setSession, withSession };

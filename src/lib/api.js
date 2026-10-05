// メインプロセスとの通信ラッパー
const api = window.api;

export const invoke = (channel, ...args) => api.invoke(channel, ...args);

let seq = 0;
export const newId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${++seq}`;

function parseLines(text) {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch {
      /* fallthrough */
    }
  }
  return t
    .split(/\r?\n/)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** wslc を実行し stdout を返す。失敗時は例外 */
export async function wslc(args, opts) {
  const r = await invoke('wslc:run', args, opts);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
  return r.stdout;
}

export async function wslcJson(args) {
  return parseLines(await wslc(args));
}

export async function inspect(ids, type) {
  const list = Array.isArray(ids) ? ids : [ids];
  const args = ['inspect'];
  if (type) args.push('--type', type);
  const out = await wslc([...args, ...list]);
  return JSON.parse(out);
}

// ---- ストリーム ----
const streamHandlers = new Map();
api.on('stream:data', (id, d) => streamHandlers.get(id)?.onData?.(d));
api.on('stream:exit', (id, c) => {
  const h = streamHandlers.get(id);
  streamHandlers.delete(id);
  h?.onExit?.(c);
});

export function listen(id, handlers) {
  streamHandlers.set(id, handlers);
  return () => streamHandlers.delete(id);
}

export function startStream(args, { onData, onExit, cwd } = {}) {
  const id = newId('st');
  streamHandlers.set(id, { onData, onExit });
  invoke('stream:start', id, args, { cwd }).catch((e) => {
    onData?.(`${e.message}\n`);
    streamHandlers.delete(id);
    onExit?.(-1);
  });
  return { id, stop: () => invoke('stream:stop', id).catch(() => {}) };
}

// ---- 端末 ----
const ptyHandlers = new Map();
api.on('pty:data', (id, d) => ptyHandlers.get(id)?.onData?.(d));
api.on('pty:exit', (id, c) => {
  const h = ptyHandlers.get(id);
  ptyHandlers.delete(id);
  h?.onExit?.(c);
});

export function startPty(opts, { onData, onExit }) {
  const id = newId('pty');
  ptyHandlers.set(id, { onData, onExit });
  invoke('pty:start', id, opts).catch((e) => {
    onData?.(`\r\n${e.message}\r\n`);
    onExit?.(-1);
  });
  return {
    id,
    write: (d) => api.ptyWrite(id, d),
    resize: (c, r) => api.ptyResize(id, c, r),
    stop: () => {
      ptyHandlers.delete(id);
      return invoke('pty:stop', id).catch(() => {});
    },
  };
}

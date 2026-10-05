// 「コンテナーを実行」フォームの値から wslc run の引数を組み立てる
import { presetGuiPath } from './gui/presets.js';
export const GUI_PORT_LABEL = 'wcs.gui.port';
export const GUI_SCHEME_LABEL = 'wcs.gui.scheme';
export const GUI_PATH_LABEL = 'wcs.gui.path';

export function emptyRunForm() {
  return {
    image: '',
    name: '',
    command: '',
    entrypoint: '',
    ports: [],
    env: [],
    volumes: [],
    labels: [],
    network: '',
    hostname: '',
    workdir: '',
    user: '',
    cpus: '',
    memory: '',
    shm: '',
    gpus: false,
    rm: false,
    tty: true,
    interactive: true,
    pull: 'missing',
    guiPort: '',
    guiScheme: 'http',
    guiPath: '',
    openViewer: true,
    openTerminal: false,
  };
}

/** コマンド文字列をシェル風に分割 */
function splitCommand(str) {
  const out = [];
  let cur = '';
  let q = null;
  let has = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else cur += c;
  }
  if (has || cur) out.push(cur);
  return out;
}

export function buildRunArgs(f) {
  const a = ['run', '-d'];
  if (f.name) a.push('--name', f.name.trim());
  if (f.rm) a.push('--rm');
  if (f.interactive) a.push('-i');
  if (f.tty) a.push('-t');
  if (f.pull && f.pull !== 'missing') a.push('--pull', f.pull);
  for (const p of f.ports || []) {
    if (!p.container) continue;
    let s = String(p.container);
    if (p.host) s = `${p.host}:${s}`;
    if (p.ip) s = `${p.ip}:${s}`;
    if (p.proto && p.proto !== 'tcp') s += `/${p.proto}`;
    a.push('-p', s);
  }
  for (const e of f.env || []) if (e.key) a.push('-e', `${e.key}=${e.value ?? ''}`);
  for (const v of f.volumes || []) {
    if (!v.target) continue;
    const spec = v.source ? `${v.source}:${v.target}${v.readonly ? ':ro' : ''}` : v.target;
    a.push('-v', spec);
  }
  if (f.network) a.push('--network', f.network);
  if (f.hostname) a.push('-h', f.hostname);
  if (f.workdir) a.push('-w', f.workdir);
  if (f.user) a.push('-u', f.user);
  if (f.cpus) a.push('--cpus', String(f.cpus));
  if (f.memory) a.push('-m', f.memory);
  if (f.shm) a.push('--shm-size', f.shm);
  if (f.gpus) a.push('--gpus', 'all');
  if (f.entrypoint) a.push('--entrypoint', f.entrypoint);
  for (const l of f.labels || []) if (l.key) a.push('-l', `${l.key}=${l.value ?? ''}`);
  if (f.guiPort) {
    a.push('-l', `${GUI_PORT_LABEL}=${f.guiPort}`, '-l', `${GUI_SCHEME_LABEL}=${f.guiScheme || 'http'}`);
    if (f.guiPath) a.push('-l', `${GUI_PATH_LABEL}=${f.guiPath}`);
  }
  a.push(f.image.trim());
  if (f.command && f.command.trim()) a.push(...splitCommand(f.command.trim()));
  return a;
}

/** inspect 結果から「同じ設定で実行」用のフォームを作る */
export function formFromInspect(c) {
  const f = emptyRunForm();
  f.image = c.Config?.Image || '';
  f.env = (c.Config?.Env || [])
    .filter((e) => !e.startsWith('PATH='))
    .map((e) => {
      const i = e.indexOf('=');
      return { key: e.slice(0, i), value: e.slice(i + 1) };
    });
  f.ports = Object.entries(c.Ports || c.NetworkSettings?.Ports || {}).flatMap(([k, v]) => {
    const [port, proto] = k.split('/');
    return (v || []).map((b) => ({ ip: b.HostIp === '0.0.0.0' ? '' : b.HostIp, host: b.HostPort, container: port, proto }));
  });
  f.volumes = (c.Mounts || []).map((m) => ({ source: m.Name || m.Source, target: m.Destination, readonly: m.RW === false }));
  f.command = (c.Config?.Cmd || []).map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ');
  f.workdir = c.Config?.WorkingDir && c.Config.WorkingDir !== '/' ? c.Config.WorkingDir : '';
  f.user = c.Config?.User || '';
  const labels = c.Config?.Labels || {};
  f.labels = Object.entries(labels)
    .filter(([k]) => !k.startsWith('com.microsoft.') && !k.startsWith('wcs.') && !k.startsWith('com.docker.compose'))
    .map(([key, value]) => ({ key, value }));
  if (labels[GUI_PORT_LABEL]) {
    f.guiPort = labels[GUI_PORT_LABEL];
    f.guiScheme = labels[GUI_SCHEME_LABEL] || 'http';
    f.guiPath = labels[GUI_PATH_LABEL] || presetGuiPath({ Image: f.image });
  }
  return f;
}

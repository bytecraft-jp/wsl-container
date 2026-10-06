import { emptyRunForm } from '../runArgs.js';

export const PRESET_LABEL = 'wcs.gui.preset';
export const PRESET_HASH_LABEL = 'wcs.gui.hash';

/** プリセットからコンテナー実行フォームを作る。hash はプリセット内容のハッシュ (変更検出用のラベル) */
export function presetForm(p, hash = '') {
  const f = emptyRunForm();
  f.image = p.image;
  f.name = p.containerName || `wcs-gui-${p.id}`;
  f.tty = false;
  f.interactive = false;
  f.ports = [{ ip: '127.0.0.1', host: String(p.hostPort), container: String(p.port), proto: 'tcp' }];
  f.env = Object.entries(p.env || {}).map(([key, value]) => ({ key, value }));
  if (p.auth === 'kasm') {
    if (!f.env.some((e) => e.key === 'VNC_PW')) f.env.push({ key: 'VNC_PW', value: crypto.randomUUID().replaceAll('-', '') });
    f.labels.push({ key: 'wcs.gui.auth', value: 'kasm' });
  }
  f.labels.push({ key: PRESET_LABEL, value: p.id });
  if (hash) f.labels.push({ key: PRESET_HASH_LABEL, value: hash });
  f.volumes = p.volumes ? p.volumes.map((v) => ({ ...v })) : [{ source: p.configVolume || `wcs-gui-${p.id}-config`, target: p.configTarget || '/config', readonly: false }];
  for (const key of ['command', 'entrypoint', 'user', 'workdir', 'network', 'memory', 'cpus']) if (p[key]) f[key] = p[key];
  f.shm = p.shm || '';
  f.guiPort = String(p.hostPort);
  f.guiScheme = p.scheme;
  f.guiPath = p.guiPath || '';
  f.openViewer = true;
  return f;
}

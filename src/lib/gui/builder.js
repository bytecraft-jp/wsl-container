import { reactive, ref, computed, watch } from 'vue';
import YAML from 'yaml';

/** 任意の Linux GUI アプリを noVNC 付きイメージにする Dockerfile を生成 */
function customGuiDockerfile({ appName, packages }) {
  const pkgs = packages.split(/[\s,]+/).filter(Boolean);
  return [
    '# 日本語 Ubuntu・Fcitx5 + Mozc (半角/全角で切り替え)・TigerVNC/noVNC (ポート 5800) の共通ベースです',
    'FROM wcs-gui/ubuntu-base:22.04',
    '',
    `ENV APP_NAME="${appName.replace(/"/g, '')}"`,
    '',
    pkgs.length ? `RUN apt-get update && apt-get install -y --no-install-recommends ${pkgs.join(' ')} && rm -rf /var/lib/apt/lists/*` : '# 共通ベースのアプリをそのまま使用します',
    '',
    'COPY startapp.sh /usr/local/bin/startapp.sh',
    'RUN chmod +x /usr/local/bin/startapp.sh',
    'CMD ["/usr/local/bin/startapp.sh"]',
    '',
  ].join('\n');
}

export function customStartScript(command) {
  return `#!/bin/sh\nexec ${command}\n`;
}

export function createGuiBuilder(storage) {
  const defaults = { appName: 'GIMP', packages: 'gimp', command: 'gimp', port: '5900' };
  let saved;
  try { saved = JSON.parse(storage?.getItem('wcs.gui-builder') || 'null'); } catch { /* 新規ドラフト */ }
  const custom = reactive({ ...defaults });
  for (const key of Object.keys(defaults)) {
    if (typeof saved?.custom?.[key] === typeof defaults[key]) custom[key] = saved.custom[key];
  }
  const dockerfile = ref(typeof saved?.dockerfile === 'string' ? saved.dockerfile : customGuiDockerfile(custom));
  const manuallyEdited = computed(() => dockerfile.value !== customGuiDockerfile(custom));
  watch(() => customGuiDockerfile(custom), (next, previous) => {
    // フォームと同期するのは生成されたままの文書だけ。手編集は保持する。
    if (dockerfile.value === previous) dockerfile.value = next;
  }, { flush: 'sync' });
  watch(() => JSON.stringify({ custom, dockerfile: dockerfile.value }), (draft) => {
    try { storage?.setItem('wcs.gui-builder', draft); } catch { /* 容量超過でも編集を続ける */ }
  }, { flush: 'sync' });
  function regenerate() { dockerfile.value = customGuiDockerfile(custom); }
  return { custom, dockerfile, manuallyEdited, regenerate };
}

/** アプリ名からプリセットの id (英小文字・数字・ハイフン) を作る */
export function builderSlug(appName) {
  return appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '') || 'app';
}

/** 自作 GUI アプリのプリセット定義 (data/gui-presets/<id>/preset.yaml の内容)。manual: Dockerfile を手編集している */
export function builderPreset({ appName, packages, port }, manual = false) {
  const id = builderSlug(appName);
  const pkgs = packages.split(/[\s,]+/).filter(Boolean);
  return {
    id,
    title: appName,
    description: manual ? '自作 GUI アプリ（Dockerfile を手編集）' : `自作 GUI アプリ${pkgs.length ? `（apt: ${pkgs.join(' ')}）` : ''}`,
    image: `wcs-gui/${id}:latest`,
    port: 5800,
    hostPort: Number(port),
    guiPath: '/vnc.html?autoconnect=1&resize=remote',
    shm: '1g',
    order: 50,
    build: { context: '.', requires: ['ubuntu-base'] },
  };
}

/** Dockerfile の最後の CMD を表示用の 1 行にする (なければ空文字) */
export function dockerfileCommand(text) {
  // 行継続 (\) をつなげてから探す。heredoc の中身は誤検出しうるが表示用なので許容する
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  const cmd = lines.map((l) => l.match(/^\s*CMD\s+(.+?)\s*$/i)).filter(Boolean).pop();
  if (!cmd) return '';
  try {
    const parsed = JSON.parse(cmd[1]);
    if (Array.isArray(parsed)) return parsed.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
  } catch { /* シェル形式 */ }
  return cmd[1];
}

/** Dockerfile がフォームの startapp.sh を使うか */
export function usesStartScript(text) {
  return /startapp\.sh/.test(text);
}

// フォームで決まる項目。既存の preset.yaml に書いた env・volumes などとコメントは保持する
const FORM_KEYS = ['id', 'title', 'description', 'image', 'hostPort', 'build'];

/** 保存する preset.yaml の内容。existing (既存ファイルの内容) があれば、フォームで決まる項目だけ書き換える */
export function builderPresetYaml(preset, existing = '') {
  let doc = null;
  if (existing.trim()) {
    try {
      doc = YAML.parseDocument(existing);
      if (doc.errors.length || !YAML.isMap(doc.contents)) doc = null;
    } catch { doc = null; }
  }
  if (!doc) {
    return `# 「自作 GUI アプリ」で作成したプリセットです。フォームから保存し直すと id・title・image・hostPort などを書き換えます（env などの追加項目は残ります）。\n${YAML.stringify(preset)}`;
  }
  for (const [key, value] of Object.entries(preset)) {
    if (FORM_KEYS.includes(key) || !doc.has(key)) doc.set(key, value);
  }
  return doc.toString();
}

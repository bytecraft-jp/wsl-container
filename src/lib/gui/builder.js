import { reactive, ref, computed, watch } from 'vue';

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

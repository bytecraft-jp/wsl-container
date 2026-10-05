// コンテナー操作と右クリックメニューの定義 (コンテナー画面・Compose 画面・GUI 画面で共用)
import {
  Play, Square, RotateCw, Zap, Trash2, FileText, Terminal, Info, Activity, Globe, MonitorPlay, Copy, CopyPlus,
  FolderInput, FolderOutput, PackageOpen, Network, Unplug, Link, Hash,
} from '@lucide/vue';
import { wslc, wslcJson, inspect, invoke } from './api.js';
import { act, confirm, prompt, toast, openRun, openTerminal, openViewer, copyText, runJob } from './store.js';
import { parsePorts, labelValue } from './format.js';
import { formFromInspect, GUI_PORT_LABEL, GUI_SCHEME_LABEL, GUI_PATH_LABEL } from './runArgs.js';
import { presetGuiPath } from './gui/presets.js';
import { guiViewerUrl } from './gui/viewer.js';

const nameOf = (c) => c.Names || c.name || c.ID;

export async function lifecycle(action, ids, label) {
  if (!ids.length) return;
  const labels = { start: '開始', stop: '停止', restart: '再起動', kill: '強制終了' };
  return act(() => wslc([action, ...ids]), {
    success: `${label || `${ids.length} 件のコンテナー`}を${labels[action]}しました`,
    error: `${labels[action]}に失敗しました`,
  });
}

export async function removeContainers(ids, { force = false, label } = {}) {
  if (!ids.length) return;
  const ok = await confirm({
    title: 'コンテナーの削除',
    message: `${label || `${ids.length} 件のコンテナー`}を削除します。${force ? '\n実行中でも強制的に削除されます。' : ''}\nこの操作は元に戻せません。`,
    okText: '削除',
    danger: true,
  });
  if (!ok) return;
  return act(() => wslc(['remove', ...(force ? ['-f'] : []), ...ids]), { success: '削除しました', error: '削除に失敗しました' });
}

export async function pruneContainers() {
  const ok = await confirm({ title: '停止中のコンテナーを削除', message: '停止しているすべてのコンテナーを削除します。', okText: '削除', danger: true });
  if (ok) act(() => wslc(['container', 'prune', '-f']), { success: '停止中のコンテナーを削除しました' });
}

export function guiInfo(c) {
  const port = labelValue(c.Labels, GUI_PORT_LABEL);
  if (!port) return null;
  return { port, scheme: labelValue(c.Labels, GUI_SCHEME_LABEL) || 'http', path: labelValue(c.Labels, GUI_PATH_LABEL) || presetGuiPath(c) };
}

async function copyToContainer(c) {
  const files = await invoke('fs:open', { properties: ['openFile', 'multiSelections'] });
  if (!files?.length) return;
  const dest = await prompt({ title: 'コンテナーへコピー', label: 'コピー先 (コンテナー内のパス)', value: '/tmp/', okText: 'コピー' });
  if (!dest) return;
  for (const f of files) await act(() => wslc(['container', 'cp', f, `${c.ID}:${dest}`]), { success: `コピーしました: ${f}` });
}

async function copyFromContainer(c) {
  const src = await prompt({ title: 'コンテナーからコピー', label: 'コピー元 (コンテナー内のパス)', placeholder: '/etc/hosts', okText: '次へ' });
  if (!src) return;
  const dest = await invoke('fs:open', { properties: ['openDirectory', 'createDirectory'], title: '保存先フォルダー' });
  if (!dest?.[0]) return;
  await act(() => wslc(['container', 'cp', `${c.ID}:${src}`, dest[0]]), { success: `${dest[0]} にコピーしました` });
}

async function exportContainer(c) {
  const p = await invoke('fs:save', { defaultPath: `${nameOf(c)}.tar`, filters: [{ name: 'tar', extensions: ['tar'] }] });
  if (p) runJob(`エクスポート: ${nameOf(c)}`, ['export', '-o', p, c.ID]);
}

async function cloneRun(c) {
  try {
    const [info] = await inspect(c.ID);
    const form = formFromInspect(info);
    form.name = '';
    openRun({ title: `同じ設定で実行: ${nameOf(c)}`, form });
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function networkSubmenu(c) {
  try {
    const nets = await wslcJson(['network', 'list', '--format', 'json']);
    const joined = String(c.Networks || '').split(',').map((s) => s.trim());
    return nets.map((n) => {
      const isIn = joined.includes(n.Name);
      return {
        label: n.Name,
        icon: isIn ? Unplug : Link,
        hint: isIn ? '切断' : '接続',
        action: () =>
          act(() => wslc(['network', isIn ? 'disconnect' : 'connect', n.Name, c.ID]), {
            success: `${n.Name} から${isIn ? '切断' : 'に接続'}しました`,
          }),
      };
    });
  } catch {
    return [];
  }
}

/**
 * 1 つのコンテナーまたは複数選択に対する右クリックメニュー
 * @param c 右クリックされたコンテナー (wslc list の 1 行)
 * @param selection 選択中のコンテナー配列 (c を含む)
 * @param openDetail (c, tab) => void。詳細パネルがない画面では省略し、詳細パネル系の項目を出さない
 */
export async function containerMenu(c, selection, openDetail) {
  if (selection.length > 1) {
    const ids = selection.map((x) => x.ID);
    const label = `${selection.length} 件のコンテナー`;
    return [
      { header: `${selection.length} 件を選択中` },
      { label: 'すべて開始', icon: Play, action: () => lifecycle('start', ids, label) },
      { label: 'すべて停止', icon: Square, action: () => lifecycle('stop', ids, label) },
      { label: 'すべて再起動', icon: RotateCw, action: () => lifecycle('restart', ids, label) },
      { label: 'すべて強制終了', icon: Zap, action: () => lifecycle('kill', ids, label) },
      { divider: true },
      { label: '名前をコピー', icon: Copy, action: () => copyText(selection.map(nameOf).join('\n')) },
      { divider: true },
      { label: 'すべて削除', icon: Trash2, danger: true, hint: 'Del', action: () => removeContainers(ids, { force: true, label }) },
    ];
  }
  const running = c.State === 'running';
  const gui = guiInfo(c);
  // GUI の画面は開始ページ付きで下の「ビューアーで開く / ブラウザーで開く」から開くため、そのポートは除く
  const ports = parsePorts(c.Ports).filter((p) => p.host && (!gui || String(p.host) !== String(gui.port)));
  const detail = typeof openDetail === 'function';
  const nets = await networkSubmenu(c);
  return [
    running
      ? { label: '停止', icon: Square, action: () => lifecycle('stop', [c.ID], nameOf(c)) }
      : { label: '開始', icon: Play, action: () => lifecycle('start', [c.ID], nameOf(c)) },
    { label: '再起動', icon: RotateCw, action: () => lifecycle('restart', [c.ID], nameOf(c)) },
    { label: '強制終了', icon: Zap, disabled: !running, action: () => lifecycle('kill', [c.ID], nameOf(c)) },
    { divider: true },
    gui && {
      label: 'ビューアーで開く',
      icon: MonitorPlay,
      disabled: !running,
      action: () => openViewer(gui.port, gui.scheme, nameOf(c), gui.path),
    },
    gui && {
      label: 'ブラウザーで開く',
      icon: Globe,
      disabled: !running,
      action: () => invoke('app:openExternal', guiViewerUrl(gui.port, gui.scheme, gui.path)),
    },
    detail && { label: 'ログを表示', icon: FileText, hint: 'Enter', action: () => openDetail(c, 'logs') },
    {
      label: 'ターミナルを開く',
      icon: Terminal,
      disabled: !running,
      children: [
        detail && { label: 'ここで開く (詳細パネル)', icon: Terminal, action: () => openDetail(c, 'terminal') },
        { label: 'ターミナル画面で開く', icon: Terminal, action: () => openTerminal(nameOf(c), { kind: 'exec', container: c.ID }) },
        { label: 'root で開く', icon: Terminal, action: () => openTerminal(`${nameOf(c)} (root)`, { kind: 'exec', container: c.ID, user: 'root' }) },
        { label: 'メインプロセスにアタッチ', icon: Link, action: () => openTerminal(`${nameOf(c)} (attach)`, { kind: 'attach', container: c.ID }) },
      ].filter(Boolean),
    },
    detail && { label: '詳細 / Inspect', icon: Info, action: () => openDetail(c, 'overview') },
    detail && { label: 'リソース使用状況', icon: Activity, disabled: !running, action: () => openDetail(c, 'stats') },
    ports.length && {
      label: gui ? 'ほかのポートをブラウザーで開く' : 'ブラウザーで開く',
      icon: Globe,
      children: ports.map((p) => ({
        label: `localhost:${p.host} → ${p.container}/${p.proto}`,
        icon: Globe,
        action: () => invoke('app:openExternal', `http://localhost:${p.host}/`),
      })),
    },
    ports.length && {
      label: gui ? 'ほかのポートをアプリ内ビューアーで開く' : 'アプリ内ビューアーで開く',
      icon: MonitorPlay,
      children: ports.map((p) => ({
        label: `localhost:${p.host}`,
        icon: MonitorPlay,
        action: () => openViewer(p.host, 'http', nameOf(c)),
      })),
    },
    { divider: true },
    {
      label: 'ファイル',
      icon: PackageOpen,
      children: [
        { label: 'コンテナーへコピー…', icon: FolderInput, action: () => copyToContainer(c) },
        { label: 'コンテナーからコピー…', icon: FolderOutput, action: () => copyFromContainer(c) },
        { label: 'ファイルシステムをエクスポート (tar)…', icon: PackageOpen, action: () => exportContainer(c) },
      ],
    },
    nets.length && { label: 'ネットワーク', icon: Network, children: nets },
    { label: '同じ設定で新規実行…', icon: CopyPlus, action: () => cloneRun(c) },
    {
      label: 'コピー',
      icon: Copy,
      children: [
        { label: '名前', icon: Copy, action: () => copyText(nameOf(c)) },
        { label: 'ID', icon: Hash, action: () => copyText(c.ID) },
        { label: 'イメージ名', icon: Copy, action: () => copyText(c.Image) },
        { label: 'exec コマンド', icon: Terminal, action: () => copyText(`wslc exec -it ${nameOf(c)} sh`) },
      ],
    },
    { divider: true },
    { label: '削除', icon: Trash2, danger: true, hint: 'Del', action: () => removeContainers([c.ID], { force: running, label: nameOf(c) }) },
  ];
}

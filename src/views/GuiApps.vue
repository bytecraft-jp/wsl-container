<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>GUI アプリ</h1>
        <div class="sub">コンテナー内の Linux GUI アプリをアプリ内ビューアーで操作します</div>
      </div>
      <div class="spacer"></div>
      <button class="btn" @click="openPresetDirectory"><FolderOpen />プリセットフォルダー</button>
      <button class="btn" :disabled="presetLoading" @click="reloadPresets"><RefreshCw :class="{ spin: presetLoading }" />再読み込み</button>
      <button class="btn" @click="openRun({ tab: 'gui', title: 'GUI アプリを実行' })"><Settings2 />任意のイメージで実行</button>
    </div>
    <div class="page-body">
      <div class="notice" style="margin-bottom: 16px">
        <Info />
        <div>
          WSL3 の wslc コンテナーには WSLg (X11 / Wayland) が渡されないため、コンテナー内で
          <b>noVNC / KasmVNC / Selkies</b> などの Web 画面を動かし、その画面をアプリ内のビューアーで表示します。
          クリック・キーボード・クリップボードがそのまま使えます。
        </div>
      </div>

      <div v-if="running.length" class="card" style="margin-bottom: 16px">
        <h3>GUI コンテナー</h3>
        <div v-for="c in running" :key="c.ID" class="g-run" @dblclick="open(c)" @contextmenu="onRunMenu($event, c)">
          <span class="dot" :class="c.State"></span>
          <div class="g-main">
            <b>{{ c.Names }}</b>
            <span class="muted small" style="margin-left: 8px">{{ c.Image }} · localhost:{{ guiInfo(c).port }}</span>
          </div>
          <button class="btn sm primary" :disabled="c.State !== 'running'" @click="open(c)"><MonitorPlay />開く</button>
          <button v-if="c.State !== 'running'" class="btn sm" @click="startGui(c)"><Play />開始</button>
          <button v-else class="btn sm" @click="lifecycle('stop', [c.ID], c.Names)"><Square />停止</button>
          <button class="btn ghost icon sm" @click="onRunMenu($event, c)"><EllipsisVertical /></button>
        </div>
      </div>

      <h3 class="section-title">プリセット</h3>
      <p class="muted small" style="margin-bottom: 12px">「自作」は <span class="mono">data/gui-presets/</span> にあるプリセットです（下の「自作 GUI アプリ」で作成したものや、同梱プリセットを編集したもの）。「Dockerfile…」で編集して保存し、「起動」を押すと変更をビルドして反映します。</p>
      <div v-if="state.presetErrors.length" class="notice error" style="margin-bottom: 12px">
        <Info /><div><b>読み込めなかったプリセット</b>
          <div v-for="error in state.presetErrors" :key="error.file" class="small selectable" style="overflow-wrap: anywhere">{{ error.file }} — {{ error.message }}</div>
        </div>
      </div>
      <div class="presets">
        <div v-for="p in visiblePresets" :key="p.id" class="preset card" @dblclick="launch(p)" @contextmenu="onPresetMenu($event, p)">
          <div class="p-icon" :style="{ background: p.color }"><AppWindow /></div>
          <div class="p-body">
            <div class="row" style="gap: 6px"><b>{{ p.title }}</b><span v-if="p.sourceKind === 'custom'" class="badge blue" :title="p.sourceFile">自作</span></div>
            <div class="muted small">{{ p.description }}</div>
            <div class="mono small p-image">{{ p.image }} · :{{ p.hostPort }}</div>
          </div>
          <div class="p-actions">
            <button class="btn sm primary" :disabled="busy[p.id]" @click="launch(p)">
              <LoaderCircle v-if="busy[p.id]" class="spin" /><Play v-else />起動
            </button>
            <button class="btn sm ghost" @click="configure(p)">設定…</button>
            <button class="btn sm ghost" @click="editPreset(p, 'definition')">定義ファイル…</button>
            <button v-if="p.build" class="btn sm ghost" @click="editPreset(p, 'dockerfile')">Dockerfile…</button>
          </div>
        </div>
      </div>

      <template v-if="basePresets.length">
        <h3 class="section-title">共通ベース</h3>
        <p class="muted small" style="margin-bottom: 12px">各プリセットと自作 GUI アプリの土台になるイメージです（単体では起動しません）。変更すると、次回の「起動」で依存するアプリもビルドし直して再作成します。</p>
        <div class="presets">
          <div v-for="p in basePresets" :key="p.id" class="preset card" @contextmenu="onBaseMenu($event, p)">
            <div class="p-icon" :style="{ background: p.color }"><Layers /></div>
            <div class="p-body">
              <b>{{ p.title }}</b>
              <div class="muted small">{{ p.description }}</div>
              <div class="mono small p-image">{{ p.image }}<template v-if="p.sourceKind === 'custom'"> · 編集済み</template></div>
            </div>
            <div class="p-actions">
              <button class="btn sm" :disabled="busy[p.id]" @click="buildOnly(p)">
                <LoaderCircle v-if="busy[p.id]" class="spin" /><Hammer v-else />ビルド
              </button>
              <button class="btn sm ghost" @click="editPreset(p, 'definition')">定義ファイル…</button>
              <button class="btn sm ghost" @click="editPreset(p, 'dockerfile')">Dockerfile…</button>
            </div>
          </div>
        </div>
      </template>

      <h3 class="section-title">自作 GUI アプリ (apt パッケージから作成)</h3>
      <GuiAppBuilder />
    </div>
    <PresetFileEditor v-if="editing" :preset-id="editing.id" :initial="editing.initial" @close="editing = null" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  Info, MonitorPlay, Play, Square, EllipsisVertical, AppWindow, LoaderCircle, Settings2, RefreshCw,
  ExternalLink, FolderOpen, FileCode2, Hammer, Layers,
} from '@lucide/vue';
import PresetFileEditor from '../components/PresetFileEditor.vue';
import GuiAppBuilder from '../components/GuiAppBuilder.vue';
import { useContainers } from '../lib/useContainers.js';
import { guiInfo, lifecycle, containerMenu } from '../lib/containerActions.js';
import { GUI_PRESETS } from '../lib/gui/presets.js';
import { buildPreset } from '../lib/gui/build.js';
import { presetForm, PRESET_LABEL } from '../lib/gui/presetForm.js';
import { labelValue } from '../lib/format.js';
import { launchPreset } from '../lib/gui/launch.js';
import { state, loadGuiPresets, openRun, openViewer, toast } from '../lib/store.js';
import { invoke } from '../lib/api.js';
import { showMenu } from '../lib/contextMenu.js';

const { containers } = useContainers({ stats: false });
const visiblePresets = computed(() => GUI_PRESETS.filter(p => !p.hidden));
// 非表示のビルド用プリセット (Ubuntu 日本語ベースなど) も、編集とビルドはできるようにする
const basePresets = computed(() => GUI_PRESETS.filter(p => p.hidden && p.build));
const running = computed(() => containers.value.filter((c) => guiInfo(c)));
const busy = reactive({});
const editing = ref(null);
function editPreset(p, initial) { editing.value = { id: p.id, initial }; }
const presetLoading = ref(false);
async function reloadPresets() {
  if (presetLoading.value) return;
  presetLoading.value = true;
  try { await loadGuiPresets(); }
  catch (e) { toast(e.message, 'error'); }
  finally { presetLoading.value = false; }
}
async function openPresetDirectory() {
  try {
    if (!state.presetDirectory) await loadGuiPresets();
    await invoke('app:openPath', state.presetDirectory);
  } catch (e) { toast(e.message, 'error'); }
}

onMounted(reloadPresets);

function open(c) {
  const g = guiInfo(c);
  openViewer(g.port, g.scheme, c.Names, g.path);
}

/** プリセットのコンテナーは「起動」と同じく、定義・Dockerfile の変更があればビルドし直して作り直す */
function startGui(c) {
  const p = GUI_PRESETS.find((item) => item.id === labelValue(c.Labels, PRESET_LABEL));
  return p ? launch(p) : lifecycle('start', [c.ID], c.Names);
}

/** プリセットを起動。定義や Dockerfile が変わっていればビルドし直して作り直す (lib/gui/launch.js) */
async function launch(p) {
  if (busy[p.id]) return;
  busy[p.id] = true;
  try { await launchPreset(p); }
  catch (e) { toast(e.message, 'error'); }
  finally { busy[p.id] = false; }
}

/** 共通ベースなど、起動しないプリセットをビルドだけする */
async function buildOnly(p) {
  if (busy[p.id]) return;
  busy[p.id] = true;
  try {
    if (await buildPreset(p)) toast(`${p.image} をビルドしました`, 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { busy[p.id] = false; }
}

async function configure(listed) {
  if (busy[listed.id]) return;
  busy[listed.id] = true;
  let p = listed;
  let hash = '';
  try {
    // 定義ファイルの編集後も一覧が古いままのことがあるため、最新の定義で実行フォームを作る
    await loadGuiPresets();
    p = GUI_PRESETS.find((item) => item.id === listed.id);
    if (!p) throw new Error(`プリセット「${listed.id}」が見つかりません。定義ファイルのエラーを確認してください`);
    hash = await invoke('gui-presets:hash', p.id);
    if (p.build && !await buildPreset(p)) return;
  } catch (e) { toast(e.message, 'error'); return; }
  finally { busy[listed.id] = false; }
  openRun({ title: `${p.title} を設定して起動`, form: presetForm(p, hash), tab: 'basic' });
}

function onBaseMenu(e, p) {
  showMenu(e, [
    { label: 'ビルド', icon: Hammer, action: () => buildOnly(p) },
    { label: '定義ファイルを編集…', icon: FileCode2, action: () => editPreset(p, 'definition') },
    { label: 'Dockerfile を編集…', icon: FileCode2, action: () => editPreset(p, 'dockerfile') },
  ], p.title);
}

function onPresetMenu(e, p) {
  const repo = p.image.split(':')[0];
  showMenu(e, [
    { label: '起動して開く', icon: Play, hint: 'ダブルクリック', action: () => launch(p) },
    { label: '設定を変えて起動…', icon: Settings2, action: () => configure(p) },
    { label: '定義ファイルを編集…', icon: FileCode2, action: () => editPreset(p, 'definition') },
    p.build
      ? { label: 'Dockerfile を編集…', icon: FileCode2, action: () => editPreset(p, 'dockerfile') }
      : { label: 'Docker Hub で見る', icon: ExternalLink, action: () => invoke('app:openExternal', `https://hub.docker.com/r/${repo}`) },
  ], p.title);
}

async function onRunMenu(e, c) {
  const { clientX, clientY } = e;
  e.preventDefault();
  e.stopPropagation();
  // この画面には詳細パネルがないため openDetail は渡さない (詳細パネル系の項目は出ない)
  const items = await containerMenu(c, [c]);
  showMenu({ preventDefault() {}, stopPropagation() {}, clientX, clientY }, items, c.Names);
}
</script>

<style scoped>
.section-title {
  font-size: 14px;
  margin: 6px 0 10px;
}
.g-run {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
}
.g-run:last-child {
  border-bottom: none;
}
.g-main {
  flex: 1;
  min-width: 0;
}
.presets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  margin-bottom: 22px;
}
.preset {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  transition: border-color 0.15s;
}
.preset:hover {
  border-color: var(--border-2);
}
.p-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.p-icon svg {
  width: 21px;
  color: #fff;
}
.p-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.p-image {
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.p-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>

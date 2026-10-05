<template>
  <div class="card builder">
    <div class="b-form">
      <label class="field">アプリ名<input v-model="custom.appName" class="input" placeholder="GIMP" /></label>
      <label class="field">apt パッケージ (スペース区切り)<input v-model="custom.packages" class="input mono" placeholder="gimp" /></label>
      <label class="field">起動コマンド<input v-model="custom.command" class="input mono" placeholder="gimp" /></label>
      <div class="grid-2">
        <label class="field">ホスト側ポート<input v-model="custom.port" class="input mono" /></label>
        <label class="field">イメージ名<input :value="customImage" class="input mono" disabled /></label>
      </div>
      <div class="muted small">日本語ロケール・日本語フォント・Mozc は共通 Ubuntu ベースに含まれます。</div>
      <div class="row">
        <button class="btn" :disabled="buildBusy" @click="regenerate"><RefreshCw />Dockerfile を再生成</button>
        <div class="spacer"></div>
        <button class="btn primary" :disabled="!custom.appName || !custom.command || buildBusy" @click="buildAndRun">
          <LoaderCircle v-if="buildBusy" class="spin" /><Hammer v-else />ビルドして起動
        </button>
      </div>
    </div>
    <div class="b-editor">
      <div class="muted small" style="margin-bottom: 6px">Dockerfile (直接編集できます) · {{ manuallyEdited ? '手編集を保持中' : 'フォームと同期中' }}</div>
      <CodeEditor v-model="dockerfile" language="dockerfile" :readonly="buildBusy" @save="saveFiles" />
    </div>
    <div class="b-files">
      <div class="muted small mono">保存先: {{ buildDirectory || `data/gui-builds/${slug}/` }}</div>
      <div class="muted small">Dockerfile と startapp.sh を保存します。手編集はフォーム変更・画面移動後も保持されます。</div>
      <div class="row">
        <button class="btn" :disabled="buildBusy" @click="saveFiles"><Save />保存 (Ctrl+S)</button>
        <button class="btn" :disabled="buildBusy" @click="openBuildFiles"><FolderOpen />保存してフォルダーを開く</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 自作 GUI アプリ: apt パッケージと起動コマンドから Dockerfile を作り、共通 Ubuntu ベースの上にビルドして起動する
import { ref, computed, onMounted } from 'vue';
import { LoaderCircle, Hammer, RefreshCw, Save, FolderOpen } from '@lucide/vue';
import CodeEditor from './CodeEditor.vue';
import { GUI_PRESETS } from '../lib/gui/presets.js';
import { createGuiBuilder, customStartScript } from '../lib/gui/builder.js';
import { buildPreset } from '../lib/gui/build.js';
import { emptyRunForm, buildRunArgs } from '../lib/runArgs.js';
import { runJob, openViewer, toast, confirm } from '../lib/store.js';
import { wslc, invoke } from '../lib/api.js';

const { custom, dockerfile, manuallyEdited, regenerate: regenerateDraft } = createGuiBuilder(localStorage);
const slug = computed(() => custom.appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app');
const customImage = computed(() => `wcs-gui/${slug.value}:latest`);
const buildBusy = ref(false);
const guiBuilds = ref('');
const buildDirectory = computed(() => guiBuilds.value ? `${guiBuilds.value}/${slug.value}` : '');
onMounted(async () => {
  try { guiBuilds.value = (await invoke('app:paths')).guiBuilds; } catch (e) { toast(e.message, 'error'); }
});

async function regenerate() {
  if (manuallyEdited.value && !await confirm({ title: 'Dockerfile を再生成', message: '手編集した内容を現在のフォームから生成し直します。', okText: '再生成' })) return;
  regenerateDraft();
}

async function writeBuildFiles() {
  const dir = await invoke('fs:join', (await invoke('app:paths')).guiBuilds, slug.value);
  await invoke('fs:write', await invoke('fs:join', dir, 'Dockerfile'), dockerfile.value);
  await invoke('fs:write', await invoke('fs:join', dir, 'startapp.sh'), customStartScript(custom.command));
  return dir;
}

async function saveFiles() {
  if (buildBusy.value) return;
  try { await writeBuildFiles(); toast('Dockerfile と startapp.sh を保存しました', 'success'); } catch (e) { toast(e.message, 'error'); }
}

async function openBuildFiles() {
  try { await invoke('app:openPath', await writeBuildFiles()); } catch (e) { toast(e.message, 'error'); }
}

async function buildAndRun() {
  if (buildBusy.value) return;
  buildBusy.value = true;
  const image = customImage.value;
  const name = `wcs-gui-${slug.value}`;
  const { appName, port } = custom;
  try {
    const dir = await writeBuildFiles();
    const base = GUI_PRESETS.find(p => p.id === 'ubuntu-base');
    if (!base) throw new Error('Ubuntu 共通ベースが見つかりません。プリセットを再読み込みしてください。');
    if (!await buildPreset(base)) return;
    if (!await runJob(`ビルド: ${image}`, ['build', '-t', image, dir])) return;
    await wslc(['remove', '-f', name]).catch(() => {});
    const f = emptyRunForm();
    Object.assign(f, {
      image,
      name,
      tty: false,
      interactive: false,
      ports: [{ ip: '127.0.0.1', host: port, container: '5800', proto: 'tcp' }],
      volumes: [{ source: `${name}-config`, target: '/config', readonly: false }],
      shm: '1g',
      guiPort: port,
      guiPath: '/vnc.html?autoconnect=1&resize=remote',
    });
    const ok = await runJob(`GUI 起動: ${appName}`, buildRunArgs(f));
    if (ok) openViewer(port, 'http', appName, f.guiPath);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    buildBusy.value = false;
  }
}
</script>

<style scoped>
.builder {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 16px;
}
.b-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.b-editor {
  height: 320px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.b-editor :deep(.code-editor) { flex: 1; height: auto; min-height: 0; }
.b-files { grid-column: 1 / -1; display: grid; gap: 8px; overflow-wrap: anywhere; }
@media (max-width: 900px) { .builder { grid-template-columns: 1fr; } }
</style>

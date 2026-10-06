<template>
  <div class="card builder">
    <ol class="b-steps small">
      <li>アプリ名・apt パッケージ・起動コマンドを入力します。Dockerfile は右側で直接編集できます（下書きは自動で保持）。</li>
      <li>「プリセットとして保存」で <span class="mono selectable">{{ presetDirectory }}</span> に Dockerfile・preset.yaml（Dockerfile が使う場合は startapp.sh も）を保存します。上の「プリセット」一覧に「自作」のカードとして表示されます。</li>
      <li>カードの「起動」(またはここの「保存して起動」) でビルドして起動します。以降の変更はカードの「Dockerfile…」で編集して保存し、「起動」を押すと反映されます。</li>
    </ol>
    <div class="b-form">
      <label class="field">アプリ名<input v-model="custom.appName" class="input" placeholder="GIMP" /></label>
      <template v-if="!manuallyEdited">
        <label class="field">apt パッケージ (スペース区切り)<input v-model="custom.packages" class="input mono" placeholder="gimp" /></label>
        <label class="field">起動コマンド<input v-model="custom.command" class="input mono" placeholder="gimp" /></label>
      </template>
      <template v-else>
        <!-- 手編集した Dockerfile ではフォームの apt パッケージ・起動コマンドは使われないため、実際の値 (CMD) を表示する -->
        <label class="field">起動コマンド (Dockerfile の CMD)<input :value="dockerfileCmd || '(CMD がありません。共通ベースは CMD のコマンドを起動します)'" class="input mono" disabled /></label>
        <div class="notice small"><Info /><div>Dockerfile を手編集しているため、apt パッケージと起動コマンドの入力欄は使いません。起動するアプリは Dockerfile の <span class="mono">CMD</span> で決まります。フォームの値に戻す場合は「Dockerfile を再生成」を使います。</div></div>
      </template>
      <div class="grid-2">
        <label class="field">ホスト側ポート<input v-model="custom.port" class="input mono" /></label>
        <label class="field">プリセット id / イメージ<input :value="`${slug} / wcs-gui/${slug}:latest`" class="input mono" disabled /></label>
      </div>
      <div class="muted small">日本語ロケール・日本語フォント・Mozc は共通 Ubuntu ベースに含まれます。</div>
      <div v-if="saved" class="notice small"><Info /><div>このアプリは保存済みです（上の一覧の「{{ saved.title }}」）。</div></div>
      <div class="row">
        <button class="btn" :disabled="busy" @click="regenerate"><RefreshCw />Dockerfile を再生成</button>
        <button v-if="saved" class="btn" :disabled="busy" @click="loadSaved"><FileDown />保存済みを読み込む</button>
      </div>
    </div>
    <div class="b-editor">
      <div class="muted small" style="margin-bottom: 6px">Dockerfile (下書き・直接編集できます) · {{ manuallyEdited ? '手編集を保持中' : 'フォームと同期中' }}</div>
      <CodeEditor v-model="dockerfile" language="dockerfile" :readonly="busy" @save="save" />
    </div>
    <div class="b-files">
      <div class="row">
        <button class="btn" :disabled="busy || !valid" @click="save"><Save />プリセットとして保存 (Ctrl+S)</button>
        <button class="btn" :disabled="busy || !valid" @click="saveAndOpenFolder"><FolderOpen />保存してフォルダーを開く</button>
        <div class="spacer"></div>
        <button class="btn primary" :disabled="busy || !valid" @click="saveAndRun">
          <LoaderCircle v-if="busy" class="spin" /><Hammer v-else />保存して起動
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 自作 GUI アプリ: apt パッケージと起動コマンドから Dockerfile を作り、data/gui-presets/<id>/ にプリセットとして保存する。
// 保存後は同梱プリセットと同じくカードから編集・起動する (共通 Ubuntu ベースの上にビルド)。
import { ref, computed, onMounted } from 'vue';
import { LoaderCircle, Hammer, RefreshCw, Save, FolderOpen, FileDown, Info } from '@lucide/vue';
import CodeEditor from './CodeEditor.vue';
import { GUI_PRESETS } from '../lib/gui/presets.js';
import { createGuiBuilder, customStartScript, builderSlug, builderPreset, builderPresetYaml, dockerfileCommand, usesStartScript } from '../lib/gui/builder.js';
import { launchPreset } from '../lib/gui/launch.js';
import { toast, confirm, loadGuiPresets } from '../lib/store.js';
import { invoke } from '../lib/api.js';

const { custom, dockerfile, manuallyEdited, regenerate: regenerateDraft } = createGuiBuilder(localStorage);
const slug = computed(() => builderSlug(custom.appName));
const busy = ref(false);
const presetsRoot = ref('');
const presetDirectory = computed(() => (presetsRoot.value ? `${presetsRoot.value}\\${slug.value}\\` : `data/gui-presets/${slug.value}/`));
const port = computed(() => Number(custom.port));
const dockerfileCmd = computed(() => dockerfileCommand(dockerfile.value));
const valid = computed(() => !!custom.appName.trim() && (manuallyEdited.value || !!custom.command.trim()) && Number.isInteger(port.value) && port.value >= 1 && port.value <= 65535);
const saved = computed(() => GUI_PRESETS.find((p) => p.id === slug.value && p.sourceKind === 'custom' && !p.overridesBuiltin));

onMounted(async () => {
  try { presetsRoot.value = (await invoke('app:paths')).guiPresets; } catch (e) { toast(e.message, 'error'); }
});

async function regenerate() {
  if (manuallyEdited.value && !await confirm({ title: 'Dockerfile を再生成', message: '手編集した内容を現在のフォームから生成し直します。', okText: '再生成' })) return;
  regenerateDraft();
}

async function presetDir() {
  return invoke('fs:join', (await invoke('app:paths')).guiPresets, slug.value);
}

/** 保存済みの Dockerfile (カードの「Dockerfile…」で編集した内容) を下書きに読み込む */
async function loadSaved() {
  try {
    const file = await invoke('fs:join', await presetDir(), 'Dockerfile');
    const content = await invoke('fs:read', file);
    if (content === dockerfile.value) return toast('下書きは保存済みの Dockerfile と同じです', 'info');
    if (!await confirm({ title: '保存済みを読み込む', message: `${file}\nの内容で下書きを置き換えます。`, okText: '読み込む' })) return;
    dockerfile.value = content;
  } catch (e) { toast(e.message, 'error'); }
}

/** data/gui-presets/<id>/ に書き出し、プリセット一覧を再読み込みする。保存したプリセットを返す (中止時は null) */
async function writePreset() {
  if (!valid.value) throw new Error(`アプリ名${manuallyEdited.value ? '' : '・起動コマンド'}・ホスト側ポート (1〜65535) を入力してください`);
  const id = slug.value;
  const dir = await presetDir();
  const conflict = GUI_PRESETS.find((p) => p.id === id);
  if (conflict && (conflict.sourceKind === 'builtin' || conflict.overridesBuiltin)) {
    throw new Error(`「${id}」は同梱プリセットと同じ id です。アプリ名を変更してください`);
  }
  if (conflict && (await invoke('fs:dirname', conflict.sourceFile)) !== dir) {
    throw new Error(`id「${id}」のプリセットが別の場所にあります: ${conflict.sourceFile}`);
  }
  const read = async (name) => {
    const file = await invoke('fs:join', dir, name);
    return (await invoke('fs:exists', file)) ? invoke('fs:read', file) : null;
  };
  const files = [['Dockerfile', dockerfile.value]];
  // startapp.sh は Dockerfile が使う場合だけ書き出す (手編集で CMD を直接書いた場合は不要)
  if (usesStartScript(dockerfile.value)) files.push(['startapp.sh', customStartScript(custom.command)]);
  // preset.yaml は既存ファイルに書いた env などを残し、フォームで決まる項目だけ書き換える
  files.push(['preset.yaml', builderPresetYaml(builderPreset(custom, manuallyEdited.value), (await read('preset.yaml')) || '')]);
  // カードの「Dockerfile…」などで変更されたファイルは、確認してから上書きする
  const changed = [];
  for (const [name, content] of files) {
    if (name === 'preset.yaml') continue; // 追加項目は保持するので確認しない
    const current = await read(name);
    if (current != null && current !== content) changed.push(name);
  }
  if (changed.length && !await confirm({
    title: '保存済みのファイルを上書き',
    message: `${dir} の ${changed.join('、')} は下書きと内容が異なります（カードの編集画面などで変更されています）。\n下書きの内容で上書きしますか？\n保存済みの Dockerfile を使う場合は「保存済みを読み込む」を使ってください。`,
    okText: '上書き',
    danger: true,
  })) return null;
  for (const [name, content] of files) await invoke('fs:write', await invoke('fs:join', dir, name), content);
  await loadGuiPresets();
  const preset = GUI_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error('保存したプリセットを読み込めませんでした。プリセット一覧のエラーを確認してください');
  return preset;
}

async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    const p = await writePreset();
    if (p) toast(`「${p.title}」をプリセットとして保存しました。上のプリセット一覧から起動できます`, 'success', 6000);
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}

async function saveAndOpenFolder() {
  if (busy.value) return;
  busy.value = true;
  try {
    if (await writePreset()) await invoke('app:openPath', await presetDir());
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}

async function saveAndRun() {
  if (busy.value) return;
  busy.value = true;
  try {
    const p = await writePreset();
    if (p) await launchPreset(p);
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}
</script>

<style scoped>
.builder {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 16px;
}
.b-steps {
  grid-column: 1 / -1;
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.b-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.b-editor {
  height: 340px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.b-editor :deep(.code-editor) { flex: 1; height: auto; min-height: 0; }
.b-files { grid-column: 1 / -1; display: grid; gap: 8px; }
@media (max-width: 900px) { .builder { grid-template-columns: 1fr; } }
</style>

<template>
  <Modal title="Dockerfile を作成・編集" width="900px" @close="close">
    <div class="dockerfile-tools row">
      <select v-if="!props.composeFile" v-model="composeFile" class="input compose-project" :disabled="busy" aria-label="Compose プロジェクト">
        <option value="">Compose プロジェクトを選択</option>
        <option v-for="p in projects" :key="p.file" :value="p.file">{{ p.name }}</option>
        <option v-if="composeFile && !projects.some(p => p.file === composeFile)" :value="composeFile">{{ composeFile }}</option>
      </select>
      <button v-if="!props.composeFile" class="btn" :disabled="busy" @click="pickCompose"><FolderOpen />compose.yaml を選ぶ</button>
      <span v-else class="muted small selectable mono">{{ composeFile }}</span>
    </div>
    <div class="dockerfile-tools row">
      <select v-model="template" class="input" :disabled="busy" aria-label="新規 Dockerfile のテンプレート">
        <option value="ubuntu">Ubuntu (CLI)</option>
        <option value="alpine">Alpine (CLI)</option>
        <option value="blank">空の Dockerfile</option>
      </select>
      <button class="btn" :disabled="busy" @click="createNew"><FilePlus2 />新規</button>
      <button class="btn" :disabled="busy" @click="openFile"><FolderOpen />既存を開く</button>
    </div>
    <div class="muted small selectable mono dockerfile-path">{{ file || '未保存 · 保存時にフォルダーを選べます' }}{{ dirty ? ' · 未保存の変更あり' : '' }}</div>
    <div class="dockerfile-editor">
      <CodeEditor v-model="text" language="dockerfile" :readonly="busy" @save="saveFile()" />
    </div>
    <p class="muted small">既定では compose.yaml と同じフォルダーに保存します。サービスに build.context がある場合は、そのフォルダーを使います。COPY / ADD の参照元は build.context です。</p>
    <div v-if="reference" class="dockerfile-reference">
      <div class="row"><span class="muted small">Compose のサービスに設定する参照</span><div class="spacer"></div><button class="btn sm" @click="copyText(reference)"><Copy />コピー</button></div>
      <pre class="code">{{ reference }}</pre>
    </div>
    <template #footer>
      <button class="btn" :disabled="busy || !file" @click="showFolder"><FolderOpen />保存先を開く</button>
      <div class="spacer"></div>
      <button class="btn" :disabled="busy || !composeFile" @click="saveFile(true)">名前を付けて保存</button>
      <button class="btn primary" :disabled="busy || !composeFile" @click="saveFile()"><Save />保存 (Ctrl+S)</button>
      <button class="btn" :disabled="busy" @click="close">閉じる</button>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { FilePlus2, FolderOpen, Save, Copy } from '@lucide/vue';
import YAML from 'yaml';
import Modal from './Modal.vue';
import CodeEditor from './CodeEditor.vue';
import { invoke } from '../lib/api.js';
import { state, confirm, toast, copyText } from '../lib/store.js';

const props = defineProps({ composeFile: { type: String, default: '' }, build: [String, Object] });
const emit = defineEmits(['close']);
const templates = {
  ubuntu: 'FROM ubuntu:24.04\n\n# 必要なパッケージを追加してください\n# RUN apt-get update && apt-get install -y --no-install-recommends curl \\\n#     && rm -rf /var/lib/apt/lists/*\n\nWORKDIR /app\nCMD ["bash"]\n',
  alpine: 'FROM alpine:latest\n\n# 必要なパッケージを追加してください\n# RUN apk add --no-cache curl\n\nWORKDIR /app\nCMD ["sh"]\n',
  blank: '',
};
let draft;
const storageKey = props.composeFile ? `wcs.dockerfile-editor:${props.composeFile}:${JSON.stringify(props.build || '.')}` : 'wcs.dockerfile-editor';
try { draft = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { /* 新規 */ }
const projects = computed(() => state.settings.composeProjects || []);
const composeFile = ref(props.composeFile || (typeof draft?.composeFile === 'string' ? draft.composeFile : '') || projects.value[0]?.file || '');
const text = ref(typeof draft?.text === 'string' ? draft.text : templates.ubuntu);
const file = ref(draft?.composeFile === composeFile.value && typeof draft?.file === 'string' ? draft.file : '');
const savedText = ref(typeof draft?.savedText === 'string' ? draft.savedText : null);
const template = ref('ubuntu');
const busy = ref(false);
const dirty = computed(() => text.value !== savedText.value);
const reference = ref('');
const context = computed(() => typeof props.build === 'string' ? props.build : props.build?.context || '.');
const dockerfileName = computed(() => typeof props.build === 'object' ? props.build?.dockerfile || 'Dockerfile' : 'Dockerfile');
watch(composeFile, () => { file.value = ''; savedText.value = null; });
watch([text, file, savedText, composeFile], () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ text: text.value, file: file.value, savedText: savedText.value, composeFile: composeFile.value }));
  } catch { /* 下書き保存に失敗してもファイル保存は続ける */ }
}, { flush: 'sync' });

async function contextDirectory() {
  return invoke('fs:resolve', await invoke('fs:dirname', composeFile.value), context.value);
}
let referenceVersion = 0;
watch([composeFile, file], async () => {
  const version = ++referenceVersion;
  reference.value = '';
  if (!composeFile.value) return;
  try {
    const contextDir = await contextDirectory();
    const target = file.value || await invoke('fs:resolve', contextDir, dockerfileName.value);
    const relative = (await invoke('fs:relative', contextDir, target)).replace(/\\/g, '/');
    if (version === referenceVersion) reference.value = YAML.stringify({ build: { context: context.value, dockerfile: relative } });
  } catch (e) { if (version === referenceVersion) toast(e.message, 'error'); }
}, { immediate: true });
onMounted(async () => {
  if (!props.composeFile || draft) return;
  busy.value = true;
  try {
    const target = await invoke('fs:resolve', await contextDirectory(), dockerfileName.value);
    if (await invoke('fs:exists', target)) {
      const content = await invoke('fs:read', target);
      text.value = content;
      file.value = target;
      savedText.value = content;
    }
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
});

async function pickCompose() {
  busy.value = true;
  try {
    const chosen = await invoke('fs:open', { title: '参照元の Compose ファイルを選択', properties: ['openFile'], filters: [{ name: 'Compose', extensions: ['yaml', 'yml'] }] });
    if (chosen?.[0]) composeFile.value = chosen[0];
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}

function close() { if (!busy.value) emit('close'); }
async function canReplace() {
  if (!file.value && Object.values(templates).includes(text.value)) return true;
  return !dirty.value || await confirm({ title: 'Dockerfile の内容を切り替え', message: '現在の下書きを置き換えます。必要な変更は先に保存してください。', okText: '切り替え' });
}
async function createNew() {
  if (busy.value || !await canReplace()) return;
  text.value = templates[template.value];
  file.value = '';
  savedText.value = null;
}
async function openFile() {
  if (busy.value || !await canReplace()) return;
  busy.value = true;
  try {
    const chosen = await invoke('fs:open', { title: 'Dockerfile を開く', properties: ['openFile'], ...(composeFile.value ? { defaultPath: await contextDirectory() } : {}) });
    if (!chosen?.[0]) return;
    const content = await invoke('fs:read', chosen[0]);
    text.value = content;
    file.value = chosen[0];
    savedText.value = content;
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}
async function saveFile(saveAs = false) {
  if (busy.value) return;
  if (!composeFile.value) return toast('先に Compose プロジェクトを選択してください', 'warn');
  busy.value = true;
  const content = text.value;
  try {
    let dest = file.value;
    if (!dest || saveAs) {
      dest = await invoke('fs:save', {
        title: 'Dockerfile を保存',
        defaultPath: dest || await invoke('fs:resolve', await contextDirectory(), dockerfileName.value),
      });
      if (!dest) return;
    }
    await invoke('fs:write', dest, content);
    file.value = dest;
    savedText.value = content;
    toast('Dockerfile を保存しました', 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}
async function showFolder() {
  try { await invoke('app:showItem', file.value); } catch (e) { toast(e.message, 'error'); }
}
</script>

<style scoped>
.dockerfile-tools { flex-wrap: wrap; margin-bottom: 10px; }
.dockerfile-tools select { width: 220px; }
.dockerfile-tools .compose-project { flex: 1; min-width: 220px; }
.dockerfile-reference pre { margin: 6px 0 0; }
.dockerfile-path { margin-bottom: 10px; overflow-wrap: anywhere; }
.dockerfile-editor { height: min(48vh, 440px); min-height: 180px; }
</style>

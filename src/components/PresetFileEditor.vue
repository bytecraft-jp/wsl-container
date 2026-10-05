<template>
  <Modal :title="`${data?.title || presetId} のファイルを編集`" width="960px" @close="close">
    <div v-if="!data" class="muted">読み込み中…</div>
    <template v-else>
      <div class="tabs preset-tabs">
        <button v-for="f in files" :key="f.name" class="tab mono" :class="{ active: current === f.name }" @click="current = f.name">
          {{ f.name }}{{ f.content !== f.saved ? ' ●' : '' }}
        </button>
      </div>
      <div class="muted small selectable mono preset-path">{{ savePath }}</div>
      <div v-if="data.kind === 'builtin'" class="notice preset-notice">
        <Info /><div class="small">同梱プリセットです。保存するとフォルダーごと <span class="mono selectable">{{ data.saveDirectory }}</span> にコピーし、そちらを編集します（同じ id のため同梱定義より優先されます）。</div>
      </div>
      <div class="preset-editor">
        <CodeEditor v-if="file" :key="file.name" v-model="file.content" :language="/\.ya?ml$/i.test(file.name) ? 'yaml' : 'text'" :readonly="busy" @save="save" />
      </div>
      <p class="muted small">保存後、プリセット一覧を再読み込みします。Dockerfile の変更は次回の「起動」でのビルドから反映されます（既存のコンテナーは再利用されるため、反映するには削除してから起動してください）。</p>
    </template>
    <template #footer>
      <button class="btn" :disabled="!data || data.kind === 'builtin'" @click="showFolder"><FolderOpen />フォルダーを開く</button>
      <div class="spacer"></div>
      <button class="btn primary" :disabled="busy || !file || file.content === file.saved" @click="save"><Save />保存 (Ctrl+S)</button>
      <button class="btn" :disabled="busy" @click="close">閉じる</button>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { FolderOpen, Save, Info } from '@lucide/vue';
import Modal from './Modal.vue';
import CodeEditor from './CodeEditor.vue';
import { invoke } from '../lib/api.js';
import { confirm, toast, loadGuiPresets } from '../lib/store.js';

const props = defineProps({ presetId: { type: String, required: true }, initial: { type: String, default: 'definition' } });
const emit = defineEmits(['close']);
const data = ref(null);
const files = ref([]);
const current = ref('');
const busy = ref(false);
const file = computed(() => files.value.find((f) => f.name === current.value));
const savePath = computed(() => {
  if (!data.value || !file.value) return '';
  const sep = data.value.saveDirectory.includes('\\') ? '\\' : '/';
  return [data.value.saveDirectory, ...file.value.name.split('/')].join(sep);
});

async function load(keep) {
  const result = await invoke('gui-presets:files', props.presetId);
  data.value = result;
  files.value = result.files.map((f) => ({ ...f, saved: f.content }));
  const wanted = keep || (props.initial === 'dockerfile' ? result.dockerfile : result.definition);
  current.value = files.value.some((f) => f.name === wanted) ? wanted : files.value[0]?.name || '';
}
onMounted(async () => {
  try { await load(); } catch (e) { toast(e.message, 'error'); emit('close'); }
});

async function save() {
  const f = file.value;
  if (busy.value || !f || f.content === f.saved) return;
  busy.value = true;
  const content = f.content;
  try {
    const copied = data.value.kind === 'builtin';
    await invoke('gui-presets:save-file', props.presetId, f.name, content);
    f.saved = content;
    await loadGuiPresets();
    if (copied) {
      // 以降はコピー先 (自作プリセット) を編集する。他のタブの未保存の変更は引き継ぐ
      const unsaved = files.value.filter((x) => x.content !== x.saved);
      await load(f.name);
      for (const u of unsaved) {
        const target = files.value.find((x) => x.name === u.name);
        if (target) target.content = u.content;
      }
    }
    toast(`${f.name} を保存しました`, 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { busy.value = false; }
}

async function showFolder() {
  try { await invoke('app:openPath', data.value.saveDirectory); } catch (e) { toast(e.message, 'error'); }
}

async function close() {
  if (busy.value) return;
  const dirty = files.value.filter((f) => f.content !== f.saved).map((f) => f.name);
  if (dirty.length && !await confirm({ title: '未保存の変更', message: `${dirty.join('、')} の変更を破棄して閉じますか？`, okText: '破棄して閉じる', danger: true })) return;
  emit('close');
}
</script>

<style scoped>
.preset-tabs { margin-bottom: 8px; overflow-x: auto; overflow-y: hidden; }
.preset-tabs .tab { white-space: nowrap; font-size: 12px; }
.preset-path { margin-bottom: 8px; overflow-wrap: anywhere; }
.preset-notice { margin-bottom: 8px; }
.preset-editor { height: min(56vh, 520px); min-height: 200px; }
</style>

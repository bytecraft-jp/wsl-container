<template>
  <div class="page" tabindex="0" @keydown="onKey">
    <div class="page-header">
      <div>
        <h1>イメージ</h1>
        <div class="sub">右クリックで実行・タグ付け・プッシュ・保存などの操作ができます</div>
      </div>
      <div class="spacer"></div>
      <button class="btn" @click="dockerfileEditor = true"><FileCode2 />Dockerfile を作成・編集</button>
      <button class="btn" @click="build"><Hammer />Dockerfile からビルド</button>
      <button class="btn primary" @click="pull"><Download />イメージを取得</button>
    </div>
    <div class="page-body" @contextmenu="onEmptyMenu">
      <div class="toolbar" style="margin-bottom: 12px">
        <div class="search">
          <Search />
          <input v-model="q" class="input" placeholder="リポジトリ・タグで検索" />
        </div>
        <span class="muted small">{{ images.length }} 個 · 合計 {{ total }}</span>
        <div class="spacer"></div>
        <button class="btn sm" @click="load"><Upload />tar から読み込み</button>
        <button class="btn sm" @click="prune(false)"><Eraser />未使用 (dangling) を削除</button>
        <button class="btn icon" title="更新" @click="refresh"><RefreshCw :class="{ spin: loading }" /></button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 34%" /><col style="width: 14%" /><col style="width: 13%" /><col style="width: 12%" /><col style="width: 13%" /><col />
          </colgroup>
          <thead>
            <tr><th>リポジトリ</th><th>タグ</th><th>ID</th><th>サイズ</th><th>作成</th><th></th></tr>
          </thead>
          <tbody>
            <tr
              v-for="i in list"
              :key="i.ID + i.Repository + i.Tag"
              :class="{ selected: selected === key(i) }"
              @click="selected = key(i)"
              @dblclick="runImage(i)"
              @contextmenu="onMenu($event, i)"
            >
              <td>
                <div class="row">
                  <Layers class="ic" />
                  <b class="ellipsis">{{ i.Repository }}</b>
                  <span v-if="Number(i.Containers) > 0" class="badge green" title="使用中のコンテナー数">使用中 {{ i.Containers }}</span>
                </div>
              </td>
              <td><span class="badge blue">{{ i.Tag }}</span></td>
              <td class="mono small">{{ shortId(i.ID) }}</td>
              <td class="mono small">{{ i.Size }}</td>
              <td class="small">{{ i.CreatedSince }}</td>
              <td>
                <div class="actions">
                  <button class="btn ghost icon sm" title="実行" @click.stop="runImage(i)"><Play /></button>
                  <button class="btn ghost icon sm" title="その他" @click.stop="onMenu($event, i)"><EllipsisVertical /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!list.length && !loading" class="empty">
          <Layers />
          <div>イメージがありません。Docker Hub から検索して取得しましょう。</div>
          <button class="btn primary" style="margin-top: 12px" @click="$router.push('/hub')"><Search />Docker Hub を検索</button>
        </div>
      </div>
    </div>

    <DockerfileEditor v-if="dockerfileEditor" @close="dockerfileEditor = false" />
    <Modal v-if="historyFor" :title="`Inspect: ${historyFor.name}`" width="760px" @close="historyFor = null">
      <pre class="code" style="max-height: 60vh">{{ historyFor.json }}</pre>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Layers, Search, Download, Upload, Eraser, RefreshCw, Play, EllipsisVertical, Tag, CloudUpload, Save, Trash2, Info,
  Copy, ExternalLink, Hammer, FileCode2, MonitorPlay, Terminal,
} from '@lucide/vue';
import Modal from '../components/Modal.vue';
import DockerfileEditor from '../components/DockerfileEditor.vue';
import { wslcJson, wslc, invoke, inspect } from '../lib/api.js';
import { state, act, confirm, prompt, runJob, openRun, copyText, toast, openTerminal } from '../lib/store.js';
import { parseSize, bytes, shortId } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';

const router = useRouter();
const images = ref([]);
const loading = ref(false);
const q = ref('');
const selected = ref('');
const historyFor = ref(null);
const dockerfileEditor = ref(false);

const key = (i) => `${i.ID}|${i.Repository}|${i.Tag}`;
const ref_ = (i) => (i.Repository === '<none>' ? shortId(i.ID) : `${i.Repository}:${i.Tag}`);
const total = computed(() => bytes(images.value.reduce((a, i) => a + parseSize(i.Size), 0)));
const list = computed(() => {
  const s = q.value.trim().toLowerCase();
  return images.value.filter((i) => !s || `${i.Repository}:${i.Tag} ${i.ID}`.toLowerCase().includes(s));
});

async function refresh() {
  loading.value = true;
  try {
    images.value = await wslcJson(['images', '--format', 'json']);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function pull() {
  const name = await prompt({ title: 'イメージを取得', label: 'イメージ名 (例 nginx:alpine, ghcr.io/owner/app:1.0)', okText: '取得' });
  if (name) runJob(`pull ${name}`, ['pull', name.trim()]);
}

async function build() {
  const dir = await invoke('fs:open', { properties: ['openDirectory'], title: 'ビルドコンテキスト (Dockerfile のあるフォルダー)' });
  if (!dir?.[0]) return;
  const tag = await prompt({ title: 'イメージをビルド', message: dir[0], label: 'タグ', value: 'myapp:latest', okText: 'ビルド' });
  if (tag) runJob(`build ${tag}`, ['build', '-t', tag, dir[0]]);
}

async function load() {
  const f = await invoke('fs:open', { filters: [{ name: 'tar', extensions: ['tar', 'gz', 'tgz'] }] });
  if (f?.[0]) runJob(`load ${f[0]}`, ['load', '-i', f[0]]);
}

async function prune(all) {
  const ok = await confirm({
    title: 'イメージの整理',
    message: all ? 'どのコンテナーにも使われていないイメージをすべて削除します。' : 'タグのない (dangling) イメージを削除します。',
    okText: '削除',
    danger: true,
  });
  if (ok) act(() => wslc(['image', 'prune', '-f', ...(all ? ['-a'] : [])]), { success: (r) => r.trim() || '整理しました' });
}

function runImage(i, extra = {}) {
  openRun({ image: ref_(i), ...extra });
}

async function tag(i) {
  const t = await prompt({ title: 'タグを付ける', message: `元: ${ref_(i)}`, label: '新しい名前:タグ', value: ref_(i), okText: 'タグ付け' });
  if (t) act(() => wslc(['tag', ref_(i), t.trim()]), { success: `${t} を作成しました` });
}

async function push(i) {
  const ok = await confirm({ title: 'イメージをプッシュ', message: `${ref_(i)} をレジストリにアップロードします。\n事前に設定画面でレジストリにログインしてください。`, okText: 'プッシュ' });
  if (ok) runJob(`push ${ref_(i)}`, ['push', ref_(i)]);
}

async function save(i) {
  const p = await invoke('fs:save', { defaultPath: `${ref_(i).replace(/[/:]/g, '_')}.tar`, filters: [{ name: 'tar', extensions: ['tar'] }] });
  if (p) runJob(`save ${ref_(i)}`, ['save', '-o', p, ref_(i)]);
}

async function remove(i, force) {
  const ok = await confirm({ title: 'イメージを削除', message: `${ref_(i)} を削除します。`, okText: '削除', danger: true });
  if (ok) act(() => wslc(['rmi', ...(force ? ['-f'] : []), ref_(i)]), { success: '削除しました' });
}

async function showInspect(i) {
  try {
    const j = await inspect(ref_(i), 'image');
    historyFor.value = { name: ref_(i), json: JSON.stringify(j, null, 2) };
  } catch (e) {
    toast(e.message, 'error');
  }
}

function hubName(i) {
  const r = i.Repository.replace(/^docker\.io\//, '');
  if (r.includes('.') && r.split('/')[0].includes('.')) return null;
  return r.includes('/') ? r : `_/${r}`;
}

function addToCompose(i) {
  state.composeInbox.push({ image: ref_(i) });
  router.push('/compose');
}

function onMenu(e, i) {
  selected.value = key(i);
  const hub = hubName(i);
  showMenu(e, [
    { label: '実行…', icon: Play, hint: 'ダブルクリック', action: () => runImage(i) },
    { label: 'GUI アプリとして実行…', icon: MonitorPlay, action: () => runImage(i, { tab: 'gui', form: { guiPort: '' } }) },
    {
      label: '一時コンテナーでシェルを開く',
      icon: Terminal,
      action: () => openTerminal(`${ref_(i)} (一時)`, { kind: 'run', args: ['run', '--rm', '-it', '--entrypoint', 'sh', ref_(i)] }),
    },
    { label: 'Compose に追加', icon: FileCode2, action: () => addToCompose(i) },
    { divider: true },
    { label: 'タグを付ける…', icon: Tag, action: () => tag(i) },
    { label: 'プッシュ', icon: CloudUpload, action: () => push(i) },
    { label: 'tar に保存…', icon: Save, action: () => save(i) },
    { label: 'Inspect', icon: Info, action: () => showInspect(i) },
    hub && { label: 'Docker Hub で開く', icon: ExternalLink, action: () => invoke('app:openExternal', `https://hub.docker.com/r/${hub}`) },
    {
      label: 'コピー',
      icon: Copy,
      children: [
        { label: '名前:タグ', icon: Copy, action: () => copyText(ref_(i)) },
        { label: 'イメージ ID', icon: Copy, action: () => copyText(i.ID) },
        { label: 'run コマンド', icon: Copy, action: () => copyText(`wslc run -it --rm ${ref_(i)}`) },
      ],
    },
    { divider: true },
    { label: '削除', icon: Trash2, danger: true, hint: 'Del', action: () => remove(i, false) },
    { label: '強制削除', icon: Trash2, danger: true, action: () => remove(i, true) },
  ], ref_(i));
}

function onEmptyMenu(e) {
  if (e.target.closest('tr, input, button')) return;
  showMenu(e, [
    { label: 'イメージを取得…', icon: Download, action: pull },
    { label: 'Dockerfile を作成・編集…', icon: FileCode2, action: () => { dockerfileEditor.value = true; } },
    { label: 'Dockerfile からビルド…', icon: Hammer, action: build },
    { label: 'tar から読み込み…', icon: Upload, action: load },
    { label: '更新', icon: RefreshCw, action: refresh },
    { divider: true },
    { label: 'dangling イメージを削除', icon: Eraser, danger: true, action: () => prune(false) },
    { label: '未使用イメージをすべて削除', icon: Eraser, danger: true, action: () => prune(true) },
  ]);
}

function onKey(e) {
  if (dockerfileEditor.value || e.target.closest('input, textarea, [contenteditable="true"]')) return;
  const i = images.value.find((x) => key(x) === selected.value);
  if (e.key === 'Delete' && i) remove(i, false);
  if (e.key === 'Enter' && i) runImage(i);
  if (e.key === 'F5') refresh();
}

watch(() => state.refreshTick, refresh);
onMounted(refresh);
</script>

<style scoped>
.page {
  outline: none;
}
.page-header { flex-wrap: wrap; }
.search {
  position: relative;
  width: 300px;
}
.search svg {
  position: absolute;
  left: 9px;
  top: 8px;
  width: 14px;
  color: var(--text-3);
}
.search .input {
  width: 100%;
  padding-left: 30px;
}
.ic {
  width: 15px;
  color: var(--purple);
  flex-shrink: 0;
}
</style>

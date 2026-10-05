<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>ボリューム</h1>
        <div class="sub">永続データ用の名前付きボリューム。右クリックで中身をシェルで確認できます</div>
      </div>
      <div class="spacer"></div>
      <button class="btn primary" @click="create"><Plus />ボリュームを作成</button>
    </div>
    <div class="page-body" @contextmenu="onEmptyMenu">
      <div class="toolbar" style="margin-bottom: 12px">
        <span class="muted small">{{ volumes.length }} 個</span>
        <div class="spacer"></div>
        <button class="btn sm" @click="prune"><Eraser />未使用を削除</button>
        <button class="btn icon" @click="refresh"><RefreshCw :class="{ spin: loading }" /></button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <colgroup><col style="width: 34%" /><col style="width: 12%" /><col /><col style="width: 90px" /></colgroup>
          <thead><tr><th>名前</th><th>ドライバー</th><th>マウントポイント</th><th></th></tr></thead>
          <tbody>
            <tr
              v-for="v in volumes"
              :key="v.Name"
              :class="{ selected: selected === v.Name }"
              @click="selected = v.Name"
              @dblclick="browse(v)"
              @contextmenu="onMenu($event, v)"
            >
              <td><div class="row"><HardDrive class="ic" /><b class="ellipsis">{{ v.Name }}</b></div></td>
              <td><span class="badge">{{ v.Driver }}</span></td>
              <td class="mono small ellipsis">{{ v.Mountpoint }}</td>
              <td>
                <div class="actions">
                  <button class="btn ghost icon sm" title="中身を開く" @click.stop="browse(v)"><FolderSearch /></button>
                  <button class="btn ghost icon sm" @click.stop="onMenu($event, v)"><EllipsisVertical /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!volumes.length && !loading" class="empty"><HardDrive /><div>ボリュームはありません</div></div>
      </div>
    </div>
    <Modal v-if="inspectJson" title="Inspect" width="720px" @close="inspectJson = ''">
      <pre class="code">{{ inspectJson }}</pre>
    </Modal>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { HardDrive, Plus, Eraser, RefreshCw, EllipsisVertical, FolderSearch, Play, Info, Trash2, Copy } from '@lucide/vue';
import Modal from '../components/Modal.vue';
import { wslcJson, wslc } from '../lib/api.js';
import { state, act, confirm, prompt, toast, openRun, openTerminal, copyText } from '../lib/store.js';
import { showMenu } from '../lib/contextMenu.js';

const volumes = ref([]);
const loading = ref(false);
const selected = ref('');
const inspectJson = ref('');

async function refresh() {
  loading.value = true;
  try {
    volumes.value = await wslcJson(['volume', 'list', '--format', 'json']);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function create() {
  const name = await prompt({ title: 'ボリュームを作成', label: '名前', placeholder: 'mydata', okText: '作成' });
  if (name === null) return;
  const driver = await prompt({
    title: 'ボリュームを作成',
    label: 'ドライバー',
    options: [
      { value: 'guest', label: 'guest (既定・VM 内に保存)' },
      { value: 'vhd', label: 'vhd (専用の仮想ディスク)' },
    ],
    okText: '作成',
  });
  if (!driver) return;
  act(() => wslc(['volume', 'create', '-d', driver, ...(name.trim() ? [name.trim()] : [])]), { success: (r) => `作成しました: ${r.trim()}` });
}

function browse(v) {
  openTerminal(`volume: ${v.Name}`, {
    kind: 'run',
    args: ['run', '--rm', '-it', '-v', `${v.Name}:/data`, '-w', '/data', 'alpine:latest', 'sh'],
  });
}

async function remove(v) {
  const ok = await confirm({ title: 'ボリュームを削除', message: `${v.Name} を削除します。中のデータは失われます。`, okText: '削除', danger: true });
  if (ok) act(() => wslc(['volume', 'remove', v.Name]), { success: '削除しました' });
}

async function prune() {
  const ok = await confirm({ title: '未使用ボリュームを削除', message: 'どのコンテナーにも使われていないボリューム (名前付きを含む) をすべて削除します。中のデータは失われます。', okText: '削除', danger: true });
  if (ok) act(() => wslc(['volume', 'prune', '-a', '-f']), { success: (r) => r.trim() || '削除しました' });
}

async function showInspect(v) {
  try {
    inspectJson.value = await wslc(['volume', 'inspect', v.Name]);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function onMenu(e, v) {
  selected.value = v.Name;
  showMenu(e, [
    { label: '中身をシェルで開く', icon: FolderSearch, hint: 'ダブルクリック', action: () => browse(v) },
    {
      label: 'マウントして新規コンテナーを実行…',
      icon: Play,
      action: () => openRun({ form: { volumes: [{ source: v.Name, target: '/data', readonly: false }] } }),
    },
    { label: 'Inspect', icon: Info, action: () => showInspect(v) },
    { label: '名前をコピー', icon: Copy, action: () => copyText(v.Name) },
    { divider: true },
    { label: '削除', icon: Trash2, danger: true, action: () => remove(v) },
  ], v.Name);
}

function onEmptyMenu(e) {
  if (e.target.closest('tr, button')) return;
  showMenu(e, [
    { label: 'ボリュームを作成…', icon: Plus, action: create },
    { label: '更新', icon: RefreshCw, action: refresh },
    { divider: true },
    { label: '未使用ボリュームを削除', icon: Eraser, danger: true, action: prune },
  ]);
}

watch(() => state.refreshTick, refresh);
onMounted(refresh);
</script>

<style scoped>
.ic {
  width: 15px;
  color: var(--green);
  flex-shrink: 0;
}
</style>

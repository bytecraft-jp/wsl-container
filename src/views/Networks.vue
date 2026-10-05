<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>ネットワーク</h1>
        <div class="sub">右クリックでコンテナーの接続・切断ができます</div>
      </div>
      <div class="spacer"></div>
      <button class="btn primary" @click="create"><Plus />ネットワークを作成</button>
    </div>
    <div class="page-body" @contextmenu="onEmptyMenu">
      <div class="toolbar" style="margin-bottom: 12px">
        <span class="muted small">{{ networks.length }} 個</span>
        <div class="spacer"></div>
        <button class="btn sm" @click="prune"><Eraser />未使用を削除</button>
        <button class="btn icon" @click="refresh"><RefreshCw :class="{ spin: loading }" /></button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <colgroup><col style="width: 30%" /><col style="width: 12%" /><col style="width: 14%" /><col style="width: 12%" /><col /><col style="width: 60px" /></colgroup>
          <thead><tr><th>名前</th><th>ドライバー</th><th>ID</th><th>内部</th><th>作成</th><th></th></tr></thead>
          <tbody>
            <tr
              v-for="n in networks"
              :key="n.ID"
              :class="{ selected: selected === n.ID }"
              @click="selected = n.ID"
              @dblclick="showInspect(n)"
              @contextmenu="onMenu($event, n)"
            >
              <td>
                <div class="row">
                  <Network class="ic" /><b>{{ n.Name }}</b>
                  <span v-if="builtin(n)" class="badge">組み込み</span>
                </div>
              </td>
              <td><span class="badge">{{ n.Driver }}</span></td>
              <td class="mono small">{{ n.ID }}</td>
              <td>{{ n.Internal === 'true' ? 'はい' : '-' }}</td>
              <td class="small">{{ timeAgo(n.CreatedAt.replace(/ \+0000 UTC$/, 'Z').replace(' ', 'T')) }}</td>
              <td><div class="actions"><button class="btn ghost icon sm" @click.stop="onMenu($event, n)"><EllipsisVertical /></button></div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <Modal v-if="inspectJson" title="Inspect" width="720px" @close="inspectJson = ''">
      <pre class="code">{{ inspectJson }}</pre>
    </Modal>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { Network, Plus, Eraser, RefreshCw, EllipsisVertical, Info, Trash2, Link, Unplug, Copy } from '@lucide/vue';
import Modal from '../components/Modal.vue';
import { wslcJson, wslc } from '../lib/api.js';
import { state, act, confirm, prompt, toast, copyText } from '../lib/store.js';
import { timeAgo } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';

const networks = ref([]);
const loading = ref(false);
const selected = ref('');
const inspectJson = ref('');
const builtin = (n) => ['bridge', 'host', 'none'].includes(n.Name);

async function refresh() {
  loading.value = true;
  try {
    networks.value = await wslcJson(['network', 'list', '--format', 'json']);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function create() {
  const name = await prompt({ title: 'ネットワークを作成', label: '名前', placeholder: 'mynet', okText: '次へ' });
  if (!name) return;
  const subnet = await prompt({ title: 'ネットワークを作成', label: 'サブネット (任意・CIDR)', placeholder: '例 172.30.0.0/16', okText: '作成' });
  if (subnet === null) return;
  const args = ['network', 'create'];
  if (subnet.trim()) args.push('--subnet', subnet.trim());
  args.push(name.trim());
  act(() => wslc(args), { success: `${name} を作成しました` });
}

async function remove(n) {
  const ok = await confirm({ title: 'ネットワークを削除', message: `${n.Name} を削除します。`, okText: '削除', danger: true });
  if (ok) act(() => wslc(['network', 'remove', n.Name]), { success: '削除しました' });
}

async function prune() {
  const ok = await confirm({ title: '未使用ネットワークを削除', message: 'どのコンテナーにも使われていないネットワークを削除します。', okText: '削除', danger: true });
  if (ok) act(() => wslc(['network', 'prune', '-f']), { success: (r) => r.trim() || '削除しました' });
}

async function showInspect(n) {
  try {
    inspectJson.value = await wslc(['network', 'inspect', n.Name]);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function onMenu(e, n) {
  selected.value = n.ID;
  const { clientX, clientY } = e;
  e.preventDefault();
  e.stopPropagation();
  let containers = [];
  try {
    containers = await wslcJson(['list', '-a', '--format', 'json']);
  } catch {
    /* ignore */
  }
  const inNet = (c) => String(c.Networks || '').split(',').map((s) => s.trim()).includes(n.Name);
  showMenu({ preventDefault() {}, stopPropagation() {}, clientX, clientY }, [
    { label: 'Inspect', icon: Info, hint: 'ダブルクリック', action: () => showInspect(n) },
    {
      label: 'コンテナーを接続',
      icon: Link,
      disabled: builtin(n) && n.Name !== 'bridge',
      children: containers.filter((c) => !inNet(c)).map((c) => ({
        label: c.Names,
        icon: Link,
        action: () => act(() => wslc(['network', 'connect', n.Name, c.ID]), { success: `${c.Names} を接続しました` }),
      })),
    },
    {
      label: 'コンテナーを切断',
      icon: Unplug,
      children: containers.filter(inNet).map((c) => ({
        label: c.Names,
        icon: Unplug,
        action: () => act(() => wslc(['network', 'disconnect', n.Name, c.ID]), { success: `${c.Names} を切断しました` }),
      })),
    },
    { label: '名前をコピー', icon: Copy, action: () => copyText(n.Name) },
    { divider: true },
    { label: '削除', icon: Trash2, danger: true, disabled: builtin(n), action: () => remove(n) },
  ], n.Name);
}

function onEmptyMenu(e) {
  if (e.target.closest('tr, button')) return;
  showMenu(e, [
    { label: 'ネットワークを作成…', icon: Plus, action: create },
    { label: '更新', icon: RefreshCw, action: refresh },
    { divider: true },
    { label: '未使用ネットワークを削除', icon: Eraser, danger: true, action: prune },
  ]);
}

watch(() => state.refreshTick, refresh);
onMounted(refresh);
</script>

<style scoped>
.ic {
  width: 15px;
  color: var(--yellow);
  flex-shrink: 0;
}
</style>

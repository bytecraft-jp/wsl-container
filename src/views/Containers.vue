<template>
  <div class="page" tabindex="0" @keydown="onKey">
    <div class="page-header">
      <div>
        <h1>コンテナー</h1>
        <div class="sub">左クリックで選択 (Ctrl / Shift で複数選択)、ダブルクリックで詳細、右クリックで操作メニュー</div>
      </div>
      <div class="spacer"></div>
      <button class="btn primary" @click="openRun()"><Play />コンテナーを実行</button>
    </div>

    <div class="page-body" @contextmenu="onEmptyMenu">
      <div class="toolbar list-toolbar">
        <div class="search">
          <Search />
          <input v-model="q" class="input" placeholder="名前・イメージ・ポートで検索" />
        </div>
        <div class="segmented">
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">すべて {{ containers.length }}</button>
          <button :class="{ active: filter === 'running' }" @click="filter = 'running'">稼働中 {{ runningCount }}</button>
          <button :class="{ active: filter === 'stopped' }" @click="filter = 'stopped'">停止 {{ containers.length - runningCount }}</button>
        </div>
        <div class="spacer"></div>
        <template v-if="selected.length">
          <span class="badge blue">{{ selected.length }} 件選択</span>
          <button class="btn sm" @click="bulk('start')"><Play />開始</button>
          <button class="btn sm" @click="bulk('stop')"><Square />停止</button>
          <button class="btn sm" @click="bulk('restart')"><RotateCw />再起動</button>
          <button class="btn sm danger" @click="bulkRemove"><Trash2 />削除</button>
        </template>
        <button class="btn icon" title="更新 (F5)" @click="refresh"><RefreshCw :class="{ spin: loading }" /></button>
      </div>

      <div v-if="error" class="notice error" style="margin-bottom: 12px"><CircleX /><div class="selectable">{{ error }}</div></div>

      <div class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 46px" />
            <col style="width: 22%" />
            <col style="width: 20%" />
            <col style="width: 15%" />
            <col />
            <col style="width: 80px" />
            <col style="width: 100px" />
            <col style="width: 124px" />
          </colgroup>
          <thead>
            <tr>
              <th><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
              <th class="sortable" @click="sortBy('Names')">名前</th>
              <th class="sortable" @click="sortBy('Image')">イメージ</th>
              <th class="sortable" @click="sortBy('State')">状態</th>
              <th>ポート</th>
              <th>CPU</th>
              <th>メモリ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in list"
              :key="c.ID"
              :class="{ selected: isSel(c) }"
              @click="onClick($event, c)"
              @dblclick="openDetail(c, 'overview')"
              @contextmenu="onMenu($event, c)"
            >
              <td @click.stop><input type="checkbox" :checked="isSel(c)" @change="toggle(c)" /></td>
              <td>
                <div class="name-cell">
                  <span class="dot" :class="c.State"></span>
                  <span class="ellipsis"><b>{{ c.Names }}</b></span>
                  <span v-if="guiInfo(c)" class="badge purple" title="GUI アプリ">GUI</span>
                  <span v-if="project(c)" class="badge" :title="`Compose: ${project(c)}`">{{ project(c) }}</span>
                </div>
                <div class="muted small mono">{{ c.ID.slice(0, 12) }}</div>
              </td>
              <td class="ellipsis" :title="c.Image">{{ c.Image }}</td>
              <td>
                <div class="ellipsis small">{{ c.Status }}</div>
                <div v-if="c.HealthStatus" class="small">
                  <span class="badge" :class="c.HealthStatus === 'healthy' ? 'green' : 'yellow'">{{ c.HealthStatus }}</span>
                </div>
              </td>
              <td>
                <a
                  v-for="p in parsePorts(c.Ports).filter((x) => x.host)"
                  :key="`${p.host}${p.proto}`"
                  class="port"
                  @click.stop="openPort(p)"
                  :title="`${p.ip}:${p.host} → ${p.container}/${p.proto}`"
                  >{{ p.host }}:{{ p.container }}</a
                >
              </td>
              <td class="mono small">{{ statsMap[c.ID]?.CPUPerc || '' }}</td>
              <td class="mono small">{{ statsMap[c.ID]?.MemUsage?.split(' / ')[0] || '' }}</td>
              <td>
                <div class="actions">
                  <button v-if="c.State === 'running'" class="btn ghost icon sm" title="停止" @click.stop="lifecycle('stop', [c.ID], c.Names)"><Square /></button>
                  <button v-else class="btn ghost icon sm" title="開始" @click.stop="lifecycle('start', [c.ID], c.Names)"><Play /></button>
                  <button class="btn ghost icon sm" title="ログ" @click.stop="openDetail(c, 'logs')"><FileText /></button>
                  <button class="btn ghost icon sm" title="ターミナル" :disabled="c.State !== 'running'" @click.stop="openDetail(c, 'terminal')"><Terminal /></button>
                  <button class="btn ghost icon sm" title="その他" @click.stop="onMenu($event, c)"><EllipsisVertical /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!list.length && !loading" class="empty">
          <Box />
          <div>{{ containers.length ? '条件に一致するコンテナーがありません' : 'コンテナーはまだありません' }}</div>
          <button v-if="!containers.length" class="btn primary" style="margin-top: 12px" @click="openRun()"><Play />最初のコンテナーを実行</button>
        </div>
      </div>
    </div>

    <ContainerDetail v-if="detail" :key="detail.c.ID" :container="detail.c" :tab="detail.tab" @close="detail = null" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
  Play, Square, RotateCw, Trash2, Search, RefreshCw, FileText, Terminal, EllipsisVertical, Box, CircleX, Eraser,
  CheckCheck,
} from '@lucide/vue';
import ContainerDetail from '../components/ContainerDetail.vue';
import { useContainers } from '../lib/useContainers.js';
import { lifecycle, removeContainers, containerMenu, guiInfo, pruneContainers } from '../lib/containerActions.js';
import { openRun, openViewer } from '../lib/store.js';
import { invoke } from '../lib/api.js';
import { parsePorts, labelValue } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';

const { containers, statsMap, loading, error, refresh } = useContainers();
const q = ref('');
const filter = ref('all');
const sel = ref(new Set());
const anchor = ref(null);
const detail = ref(null);
const sortKey = ref('Names');
const sortDir = ref(1);

const runningCount = computed(() => containers.value.filter((c) => c.State === 'running').length);
const project = (c) => labelValue(c.Labels, 'com.docker.compose.project');

const list = computed(() => {
  const s = q.value.trim().toLowerCase();
  return containers.value
    .filter((c) => filter.value === 'all' || (filter.value === 'running') === (c.State === 'running'))
    .filter((c) => !s || `${c.Names} ${c.Image} ${c.Ports} ${c.ID}`.toLowerCase().includes(s))
    .sort((a, b) => String(a[sortKey.value]).localeCompare(String(b[sortKey.value])) * sortDir.value);
});
const selected = computed(() => containers.value.filter((c) => sel.value.has(c.ID)));
const allChecked = computed(() => list.value.length > 0 && list.value.every((c) => sel.value.has(c.ID)));

// 一覧が更新されたら詳細パネルの内容も追従
watch(containers, (cs) => {
  if (detail.value) {
    const c = cs.find((x) => x.ID === detail.value.c.ID);
    if (c) detail.value.c = c;
  }
  const ids = new Set(cs.map((c) => c.ID));
  sel.value = new Set([...sel.value].filter((id) => ids.has(id)));
});

const isSel = (c) => sel.value.has(c.ID);
function sortBy(k) {
  if (sortKey.value === k) sortDir.value *= -1;
  else {
    sortKey.value = k;
    sortDir.value = 1;
  }
}
function toggle(c) {
  const s = new Set(sel.value);
  s.has(c.ID) ? s.delete(c.ID) : s.add(c.ID);
  sel.value = s;
  anchor.value = c.ID;
}
function toggleAll() {
  sel.value = allChecked.value ? new Set() : new Set(list.value.map((c) => c.ID));
}
function onClick(e, c) {
  if (e.ctrlKey || e.metaKey) return toggle(c);
  if (e.shiftKey && anchor.value) {
    const ids = list.value.map((x) => x.ID);
    const [a, b] = [ids.indexOf(anchor.value), ids.indexOf(c.ID)].sort((x, y) => x - y);
    sel.value = new Set(ids.slice(a, b + 1));
    return;
  }
  sel.value = new Set([c.ID]);
  anchor.value = c.ID;
  if (detail.value) detail.value = { c, tab: detail.value.tab };
}

function openDetail(c, tab) {
  detail.value = { c, tab };
}

async function onMenu(e, c) {
  e.preventDefault();
  e.stopPropagation();
  if (!sel.value.has(c.ID)) {
    sel.value = new Set([c.ID]);
    anchor.value = c.ID;
  }
  const { clientX, clientY } = e;
  const items = await containerMenu(c, selected.value.length ? selected.value : [c], openDetail);
  showMenu({ preventDefault() {}, stopPropagation() {}, clientX, clientY }, items, selected.value.length > 1 ? '' : c.Names);
}

function onEmptyMenu(e) {
  if (e.target.closest('tr, input, button, a')) return;
  showMenu(e, [
    { label: 'コンテナーを実行…', icon: Play, action: () => openRun() },
    { label: '更新', icon: RefreshCw, hint: 'F5', action: refresh },
    { label: 'すべて選択', icon: CheckCheck, hint: 'Ctrl+A', action: () => (sel.value = new Set(list.value.map((c) => c.ID))) },
    { divider: true },
    { label: '停止中のコンテナーをすべて削除', icon: Eraser, danger: true, action: pruneContainers },
  ]);
}

function bulk(action) {
  lifecycle(action, selected.value.map((c) => c.ID), `${selected.value.length} 件のコンテナー`);
}
function bulkRemove() {
  removeContainers(selected.value.map((c) => c.ID), { force: true, label: `${selected.value.length} 件のコンテナー` });
}
function openPort(p) {
  const c = containers.value.find((x) => parsePorts(x.Ports).some((y) => y.host === p.host));
  const g = c && guiInfo(c);
  if (g && String(g.port) === String(p.host)) openViewer(g.port, g.scheme, c.Names, g.path);
  else invoke('app:openExternal', `http://localhost:${p.host}/`);
}

function onKey(e) {
  if (e.target.closest('input, textarea, .xterm, .cm-editor')) return;
  if (e.key === 'F5') {
    e.preventDefault();
    refresh();
  } else if (e.key === 'Delete' && selected.value.length) {
    bulkRemove();
  } else if (e.key === 'a' && e.ctrlKey) {
    e.preventDefault();
    sel.value = new Set(list.value.map((c) => c.ID));
  } else if (e.key === 'Enter' && selected.value.length === 1) {
    openDetail(selected.value[0], 'logs');
  } else if (e.key === 'Escape') {
    if (detail.value) detail.value = null;
    else sel.value = new Set();
  }
}
</script>

<style scoped>
.page {
  outline: none;
  position: relative;
}
.list-toolbar {
  margin-bottom: 12px;
}
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
.table td:first-child {
  text-overflow: clip;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.sortable {
  cursor: pointer;
}
.sortable:hover {
  color: var(--text);
}
.port {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--accent-bg);
  font-family: var(--mono);
  font-size: 11.5px;
}
</style>

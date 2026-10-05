<template>
  <div class="drawer" :style="{ width: `${width}px` }">
    <div class="resizer" @mousedown="startResize"></div>
    <div class="d-head">
      <span class="dot" :class="container.State"></span>
      <div class="d-title">
        <h3 class="ellipsis">{{ container.Names }}</h3>
        <div class="muted small ellipsis">{{ container.Image }} · {{ container.Status }}</div>
      </div>
      <div class="spacer"></div>
      <button v-if="container.State === 'running'" class="btn sm" @click="lifecycle('stop', [container.ID], container.Names)"><Square />停止</button>
      <button v-else class="btn sm" @click="lifecycle('start', [container.ID], container.Names)"><Play />開始</button>
      <button class="btn sm" @click="lifecycle('restart', [container.ID], container.Names)"><RotateCw />再起動</button>
      <button class="btn ghost icon sm" title="メニュー" @click="menu"><EllipsisVertical /></button>
      <button class="btn ghost icon sm" title="閉じる (Esc)" @click="$emit('close')"><X /></button>
    </div>
    <div class="tabs">
      <button v-for="t in tabs" :key="t.id" class="tab" :class="{ active: current === t.id }" @click="current = t.id">
        <component :is="t.icon" />{{ t.label }}
      </button>
    </div>
    <div class="d-body">
      <div v-if="current === 'overview'" class="overview">
        <div v-if="!info" class="muted">読み込み中…</div>
        <template v-else>
          <div class="grid-2">
            <div class="card">
              <h3>基本情報</h3>
              <dl>
                <dt>ID</dt><dd class="mono selectable">{{ info.Id?.slice(0, 24) }}</dd>
                <dt>作成日時</dt><dd>{{ new Date(info.Created).toLocaleString() }}</dd>
                <dt>状態</dt><dd>{{ info.State?.Status || (info.State?.Running ? 'running' : 'exited') }} (終了コード {{ info.State?.ExitCode }})</dd>
                <dt>コマンド</dt><dd class="mono selectable">{{ [...(info.Config?.Entrypoint || []), ...(info.Config?.Cmd || [])].join(' ') }}</dd>
                <dt>作業ディレクトリ</dt><dd class="mono">{{ info.Config?.WorkingDir || '/' }}</dd>
                <dt>ユーザー</dt><dd class="mono">{{ info.Config?.User || 'root' }}</dd>
              </dl>
            </div>
            <div class="card">
              <h3>ネットワーク</h3>
              <dl v-for="(n, name) in info.NetworkSettings?.Networks" :key="name">
                <dt>{{ name }}</dt><dd class="mono selectable">{{ n.IPAddress }} (GW {{ n.Gateway }})</dd>
              </dl>
              <h3 style="margin-top: 12px">ポート</h3>
              <div v-for="(binds, p) in info.Ports || {}" :key="p" class="mono small">
                <template v-for="b in binds || []" :key="b.HostPort">{{ b.HostIp }}:{{ b.HostPort }} → {{ p }}<br /></template>
              </div>
            </div>
          </div>
          <div class="card">
            <h3>環境変数</h3>
            <table class="env selectable">
              <tr v-for="e in info.Config?.Env || []" :key="e">
                <td class="mono">{{ e.split('=')[0] }}</td>
                <td class="mono">{{ e.slice(e.indexOf('=') + 1) }}</td>
              </tr>
            </table>
          </div>
          <div class="card">
            <h3>マウント</h3>
            <div v-if="!info.Mounts?.length" class="muted small">なし</div>
            <div v-for="m in info.Mounts" :key="m.Destination" class="mono small selectable">
              {{ m.Name || m.Source }} → {{ m.Destination }} {{ m.RW === false ? '(ro)' : '' }}
            </div>
          </div>
          <div class="card">
            <h3>ラベル</h3>
            <div v-for="(v, k) in info.Config?.Labels || {}" :key="k" class="mono small selectable ellipsis">{{ k }} = {{ v }}</div>
          </div>
        </template>
      </div>
      <LogViewer v-else-if="current === 'logs'" :container="container.ID" />
      <template v-else-if="current === 'terminal'">
        <div v-if="container.State !== 'running'" class="empty">コンテナーが停止しているためターミナルを開けません</div>
        <XTerm v-else :opts="{ kind: 'exec', container: container.ID }" />
      </template>
      <div v-else-if="current === 'stats'" class="stats">
        <div v-if="!stats" class="muted">取得中…</div>
        <template v-else>
          <div class="grid-2">
            <div class="card big">
              <div class="muted small">CPU</div>
              <div class="num">{{ stats.CPUPerc }}</div>
              <Sparkline :values="history.cpu" color="#4f8cff" />
            </div>
            <div class="card big">
              <div class="muted small">メモリ ({{ stats.MemPerc }})</div>
              <div class="num">{{ stats.MemUsage?.split(' / ')[0] }}</div>
              <div class="muted small">上限 {{ stats.MemUsage?.split(' / ')[1] }}</div>
              <Sparkline :values="history.mem" color="#a371f7" />
            </div>
            <div class="card big"><div class="muted small">ネットワーク I/O</div><div class="num sm">{{ stats.NetIO }}</div></div>
            <div class="card big"><div class="muted small">ブロック I/O</div><div class="num sm">{{ stats.BlockIO }}</div></div>
            <div class="card big"><div class="muted small">プロセス数</div><div class="num">{{ stats.PIDs }}</div></div>
          </div>
        </template>
      </div>
      <div v-else-if="current === 'inspect'" class="inspect">
        <div class="row" style="margin-bottom: 8px">
          <div class="spacer"></div>
          <button class="btn sm" @click="copyText(JSON.stringify(info, null, 2))"><Copy />JSON をコピー</button>
        </div>
        <pre class="code">{{ JSON.stringify(info, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, h, defineComponent } from 'vue';
import { X, Play, Square, RotateCw, Info, FileText, Terminal, Activity, Braces, Copy, EllipsisVertical } from '@lucide/vue';
import LogViewer from './LogViewer.vue';
import XTerm from './XTerm.vue';
import { inspect, wslcJson } from '../lib/api.js';
import { lifecycle, containerMenu } from '../lib/containerActions.js';
import { copyText, state } from '../lib/store.js';
import { percent } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';

const props = defineProps({ container: Object, tab: String });
defineEmits(['close']);

const tabs = [
  { id: 'overview', label: '概要', icon: Info },
  { id: 'logs', label: 'ログ', icon: FileText },
  { id: 'terminal', label: 'ターミナル', icon: Terminal },
  { id: 'stats', label: '統計', icon: Activity },
  { id: 'inspect', label: 'Inspect', icon: Braces },
];
const current = ref(props.tab || 'overview');
const info = ref(null);
const stats = ref(null);
const history = reactive({ cpu: [], mem: [] });
const width = ref(Math.min(900, Math.round(window.innerWidth * 0.55)));
let statsTimer = null;

watch(() => props.tab, (t) => t && (current.value = t));

async function loadInfo() {
  try {
    [info.value] = await inspect(props.container.ID);
  } catch {
    info.value = null;
  }
}

async function loadStats() {
  if (current.value !== 'stats' || props.container.State !== 'running') return;
  try {
    const [s] = await wslcJson(['stats', '--format', 'json', props.container.ID]);
    stats.value = s;
    history.cpu = [...history.cpu, percent(s?.CPUPerc)].slice(-60);
    history.mem = [...history.mem, percent(s?.MemPerc)].slice(-60);
  } catch {
    /* ignore */
  }
}

async function menu(e) {
  const { clientX, clientY } = e;
  const items = await containerMenu(props.container, [props.container], (c, t) => (current.value = t));
  showMenu({ preventDefault() {}, stopPropagation() {}, clientX, clientY }, items, props.container.Names);
}

function startResize(e) {
  const startX = e.clientX;
  const startW = width.value;
  const move = (ev) => (width.value = Math.max(480, Math.min(window.innerWidth - 260, startW + startX - ev.clientX)));
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

watch(() => state.refreshTick, loadInfo);
watch(() => props.container.State, loadInfo);
onMounted(() => {
  loadInfo();
  loadStats();
  statsTimer = setInterval(loadStats, 2000);
});
onBeforeUnmount(() => clearInterval(statsTimer));

// 簡易スパークライン
const Sparkline = defineComponent({
  props: { values: Array, color: String },
  setup(p) {
    return () => {
      const v = p.values.length ? p.values : [0];
      const max = Math.max(1, ...v);
      const pts = v.map((y, i) => `${(i / Math.max(1, v.length - 1)) * 300},${48 - (y / max) * 44}`).join(' ');
      return h('svg', { viewBox: '0 0 300 50', class: 'spark', preserveAspectRatio: 'none' }, [
        h('polyline', { points: pts, fill: 'none', stroke: p.color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }),
      ]);
    };
  },
});
</script>

<style scoped>
.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--border-2);
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.4);
}
.resizer {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
}
.d-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px 18px;
}
.d-title {
  min-width: 0;
}
.d-title h3 {
  font-size: 15px;
}
.d-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
}
.overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
dl {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 6px 10px;
  margin: 0;
}
dt {
  color: var(--text-3);
}
dd {
  margin: 0;
  word-break: break-all;
}
.env {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.env td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  word-break: break-all;
}
.env td:first-child {
  color: var(--accent-2);
  width: 35%;
}
.big .num {
  font-size: 26px;
  font-weight: 600;
  margin: 4px 0;
}
.big .num.sm {
  font-size: 17px;
}
:deep(.spark) {
  width: 100%;
  height: 50px;
  margin-top: 6px;
}
.inspect pre {
  flex: 1;
}
</style>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>ダッシュボード</h1>
        <div class="sub">WSL3 の wslc コンテナー環境の概要</div>
      </div>
      <div class="spacer"></div>
      <button class="btn" @click="refreshAll"><RefreshCw :class="{ spin: loading }" />更新</button>
      <button class="btn primary" @click="openRun()"><Play />コンテナーを実行</button>
    </div>
    <div class="page-body">
      <div class="stats-grid">
        <div class="stat card" @click="$router.push('/containers')">
          <div class="stat-icon blue"><Box /></div>
          <div>
            <div class="stat-num">{{ running }} <span class="muted">/ {{ containers.length }}</span></div>
            <div class="muted small">稼働中のコンテナー</div>
          </div>
        </div>
        <div class="stat card" @click="$router.push('/images')">
          <div class="stat-icon purple"><Layers /></div>
          <div>
            <div class="stat-num">{{ images.length }}</div>
            <div class="muted small">イメージ ({{ imageSize }})</div>
          </div>
        </div>
        <div class="stat card" @click="$router.push('/volumes')">
          <div class="stat-icon green"><HardDrive /></div>
          <div>
            <div class="stat-num">{{ volumes.length }}</div>
            <div class="muted small">ボリューム</div>
          </div>
        </div>
        <div class="stat card" @click="$router.push('/networks')">
          <div class="stat-icon yellow"><Network /></div>
          <div>
            <div class="stat-num">{{ networks.length }}</div>
            <div class="muted small">ネットワーク</div>
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <h3>稼働中のコンテナー</h3>
          <div v-if="!runningList.length" class="empty small">
            <Box />
            <div>稼働中のコンテナーはありません</div>
          </div>
          <div v-for="c in runningList" :key="c.ID" class="run-item" @dblclick="$router.push('/containers')">
            <span class="dot running"></span>
            <div class="ri-main">
              <div class="ellipsis"><b>{{ c.Names }}</b> <span class="muted small">{{ c.Image }}</span></div>
              <div class="ri-bars">
                <span class="muted small">CPU</span>
                <div class="bar"><div :style="{ width: `${Math.min(100, percent(statsMap[c.ID]?.CPUPerc))}%` }"></div></div>
                <span class="small mono num">{{ statsMap[c.ID]?.CPUPerc || '-' }}</span>
                <span class="muted small">MEM</span>
                <div class="bar"><div :style="{ width: `${Math.min(100, percent(statsMap[c.ID]?.MemPerc))}%` }"></div></div>
                <span class="small mono num">{{ statsMap[c.ID]?.MemUsage?.split(' / ')[0] || '-' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="col">
          <div class="card">
            <h3>クイック操作</h3>
            <div class="quick">
              <button class="q" @click="openRun()"><Play /><span>コンテナーを実行</span></button>
              <button class="q" @click="$router.push('/hub')"><Search /><span>Docker Hub を検索</span></button>
              <button class="q" @click="$router.push('/compose')"><FileCode2 /><span>Compose を編集</span></button>
              <button class="q" @click="$router.push('/gui')"><MonitorPlay /><span>GUI アプリを起動</span></button>
              <button class="q" @click="$router.push('/terminal')"><Terminal /><span>ターミナル</span></button>
              <button class="q" @click="pullImage"><Download /><span>イメージを取得</span></button>
            </div>
          </div>
          <div class="card">
            <h3>システム情報</h3>
            <table class="kv">
              <tr><td>WSL / wslc</td><td class="mono">{{ info?.Client?.Version || '-' }}</td></tr>
              <tr><td>カーネル</td><td class="mono">{{ info?.Client?.KernelVersion || '-' }}</td></tr>
              <tr><td>Windows</td><td class="mono">{{ info?.Client?.WindowsVersion || '-' }}</td></tr>
              <tr><td>セッション管理</td><td class="mono">{{ info?.Server?.SessionManagerVersion || '-' }}</td></tr>
              <tr><td>セッション数</td><td class="mono">{{ info?.Server?.Sessions?.length ?? '-' }}</td></tr>
              <tr><td>端末</td><td>{{ state.status?.pty ? 'ConPTY (フル機能)' : 'パイプ (簡易)' }}</td></tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import {
  Box, Layers, HardDrive, Network, Play, RefreshCw, Search, FileCode2, MonitorPlay, Terminal, Download,
} from '@lucide/vue';
import { useContainers } from '../lib/useContainers.js';
import { wslcJson } from '../lib/api.js';
import { state, openRun, prompt, runJob, refreshStatus } from '../lib/store.js';
import { percent, parseSize, bytes } from '../lib/format.js';

const { containers, statsMap, loading, refresh } = useContainers();
const images = ref([]);
const volumes = ref([]);
const networks = ref([]);

const info = computed(() => state.status?.info);
const running = computed(() => containers.value.filter((c) => c.State === 'running').length);
const runningList = computed(() => containers.value.filter((c) => c.State === 'running'));
const imageSize = computed(() => bytes(images.value.reduce((a, i) => a + parseSize(i.Size), 0)));

async function loadOthers() {
  const [i, v, n] = await Promise.allSettled([
    wslcJson(['images', '--format', 'json']),
    wslcJson(['volume', 'list', '--format', 'json']),
    wslcJson(['network', 'list', '--format', 'json']),
  ]);
  images.value = i.value || [];
  volumes.value = v.value || [];
  networks.value = n.value || [];
}

async function refreshAll() {
  await Promise.all([refresh(), loadOthers(), refreshStatus()]);
}

async function pullImage() {
  const name = await prompt({ title: 'イメージを取得', label: 'イメージ名', placeholder: 'nginx:alpine', okText: '取得' });
  if (name) runJob(`pull ${name}`, ['pull', name.trim()]);
}

watch(() => state.refreshTick, loadOthers);
onMounted(loadOthers);
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.stat:hover {
  border-color: var(--border-2);
  transform: translateY(-1px);
}
.stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
}
.stat-icon svg {
  width: 21px;
  height: 21px;
}
.stat-icon.blue {
  background: var(--accent-bg);
  color: var(--accent-2);
}
.stat-icon.purple {
  background: rgba(163, 113, 247, 0.15);
  color: var(--purple);
}
.stat-icon.green {
  background: var(--green-bg);
  color: var(--green);
}
.stat-icon.yellow {
  background: var(--yellow-bg);
  color: var(--yellow);
}
.stat-num {
  font-size: 24px;
  font-weight: 600;
}
.stat-num .muted {
  font-size: 15px;
}
.dash-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 14px;
  align-items: start;
}
.run-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border);
}
.run-item:last-child {
  border-bottom: none;
}
.ri-main {
  flex: 1;
  min-width: 0;
}
.ri-bars {
  display: grid;
  grid-template-columns: auto 1fr 64px auto 1fr 72px;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.num {
  text-align: right;
}
.quick {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.q {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 6px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.q:hover {
  border-color: var(--accent);
  color: var(--text);
}
.q svg {
  width: 20px;
  height: 20px;
  color: var(--accent-2);
}
.kv {
  width: 100%;
  border-collapse: collapse;
}
.kv td {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.kv td:first-child {
  color: var(--text-3);
  width: 120px;
}
.kv tr:last-child td {
  border-bottom: none;
}
</style>

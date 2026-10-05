<template>
  <div class="app">
    <header class="titlebar">
      <div class="brand">
        <div class="logo"><Container /></div>
        <span>WSL Container Studio</span>
      </div>
      <div class="status-pill" :class="statusClass" @click="$router.push('/settings')" title="wslc の状態">
        <span class="dot" :class="statusClass === 'ok' ? 'running' : 'exited'"></span>
        <span>{{ statusText }}</span>
      </div>
      <div class="drag"></div>
    </header>

    <div class="main">
      <nav class="sidebar">
        <router-link v-for="n in nav" :key="n.to" :to="n.to" class="nav-item" :class="{ active: isActive(n.to) }">
          <component :is="n.icon" />
          <span>{{ n.label }}</span>
          <span v-if="n.count != null" class="count">{{ n.count }}</span>
        </router-link>
        <div class="spacer"></div>
        <button class="nav-item jobs-toggle" @click="state.jobsOpen = !state.jobsOpen">
          <Activity />
          <span>タスク</span>
          <span v-if="runningJobs" class="count live">{{ runningJobs }}</span>
        </button>
        <router-link to="/settings" class="nav-item" :class="{ active: isActive('/settings') }">
          <Settings />
          <span>設定</span>
        </router-link>
      </nav>

      <main class="content">
        <div v-if="state.status && !state.status.found" class="setup-banner">
          <TriangleAlert />
          <div>
            <b>wslc.exe が見つかりません。</b>
            このアプリは WSL3 に同梱されている WSL Container CLI (wslc) を使います。
            管理者権限の PowerShell で <code>wsl --update</code> を実行して WSL3 に更新してください。
          </div>
        </div>
        <router-view v-slot="{ Component }">
          <keep-alive include="TerminalPage">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>
    </div>

    <JobsPanel />
    <RunDialog />
    <AppDialog />
    <ContextMenu />
    <Toasts />
  </div>
</template>

<script setup>
import { computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  LayoutDashboard, Box, Layers, HardDrive, Network, Search, FileCode2, MonitorPlay, Terminal, Settings, Container,
  Activity, TriangleAlert,
} from '@lucide/vue';
import { state, loadSettings, loadGuiPresets, refreshStatus, toast } from './lib/store.js';
import JobsPanel from './components/JobsPanel.vue';
import RunDialog from './components/RunDialog.vue';
import AppDialog from './components/AppDialog.vue';
import ContextMenu from './components/ContextMenu.vue';
import Toasts from './components/Toasts.vue';

const route = useRoute();
const router = useRouter();

// 他の画面からターミナルを開く要求が来たらターミナル画面へ移動
watch(
  () => state.terminalRequests.length,
  (n) => n && route.path !== '/terminal' && router.push('/terminal'),
);

const nav = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/containers', label: 'コンテナー', icon: Box },
  { to: '/images', label: 'イメージ', icon: Layers },
  { to: '/volumes', label: 'ボリューム', icon: HardDrive },
  { to: '/networks', label: 'ネットワーク', icon: Network },
  { to: '/hub', label: 'Docker Hub', icon: Search },
  { to: '/compose', label: 'Compose', icon: FileCode2 },
  { to: '/gui', label: 'GUI アプリ', icon: MonitorPlay },
  { to: '/terminal', label: 'ターミナル', icon: Terminal },
];

const isActive = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to));
const runningJobs = computed(() => state.jobs.filter((j) => j.status === 'running').length);

const statusClass = computed(() => {
  const s = state.status;
  if (!s) return 'pending';
  if (s.maintenance) return 'pending';
  return s.found && s.ok ? 'ok' : 'ng';
});
const statusText = computed(() => {
  const s = state.status;
  if (!s) return '確認中…';
  if (s.maintenance) return 'VHDX 最適化中…';
  if (!s.found) return 'wslc 未検出';
  if (!s.ok) return 'wslc エラー';
  return `WSL ${s.info?.Client?.Version || ''}`;
});

let timer = null;
onMounted(async () => {
  await loadSettings();
  await loadGuiPresets().catch((e) => toast(`プリセットを読み込めません: ${e.message}`, 'error'));
  await refreshStatus();
  timer = setInterval(refreshStatus, 30000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.titlebar {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 150px 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  -webkit-app-region: drag;
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 600;
  font-size: 13px;
  width: 200px;
}
.logo {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--accent), var(--purple));
}
.logo svg {
  width: 15px;
  height: 15px;
  color: #fff;
}
.status-pill {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.drag {
  flex: 1;
}
.main {
  flex: 1;
  display: flex;
  min-height: 0;
}
.sidebar {
  width: 214px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  border-right: 1px solid var(--border);
  background: var(--bg);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--text-2);
  text-decoration: none !important;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.nav-item svg {
  width: 17px;
  height: 17px;
}
.nav-item:hover {
  background: var(--panel);
  color: var(--text);
}
.nav-item.active {
  background: var(--accent-bg);
  color: var(--text);
}
.nav-item.active svg {
  color: var(--accent-2);
}
.count {
  margin-left: auto;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 9px;
  background: var(--panel-3);
}
.count.live {
  background: var(--accent);
  color: #fff;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: radial-gradient(1200px 500px at 70% -10%, rgba(79, 140, 255, 0.06), transparent), var(--bg);
}
.content > :deep(.page) {
  flex: 1;
  min-height: 0;
}
.setup-banner {
  display: flex;
  gap: 10px;
  margin: 12px 24px 0;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--red-bg);
  border: 1px solid rgba(248, 81, 73, 0.4);
  line-height: 1.6;
}
.setup-banner svg {
  width: 18px;
  color: var(--red);
  flex-shrink: 0;
}
</style>

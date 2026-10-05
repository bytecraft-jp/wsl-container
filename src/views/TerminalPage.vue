<template>
  <div class="page">
    <div class="term-tabs">
      <div
        v-for="t in tabs"
        :key="t.id"
        class="t-tab"
        :class="{ active: active === t.id, exited: t.exited }"
        @click="active = t.id"
        @mousedown.middle.prevent="close(t.id)"
        @contextmenu="onTabMenu($event, t)"
      >
        <Terminal />
        <span class="ellipsis">{{ t.title }}</span>
        <button class="x" @click.stop="close(t.id)"><X /></button>
      </div>
      <button class="btn ghost sm" @click="newMenu"><Plus />新しいターミナル</button>
    </div>
    <div class="term-body">
      <div v-if="!tabs.length" class="empty">
        <Terminal />
        <div>コンテナーのシェルや一時コンテナーを開けます</div>
        <button class="btn primary" style="margin-top: 12px" @click="newMenu"><Plus />新しいターミナル</button>
      </div>
      <div v-for="t in tabs" v-show="active === t.id" :key="t.id" class="term-pane">
        <XTerm :opts="t.opts" @exit="t.exited = true" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { Terminal, X, Plus, Box, Package, Copy } from '@lucide/vue';
import XTerm from '../components/XTerm.vue';
import { wslcJson, newId } from '../lib/api.js';
import { state, prompt } from '../lib/store.js';
import { showMenu } from '../lib/contextMenu.js';

defineOptions({ name: 'TerminalPage' });

const tabs = ref([]);
const active = ref('');

function add(title, opts) {
  const id = newId('tab');
  tabs.value.push({ id, title, opts, exited: false });
  active.value = id;
}

function close(id) {
  const i = tabs.value.findIndex((t) => t.id === id);
  if (i < 0) return;
  tabs.value.splice(i, 1);
  if (active.value === id) active.value = tabs.value[Math.max(0, i - 1)]?.id || '';
}

async function newMenu(e) {
  const { clientX, clientY } = e;
  let running = [];
  try {
    running = (await wslcJson(['list', '--format', 'json'])).filter((c) => c.State === 'running');
  } catch {
    /* ignore */
  }
  showMenu({ preventDefault() {}, stopPropagation() {}, clientX, clientY }, [
    { header: '実行中のコンテナー' },
    ...running.map((c) => ({ label: c.Names, icon: Box, hint: c.Image, action: () => add(c.Names, { kind: 'exec', container: c.ID }) })),
    !running.length && { label: '(実行中のコンテナーはありません)', disabled: true },
    { divider: true },
    { header: '一時コンテナー (終了時に削除)' },
    ...['alpine:latest', 'ubuntu:24.04', 'debian:bookworm-slim', 'busybox:latest'].map((img) => ({
      label: img,
      icon: Package,
      action: () => add(`${img} (一時)`, { kind: 'run', args: ['run', '--rm', '-it', img, 'sh'] }),
    })),
    {
      label: '任意のイメージ…',
      icon: Package,
      action: async () => {
        const img = await prompt({ title: '一時コンテナー', label: 'イメージ', placeholder: 'python:3.13', okText: '開く' });
        if (img) add(`${img} (一時)`, { kind: 'run', args: ['run', '--rm', '-it', '--entrypoint', 'sh', img.trim()] });
      },
    },
  ]);
}

function onTabMenu(e, t) {
  showMenu(e, [
    { label: '複製', icon: Copy, action: () => add(t.title, t.opts) },
    { label: '閉じる', icon: X, action: () => close(t.id) },
    { label: '他のタブを閉じる', icon: X, action: () => (tabs.value = tabs.value.filter((x) => x.id === t.id)) },
  ], t.title);
}

function consume() {
  for (const r of state.terminalRequests.splice(0)) add(r.title, r.opts);
}
watch(() => state.terminalRequests.length, consume);
onMounted(consume);
</script>

<style scoped>
.term-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.t-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 220px;
  height: 34px;
  padding: 0 6px 0 12px;
  border-radius: 8px 8px 0 0;
  border: 1px solid transparent;
  border-bottom: none;
  color: var(--text-2);
  cursor: pointer;
}
.t-tab.active {
  background: #0b0f15;
  border-color: var(--border);
  color: var(--text);
}
.t-tab.exited {
  opacity: 0.6;
}
.t-tab > svg {
  width: 14px;
  flex-shrink: 0;
}
.x {
  border: none;
  background: none;
  color: inherit;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.x:hover {
  background: var(--panel-3);
}
.x svg {
  width: 13px;
}
.term-body {
  flex: 1;
  min-height: 0;
  padding: 10px 16px 16px;
  position: relative;
}
.term-pane {
  height: 100%;
}
</style>

<template>
  <transition name="fade">
    <div v-if="state.jobsOpen" class="jobs">
      <div class="jobs-head">
        <Activity />
        <b>タスク</b>
        <span class="muted small">{{ state.jobs.length }} 件</span>
        <div class="spacer"></div>
        <button class="btn ghost sm" @click="clearJobs" :disabled="!state.jobs.length">完了分を消去</button>
        <button class="btn ghost icon sm" @click="state.jobsOpen = false"><X /></button>
      </div>
      <div class="jobs-list">
        <div v-if="!state.jobs.length" class="empty small">実行中のタスクはありません</div>
        <div v-for="j in state.jobs" :key="j.id" class="job" :class="j.status">
          <div class="job-head" @click="toggle(j.id)" @contextmenu="onMenu($event, j)">
            <LoaderCircle v-if="j.status === 'running'" class="spin" />
            <CircleCheck v-else-if="j.status === 'done'" class="ok" />
            <CircleX v-else class="ng" />
            <span class="ellipsis title">{{ j.title }}</span>
            <span class="muted small">{{ elapsed(j) }}</span>
            <button v-if="j.stop" class="btn ghost icon sm" title="中止" @click.stop="j.stop()"><Square /></button>
            <ChevronDown class="chev" :class="{ open: expanded.has(j.id) }" />
          </div>
          <pre v-if="expanded.has(j.id) || j.status === 'running'" :ref="(el) => setRef(j.id, el)" class="job-log">{{ clean(j.log) }}</pre>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { reactive, watch, nextTick } from 'vue';
import { Activity, X, LoaderCircle, CircleCheck, CircleX, ChevronDown, Square, Copy, Trash2 } from '@lucide/vue';
import { state, clearJobs, copyText } from '../lib/store.js';
import { stripAnsi } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';

const expanded = reactive(new Set());
const refs = {};
const setRef = (id, el) => {
  if (el) refs[id] = el;
};
const toggle = (id) => (expanded.has(id) ? expanded.delete(id) : expanded.add(id));
const clean = (s) => stripAnsi(s).split('\n').slice(-400).join('\n');
const elapsed = (j) => {
  const s = Math.round((Date.now() - j.started) / 1000);
  return s < 60 ? `${s}秒前` : `${Math.round(s / 60)}分前`;
};

function onMenu(e, j) {
  showMenu(e, [
    { label: 'ログをコピー', icon: Copy, action: () => copyText(stripAnsi(j.log)) },
    j.stop && { label: '中止', icon: Square, danger: true, action: () => j.stop() },
    {
      label: '一覧から削除',
      icon: Trash2,
      disabled: j.status === 'running',
      action: () => state.jobs.splice(state.jobs.indexOf(j), 1),
    },
  ]);
}

watch(
  () => state.jobs.map((j) => j.log.length),
  async () => {
    await nextTick();
    Object.values(refs).forEach((el) => {
      if (el?.isConnected) el.scrollTop = el.scrollHeight;
    });
  },
);
</script>

<style scoped>
.jobs {
  position: fixed;
  left: 224px;
  bottom: 14px;
  width: 560px;
  max-height: 58vh;
  z-index: 800;
  display: flex;
  flex-direction: column;
  background: rgba(22, 27, 36, 0.98);
  border: 1px solid var(--border-2);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.jobs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 14px;
  border-bottom: 1px solid var(--border);
}
.jobs-head svg {
  width: 16px;
}
.jobs-list {
  overflow: auto;
  padding: 6px;
}
.job {
  border-radius: 8px;
  margin-bottom: 4px;
  background: var(--panel-2);
}
.job-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
}
.job-head > svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
.title {
  flex: 1;
}
.ok {
  color: var(--green);
}
.ng {
  color: var(--red);
}
.chev {
  opacity: 0.5;
  transition: transform 0.15s;
}
.chev.open {
  transform: rotate(180deg);
}
.job-log {
  margin: 0;
  padding: 8px 12px;
  max-height: 220px;
  overflow: auto;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-2);
  background: var(--bg);
  border-top: 1px solid var(--border);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
</style>

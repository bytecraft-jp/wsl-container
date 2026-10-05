<template>
  <div class="logs">
    <div class="toolbar">
      <div class="search">
        <Search />
        <input v-model="filter" class="input" placeholder="ログを絞り込み (正規表現可)" />
      </div>
      <label class="check small"><input v-model="follow" type="checkbox" />自動スクロール</label>
      <label class="check small"><input v-model="timestamps" type="checkbox" @change="restart" />タイムスタンプ</label>
      <select v-model="tail" class="input" style="width: 110px" @change="restart">
        <option value="200">末尾 200 行</option>
        <option value="1000">末尾 1000 行</option>
        <option value="5000">末尾 5000 行</option>
        <option value="all">すべて</option>
      </select>
      <div class="spacer"></div>
      <span v-if="live" class="badge green"><span class="dot running"></span>ライブ</span>
      <span v-else class="badge">停止</span>
      <button class="btn sm" @click="lines = []"><Eraser />クリア</button>
      <button class="btn sm" @click="save"><Download />保存</button>
    </div>
    <div ref="box" class="log-box selectable" @scroll="onScroll">
      <div v-for="(l, i) in shown" :key="i" class="line" :class="{ err: /error|fatal|exception|失敗/i.test(l) }">
        {{ l }}
      </div>
      <div v-if="!shown.length" class="muted">ログはまだありません</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { Search, Eraser, Download } from '@lucide/vue';
import { startStream, invoke } from '../lib/api.js';
import { stripAnsi } from '../lib/format.js';
import { toast } from '../lib/store.js';

const props = defineProps({ container: { type: String, required: true } });

const lines = ref([]);
const filter = ref('');
const follow = ref(true);
const timestamps = ref(false);
const tail = ref('1000');
const live = ref(false);
const box = ref(null);
let stream = null;
let partial = '';

const shown = computed(() => {
  if (!filter.value) return lines.value;
  let re;
  try {
    re = new RegExp(filter.value, 'i');
  } catch {
    const f = filter.value.toLowerCase();
    return lines.value.filter((l) => l.toLowerCase().includes(f));
  }
  return lines.value.filter((l) => re.test(l));
});

function push(chunk) {
  const text = partial + stripAnsi(chunk);
  const parts = text.split('\n');
  partial = parts.pop();
  if (parts.length) {
    lines.value.push(...parts);
    if (lines.value.length > 20000) lines.value.splice(0, lines.value.length - 20000);
  }
}

function start() {
  const args = ['logs', '-f'];
  if (tail.value !== 'all') args.push('-n', tail.value);
  if (timestamps.value) args.push('-t');
  args.push(props.container);
  live.value = true;
  stream = startStream(args, {
    onData: push,
    onExit: () => {
      if (partial) lines.value.push(partial);
      partial = '';
      live.value = false;
    },
  });
}

function restart() {
  stream?.stop();
  lines.value = [];
  partial = '';
  start();
}

function onScroll() {
  const el = box.value;
  follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

async function save() {
  const p = await invoke('fs:save', { defaultPath: `${props.container}.log`, filters: [{ name: 'Log', extensions: ['log', 'txt'] }] });
  if (!p) return;
  await invoke('fs:write', p, lines.value.join('\n'));
  toast(`保存しました: ${p}`, 'success');
}

watch(
  () => shown.value.length,
  async () => {
    if (!follow.value) return;
    await nextTick();
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  },
);
watch(() => props.container, restart);
onMounted(start);
onBeforeUnmount(() => stream?.stop());
</script>

<style scoped>
.logs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}
.search {
  position: relative;
  flex: 0 1 280px;
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
.log-box {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  background: #0b0f15;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.55;
}
.line {
  white-space: pre-wrap;
  word-break: break-all;
  color: #c9d1d9;
}
.line.err {
  color: #ff8a80;
}
</style>

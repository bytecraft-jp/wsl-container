<template>
  <div class="xterm-wrap" @contextmenu="onMenu">
    <div ref="host" class="xterm-host"></div>
    <div v-if="exited" class="exited">
      <span>セッションが終了しました (終了コード {{ exitCode }})</span>
      <button class="btn sm" @click="restart"><RotateCw />再接続</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { RotateCw, Copy, ClipboardPaste, Eraser } from '@lucide/vue';
import { startPty } from '../lib/api.js';
import { showMenu } from '../lib/contextMenu.js';

const props = defineProps({
  opts: { type: Object, required: true },
  initialInput: { type: String, default: '' },
});
const emit = defineEmits(['exit']);

const host = ref(null);
const exited = ref(false);
const exitCode = ref(0);
let term = null;
let fit = null;
let session = null;
let ro = null;
let resizeTimer = null;

function connect() {
  exited.value = false;
  fit.fit();
  session = startPty(
    { ...props.opts, cols: term.cols, rows: term.rows },
    {
      onData: (d) => term.write(d),
      onExit: (c) => {
        exitCode.value = c;
        exited.value = true;
        emit('exit', c);
      },
    },
  );
  if (props.initialInput) setTimeout(() => session?.write(props.initialInput), 900);
}

function restart() {
  term.reset();
  connect();
}

function onMenu(e) {
  const sel = term?.getSelection();
  showMenu(e, [
    { label: 'コピー', icon: Copy, disabled: !sel, hint: 'Ctrl+Shift+C', action: () => navigator.clipboard.writeText(sel) },
    {
      label: '貼り付け',
      icon: ClipboardPaste,
      hint: 'Ctrl+Shift+V',
      action: async () => session?.write(await navigator.clipboard.readText()),
    },
    { divider: true },
    { label: '画面をクリア', icon: Eraser, action: () => term.clear() },
    { label: '再接続', icon: RotateCw, action: () => (session?.stop(), restart()) },
  ]);
}

onMounted(() => {
  term = new Terminal({
    fontFamily: "'Cascadia Code', Consolas, 'BIZ UDGothic', monospace",
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 5000,
    theme: {
      background: '#0b0f15',
      foreground: '#d7dde8',
      cursor: '#7aa7ff',
      selectionBackground: 'rgba(79,140,255,0.35)',
    },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host.value);
  term.onData((d) => session?.write(d));
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
    if (e.code === 'KeyC') {
      navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    if (e.code === 'KeyV') {
      navigator.clipboard.readText().then((t) => session?.write(t));
      return false;
    }
    return true;
  });
  connect();
  ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!host.value?.offsetWidth) return;
      fit.fit();
      session?.resize(term.cols, term.rows);
    }, 80);
  });
  ro.observe(host.value);
  term.focus();
});

onBeforeUnmount(() => {
  ro?.disconnect();
  session?.stop();
  term?.dispose();
});

defineExpose({ focus: () => term?.focus(), write: (d) => session?.write(d) });
</script>

<style scoped>
.xterm-wrap {
  position: relative;
  height: 100%;
  min-height: 0;
  background: #0b0f15;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  overflow: hidden;
}
.xterm-host {
  position: absolute;
  inset: 8px 4px 4px 10px;
}
.exited {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border-2);
  box-shadow: var(--shadow);
}
</style>

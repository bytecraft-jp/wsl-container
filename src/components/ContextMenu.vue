<template>
  <teleport to="body">
    <div v-if="menu.visible" class="cm-backdrop" @mousedown="hideMenu" @contextmenu.prevent="hideMenu"></div>
    <transition name="fade">
      <div v-if="menu.visible" ref="root" class="cm" :style="pos" @contextmenu.prevent>
        <div v-if="menu.title" class="cm-title ellipsis">{{ menu.title }}</div>
        <MenuList :items="menu.items" @done="hideMenu" />
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, h, defineComponent } from 'vue';
import { ChevronRight, Scissors, Copy, ClipboardPaste, TextSelect } from '@lucide/vue';
import { menu, hideMenu, showMenu } from '../lib/contextMenu.js';

const root = ref(null);
const adj = ref({ x: 0, y: 0 });

const pos = computed(() => ({ left: `${adj.value.x}px`, top: `${adj.value.y}px` }));

watch(
  () => [menu.visible, menu.x, menu.y],
  async () => {
    if (!menu.visible) return;
    adj.value = { x: menu.x, y: menu.y };
    await nextTick();
    const el = root.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    adj.value = {
      x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 6)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 6)),
    };
  },
);

// 再帰的なメニュー (サブメニュー対応)
const MenuList = defineComponent({
  name: 'MenuList',
  props: { items: Array },
  emits: ['done'],
  setup(props, { emit }) {
    const open = ref(-1);
    const run = async (it) => {
      if (it.disabled || it.children) return;
      emit('done');
      await it.action?.();
    };
    return () =>
      h(
        'div',
        { class: 'cm-list' },
        props.items.map((it, i) => {
          if (it.divider) return h('div', { class: 'cm-divider', key: `d${i}` });
          if (it.header) return h('div', { class: 'cm-header', key: `h${i}` }, it.header);
          const children = it.children?.filter(Boolean);
          return h(
            'div',
            {
              key: i,
              class: ['cm-item', { danger: it.danger, disabled: it.disabled || (children && !children.length), sub: !!children }],
              onMouseenter: () => (open.value = i),
              onClick: () => run(it),
            },
            [
              h('span', { class: 'cm-icon' }, it.icon ? h(it.icon) : null),
              h('span', { class: 'cm-label' }, it.label),
              it.hint ? h('span', { class: 'cm-hint' }, it.hint) : null,
              children ? h(ChevronRight, { class: 'cm-chev' }) : null,
              children && children.length && open.value === i
                ? h('div', { class: 'cm cm-submenu' }, [h(MenuList, { items: children, onDone: () => emit('done') })])
                : null,
            ],
          );
        }),
      );
  },
});

// 入力欄では編集用の標準メニューを出す
function onGlobalContext(e) {
  if (e.defaultPrevented) return;
  const t = e.target;
  const editable = t.closest?.('input, textarea, [contenteditable="true"], .cm-editor, .selectable');
  if (!editable) {
    e.preventDefault();
    return;
  }
  const sel = window.getSelection()?.toString();
  const isInput = !!t.closest('input, textarea, [contenteditable="true"], .cm-editor');
  showMenu(e, [
    isInput && { label: '切り取り', icon: Scissors, hint: 'Ctrl+X', action: () => document.execCommand('cut') },
    { label: 'コピー', icon: Copy, hint: 'Ctrl+C', disabled: !sel, action: () => navigator.clipboard.writeText(sel) },
    isInput && {
      label: '貼り付け',
      icon: ClipboardPaste,
      hint: 'Ctrl+V',
      action: async () => {
        t.focus();
        const text = await navigator.clipboard.readText();
        document.execCommand('insertText', false, text);
      },
    },
    { divider: true },
    { label: 'すべて選択', icon: TextSelect, hint: 'Ctrl+A', action: () => (t.focus(), document.execCommand('selectAll')) },
  ]);
}
function onKey(e) {
  if (e.key === 'Escape') hideMenu();
}
onMounted(() => {
  window.addEventListener('contextmenu', onGlobalContext);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', hideMenu);
});
onBeforeUnmount(() => {
  window.removeEventListener('contextmenu', onGlobalContext);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('blur', hideMenu);
});
</script>

<style>
.cm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
}
.cm {
  position: fixed;
  z-index: 901;
  min-width: 220px;
  max-width: 340px;
  padding: 5px;
  background: rgba(28, 35, 48, 0.97);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.cm-title {
  padding: 6px 10px 6px;
  font-size: 11px;
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.cm-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text);
}
.cm-item:hover {
  background: var(--accent);
  color: #fff;
}
.cm-item.danger {
  color: var(--red);
}
.cm-item.danger:hover {
  background: var(--red);
  color: #fff;
}
.cm-item.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.cm-icon {
  width: 16px;
  display: grid;
  place-items: center;
}
.cm-icon svg {
  width: 15px;
  height: 15px;
}
.cm-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm-hint {
  font-size: 11px;
  opacity: 0.55;
}
.cm-chev {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}
.cm-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}
.cm-header {
  padding: 6px 10px 2px;
  font-size: 11px;
  color: var(--text-3);
}
.cm-submenu {
  position: absolute;
  left: calc(100% + 2px);
  top: -5px;
  max-height: 60vh;
  overflow-y: auto;
}
</style>

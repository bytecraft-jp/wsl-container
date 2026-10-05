<template>
  <div class="toasts">
    <transition-group name="fade">
      <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.type" @click="dismissToast(t.id)">
        <component :is="icons[t.type] || Info" />
        <span class="msg selectable">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { Info, CircleCheck, CircleX, TriangleAlert } from '@lucide/vue';
import { state, dismissToast } from '../lib/store.js';

const icons = { info: Info, success: CircleCheck, error: CircleX, warn: TriangleAlert };
</script>

<style scoped>
.toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 380px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 11px 14px;
  border-radius: 10px;
  background: rgba(28, 35, 48, 0.97);
  border: 1px solid var(--border-2);
  box-shadow: var(--shadow);
  line-height: 1.5;
  cursor: pointer;
}
.toast svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--accent-2);
}
.toast.success svg {
  color: var(--green);
}
.toast.error {
  border-color: rgba(248, 81, 73, 0.5);
}
.toast.error svg {
  color: var(--red);
}
.toast.warn svg {
  color: var(--yellow);
}
.msg {
  word-break: break-word;
  white-space: pre-wrap;
}
</style>

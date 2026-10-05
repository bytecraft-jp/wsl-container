<template>
  <teleport to="body">
    <div class="modal-backdrop" @mousedown.self="$emit('close')">
      <div class="modal" :style="{ width }" @keydown.esc="$emit('close')">
        <div class="modal-head">
          <slot name="icon"></slot>
          <h3>{{ title }}</h3>
          <div class="spacer"></div>
          <button class="btn ghost icon sm" @click="$emit('close')"><X /></button>
        </div>
        <div class="modal-body">
          <slot></slot>
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { X } from '@lucide/vue';

defineProps({ title: String, width: { type: String, default: '480px' } });
defineEmits(['close']);
</script>

<style>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 850;
  background: rgba(1, 4, 9, 0.6);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
}
.modal {
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border-2);
  border-radius: 14px;
  box-shadow: var(--shadow);
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px 20px;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  font-size: 15px;
}
.modal-head > svg {
  width: 18px;
  color: var(--accent-2);
}
.modal-body {
  padding: 18px 20px;
  overflow: auto;
  line-height: 1.6;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}
</style>

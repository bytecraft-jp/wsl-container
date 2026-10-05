<template>
  <Modal v-if="d" :title="d.title" @close="closeDialog(d.kind === 'confirm' ? false : null)">
    <template #icon>
      <TriangleAlert v-if="d.danger" style="color: var(--red)" />
      <MessageSquare v-else />
    </template>
    <p v-if="d.message" class="msg selectable">{{ d.message }}</p>
    <label v-if="d.kind === 'prompt'" class="field">
      {{ d.label }}
      <select v-if="d.options" v-model="value" class="input" ref="inp">
        <option v-for="o in d.options" :key="o.value ?? o" :value="o.value ?? o">{{ o.label ?? o }}</option>
      </select>
      <input
        v-else
        ref="inp"
        v-model="value"
        class="input"
        :placeholder="d.placeholder"
        @keydown.enter="closeDialog(value)"
      />
    </label>
    <template #footer>
      <button class="btn" @click="closeDialog(d.kind === 'confirm' ? false : null)">キャンセル</button>
      <button
        ref="okBtn"
        class="btn"
        :class="d.danger ? 'danger' : 'primary'"
        @click="closeDialog(d.kind === 'confirm' ? true : value)"
      >
        {{ d.okText }}
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { TriangleAlert, MessageSquare } from '@lucide/vue';
import Modal from './Modal.vue';
import { state, closeDialog } from '../lib/store.js';

const d = computed(() => state.dialog);
const value = ref('');
const inp = ref(null);
const okBtn = ref(null);

watch(d, async (v) => {
  if (!v) return;
  value.value = v.value ?? (v.options ? v.options[0]?.value ?? v.options[0] : '');
  await nextTick();
  if (inp.value) {
    inp.value.focus();
    inp.value.select?.();
  } else okBtn.value?.focus();
});
</script>

<style scoped>
.msg {
  margin: 0 0 12px;
  white-space: pre-wrap;
  color: var(--text-2);
}
</style>

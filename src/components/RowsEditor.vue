<template>
  <div class="rows">
    <div v-for="(row, i) in modelValue" :key="i" class="row-line">
      <template v-for="c in columns" :key="c.key">
        <input
          v-if="c.type !== 'select' && c.type !== 'check'"
          v-model="row[c.key]"
          class="input mono"
          :style="{ flex: c.flex || 1 }"
          :placeholder="c.placeholder"
          :list="c.list"
        />
        <select v-else-if="c.type === 'select'" v-model="row[c.key]" class="input" :style="{ flex: c.flex || 0.5 }">
          <option v-for="o in c.options" :key="o" :value="o">{{ o }}</option>
        </select>
        <label v-else class="check small" :title="c.placeholder"><input v-model="row[c.key]" type="checkbox" />{{ c.label }}</label>
      </template>
      <button v-if="browse" class="btn icon sm" title="フォルダーを選択" @click="$emit('browse', row)"><FolderOpen /></button>
      <button class="btn ghost icon sm" title="削除" @click="remove(i)"><X /></button>
    </div>
    <button class="btn ghost sm add" @click="add"><Plus />{{ addLabel }}</button>
  </div>
</template>

<script setup>
import { Plus, X, FolderOpen } from '@lucide/vue';

const props = defineProps({
  modelValue: { type: Array, required: true },
  columns: { type: Array, required: true },
  addLabel: { type: String, default: '追加' },
  browse: Boolean,
});
defineEmits(['browse']);

function add() {
  const row = {};
  props.columns.forEach((c) => (row[c.key] = c.default ?? (c.type === 'check' ? false : '')));
  props.modelValue.push(row);
}
function remove(i) {
  props.modelValue.splice(i, 1);
}
</script>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row-line {
  min-width: 0;
  display: flex;
  gap: 6px;
  align-items: center;
}
.add {
  align-self: flex-start;
  color: var(--accent-2);
}
</style>

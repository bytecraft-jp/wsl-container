<template>
  <div ref="host" class="code-editor"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'yaml' },
  readonly: Boolean,
});
const emit = defineEmits(['update:modelValue', 'save']);

const host = ref(null);
let view = null;
let applying = false; // プロパティからの反映中は update を送らない
const ro = new Compartment();

onMounted(() => {
  const lang = props.language === 'yaml' ? [yaml()] : [];
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        oneDark,
        ...lang,
        keymap.of([
          indentWithTab,
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              emit('save');
              return true;
            },
          },
        ]),
        ro.of(EditorState.readOnly.of(props.readonly)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applying) emit('update:modelValue', u.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'var(--bg-2)' },
          '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6', overflow: 'auto' },
          '.cm-gutters': { backgroundColor: 'var(--bg-2)', borderRight: '1px solid var(--border)' },
        }),
      ],
    }),
  });
});

watch(
  () => props.modelValue,
  (v) => {
    if (view && v !== view.state.doc.toString()) {
      applying = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
      } finally {
        applying = false;
      }
    }
  },
);
watch(
  () => props.readonly,
  (v) => view?.dispatch({ effects: ro.reconfigure(EditorState.readOnly.of(v)) }),
);

onBeforeUnmount(() => view?.destroy());
</script>

<style scoped>
.code-editor {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  user-select: text;
}
.code-editor :deep(.cm-editor) {
  height: 100%;
}
.code-editor :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>

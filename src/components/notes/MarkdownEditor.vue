<script setup lang="ts">
// The note editor: markdown source on the left, the rendering on the right.
//
// The source of truth is the text in the textarea — always. The preview is a
// derived view of it, never an input, which is what keeps the stored note plain
// markdown and makes every transform in the toolbar a pure string operation.
//
// The rendering is debounced and memoised on the source string, so holding a
// key down does not re-parse a 200-line note on every character (acceptance 84).
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { useMarkdownEditor, type EditorAction } from '@/composables/useMarkdownEditor'
import { useMarkdownPaste } from '@/composables/useMarkdownPaste'
import { NOTE_EDITOR_MODES, type NoteEditorMode } from '@/utils/notes'
import MarkdownView from '@/components/notes/MarkdownView.vue'

const props = withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; autofocus?: boolean }>(),
  { placeholder: 'Write in markdown — paste anything', autofocus: false },
)
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const app = useAppStore()
const { noteEditorMode } = storeToRefs(app)
const { c, isMobile } = useStyles()

const area = ref<HTMLTextAreaElement | null>(null)

// The mode the user chose, narrowed by what the viewport can actually show —
// a split view on a phone is two useless columns, so it reads as edit there.
const mode = computed<NoteEditorMode>(() =>
  isMobile.value && noteEditorMode.value === 'split' ? 'edit' : noteEditorMode.value,
)
const showSource = computed(() => mode.value !== 'preview')
const showPreview = computed(() => mode.value !== 'edit')

function setMode(next: NoteEditorMode) {
  app.setNoteEditorMode(next)
}

function value(): string {
  return props.modelValue ?? ''
}

const editor = useMarkdownEditor({
  el: area,
  getValue: value,
  setValue: (next) => emit('update:modelValue', next),
})

const { onPaste } = useMarkdownPaste({
  el: area,
  getValue: value,
  setValue: (next) => emit('update:modelValue', next),
  notify: (message, undo, actionLabel) => app.showToastWithUndo(message, undo, 8000, actionLabel),
})

// --- debounced, memoised preview -------------------------------------------
// shallowRef because the value is a plain string that is replaced wholesale;
// there is nothing here for a deep reactive proxy to earn.
const previewSource = shallowRef(value())
let renderTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.modelValue,
  (next) => {
    if (!showPreview.value) return
    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      previewSource.value = next ?? ''
    }, 120)
  },
)
// Switching into a preview mode shows the current text immediately rather than
// whatever the debounce last settled on.
watch(showPreview, (on) => {
  if (on) previewSource.value = value()
})
onBeforeUnmount(() => clearTimeout(renderTimer))

function onKeydown(event: KeyboardEvent) {
  // ⌘↵ / Ctrl+↵ finishes the note, as it did in the old editor.
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    emit('save')
    return
  }
  editor.onKeydown(event)
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  editor.onInput(event)
}

function focus() {
  area.value?.focus()
}
defineExpose({ focus })

watch(
  () => props.autofocus,
  (on) => {
    if (on) focus()
  },
  { immediate: true },
)

// --- toolbar ----------------------------------------------------------------
interface ToolbarItem {
  action: EditorAction
  label: string
  title: string
}
const TOOLS: ToolbarItem[] = [
  { action: 'bold', label: 'B', title: 'Bold (Ctrl+B)' },
  { action: 'italic', label: 'I', title: 'Italic (Ctrl+I)' },
  { action: 'strike', label: 'S', title: 'Strikethrough (Ctrl+Shift+X)' },
  { action: 'code', label: '‹›', title: 'Code (Ctrl+E)' },
  { action: 'link', label: '🔗', title: 'Link (Ctrl+K)' },
  { action: 'h1', label: 'H1', title: 'Heading 1 (Ctrl+1)' },
  { action: 'h2', label: 'H2', title: 'Heading 2 (Ctrl+2)' },
  { action: 'h3', label: 'H3', title: 'Heading 3 (Ctrl+3)' },
  { action: 'bullet', label: '•', title: 'List (Ctrl+Shift+8)' },
  { action: 'checklist', label: '☑', title: 'Checklist (Ctrl+Shift+9)' },
  { action: 'ordered', label: '1.', title: 'Numbered list' },
  { action: 'quote', label: '❝', title: 'Quote (Ctrl+Shift+.)' },
  { action: 'fence', label: '{ }', title: 'Code block' },
  { action: 'table', label: '▦', title: 'Table' },
]

const MODE_LABEL: Record<NoteEditorMode, string> = {
  edit: 'Edit',
  preview: 'Preview',
  split: 'Split',
}

// --- styles -----------------------------------------------------------------
const wrap = computed(() =>
  pxify({ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, flex: 1 }),
)
const bar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flexWrap: 'wrap',
    padding: 4,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
const toolBtn = computed(() =>
  pxify({
    minWidth: 30,
    height: 28,
    padding: '0 7px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'transparent',
    color: c.value.text,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  }),
)
const toolHover = computed(() => ({ background: c.value.card, borderColor: c.value.border }))
const spacer = pxify({ flex: 1 })
const modeBtn = (active: boolean) =>
  pxify({
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid ' + (active ? c.value.accent : 'transparent'),
    background: active ? c.value.card : 'transparent',
    color: active ? c.value.accent : c.value.dim,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  })
const panes = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns: mode.value === 'split' ? '1fr 1fr' : '1fr',
    gap: 10,
    flex: 1,
    minHeight: 0,
  }),
)
const textareaStyle = computed(() =>
  pxify({
    width: '100%',
    minHeight: isMobile.value ? 220 : 300,
    resize: 'vertical',
    padding: 12,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    color: c.value.text,
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.6,
    tabSize: 2,
    outline: 'none',
  }),
)
const previewStyle = computed(() =>
  pxify({
    minHeight: isMobile.value ? 220 : 300,
    maxHeight: '60vh',
    overflowY: 'auto',
    padding: 12,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.glass,
  }),
)
</script>

<template>
  <div :style="wrap">
    <div :style="bar">
      <button
        v-for="tool in TOOLS"
        :key="tool.action"
        type="button"
        :style="toolBtn"
        v-hover-style="toolHover"
        :title="tool.title"
        :aria-label="tool.title"
        @mousedown.prevent
        @click="editor.apply(tool.action)"
      >
        {{ tool.label }}
      </button>
      <span :style="spacer"></span>
      <button
        v-for="m in NOTE_EDITOR_MODES"
        :key="m"
        type="button"
        :style="modeBtn(noteEditorMode === m)"
        :aria-pressed="noteEditorMode === m"
        @click="setMode(m)"
      >
        {{ MODE_LABEL[m] }}
      </button>
    </div>

    <div :style="panes">
      <textarea
        v-if="showSource"
        ref="area"
        :value="modelValue"
        :placeholder="placeholder"
        :style="textareaStyle"
        spellcheck="true"
        aria-label="Note source"
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
      ></textarea>
      <MarkdownView v-if="showPreview" :source="previewSource" :style="previewStyle" />
    </div>
  </div>
</template>

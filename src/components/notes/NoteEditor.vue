<script setup lang="ts">
// The note editor: markdown source on the left, the rendering on the right.
//
// One component for every surface that writes a note — the notes view, the
// detail dialog's note column, and the draft note inside a create dialog
// (section 22d). Only `compact` differs between them. A second editor "for
// dialogs" would be a second set of keyboard shortcuts, a second paste path and
// a second place for the toolbar to drift, which is exactly what this file
// exists to prevent.
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
import { pxify, typeStep } from '@/styles'
import { useMarkdownEditor, type EditorAction } from '@/composables/useMarkdownEditor'
import { useMarkdownPaste } from '@/composables/useMarkdownPaste'
import { useAutoResizeTextarea } from '@/composables/useAutoResizeTextarea'
import {
  COMPACT_MAX_HEIGHT,
  COMPACT_MIN_HEIGHT,
  editorModes,
  effectiveMode,
  splitTools,
} from '@/utils/noteTools'
import type { NoteEditorMode } from '@/utils/notes'
import MarkdownView from '@/components/notes/MarkdownView.vue'
import Dropdown from '@/components/ui/Dropdown.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    autofocus?: boolean
    // Set where the editor is already inside a column (the note extension,
    // section 21b). A split view inside half a dialog is two columns of about
    // twenty characters each.
    narrow?: boolean
    // Set inside a dialog (section 22d): one row of toolbar, no Split, and a
    // writing area that stops growing before it pushes the footer away.
    compact?: boolean
  }>(),
  {
    placeholder: 'Write in markdown — paste anything',
    autofocus: false,
    narrow: false,
    compact: false,
  },
)
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const app = useAppStore()
const { noteEditorMode } = storeToRefs(app)
const { c, isMobile } = useStyles()

const area = ref<HTMLTextAreaElement | null>(null)
// Compact mode grows the field with its content instead of sitting at a fixed
// 300px, so a two-line note is not a wall of empty box. The cap is CSS, so past
// it the field scrolls rather than the dialog (section 22d).
const auto = useAutoResizeTextarea({
  watch: () => (props.compact ? props.modelValue : null),
  minHeight: COMPACT_MIN_HEIGHT,
})
// One element, two refs: the editing commands need it and so does the measure.
function setArea(el: unknown) {
  const node = (el as HTMLTextAreaElement | null) ?? null
  area.value = node
  auto.el.value = props.compact ? node : null
}

// The mode the user chose, narrowed by what the surface can actually show. In
// compact mode the choice is local — a Preview toggle inside a dialog must not
// rewrite the preference the notes view opens with.
const compactMode = ref<NoteEditorMode>('edit')
const chosen = computed<NoteEditorMode>(() =>
  props.compact ? compactMode.value : noteEditorMode.value,
)
const mode = computed<NoteEditorMode>(() =>
  effectiveMode(chosen.value, {
    compact: props.compact,
    narrow: props.narrow,
    mobile: isMobile.value,
  }),
)
const showSource = computed(() => mode.value !== 'preview')
const showPreview = computed(() => mode.value !== 'edit')

const modes = computed(() => editorModes(props.compact))
const tools = computed(() => splitTools(props.compact))
const overflowItems = computed(() =>
  tools.value.overflow.map((tool) => ({ value: tool.action, label: tool.title })),
)

function onOverflow(action: string) {
  editor.apply(action as EditorAction)
}

function setMode(next: NoteEditorMode) {
  if (props.compact) compactMode.value = next
  else app.setNoteEditorMode(next)
}
// The compact bar carries one toggle rather than two radio-ish buttons: there
// are only two states, and a toggle says which one you are in.
function togglePreview() {
  setMode(compactMode.value === 'preview' ? 'edit' : 'preview')
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
  if (props.compact) auto.onInput()
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

const MODE_LABEL: Record<NoteEditorMode, string> = {
  edit: 'Edit',
  preview: 'Preview',
  split: 'Split',
}

// --- styles -----------------------------------------------------------------
const wrap = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    minWidth: 0,
    minHeight: 0,
    flex: 1,
  }),
)
const bar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    // One row in a dialog: the overflow menu is what the wrap used to be.
    flexWrap: props.compact ? 'nowrap' : 'wrap',
    minWidth: 0,
    padding: 4,
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
const toolBtn = computed(() =>
  pxify({
    minWidth: 30,
    height: 28,
    padding: '0 7px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid transparent',
    background: 'transparent',
    color: c.value.text,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  }),
)
const toolHover = computed(() => ({ background: c.value.card, borderColor: c.value.border }))
const spacer = pxify({ flex: 1, minWidth: 0 })
const modeBtn = (active: boolean) =>
  pxify({
    padding: '4px 10px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + (active ? c.value.accent : 'transparent'),
    background: active ? c.value.card : 'transparent',
    color: active ? c.value.accent : c.value.dim,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  })
const panes = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns:
      mode.value === 'split' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
    gap: 'var(--sp-3)',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  }),
)
const textareaStyle = computed(() =>
  pxify({
    width: '100%',
    minHeight: props.compact ? COMPACT_MIN_HEIGHT : isMobile.value ? 220 : 300,
    // Compact grows to the cap and then scrolls inside itself; the full editor
    // stays hand-resizable as it always was.
    maxHeight: props.compact ? COMPACT_MAX_HEIGHT : undefined,
    overflowY: props.compact ? 'auto' : undefined,
    resize: props.compact ? 'none' : 'vertical',
    padding: 12,
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    color: c.value.text,
    fontFamily: 'inherit',
    ...typeStep('sm'),
    lineHeight: 1.6,
    tabSize: 2,
    outline: 'none',
  }),
)
const previewStyle = computed(() =>
  pxify({
    minHeight: props.compact ? COMPACT_MIN_HEIGHT : isMobile.value ? 220 : 300,
    maxHeight: props.compact ? COMPACT_MAX_HEIGHT : '60vh',
    overflowY: 'auto',
    padding: 12,
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.glass,
  }),
)
</script>

<template>
  <div :style="wrap">
    <div :style="bar">
      <button
        v-for="tool in tools.primary"
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

      <!-- Everything the compact bar could not fit, still reachable. -->
      <Dropdown
        v-if="tools.overflow.length"
        label="⋯"
        :items="overflowItems"
        @select="onOverflow"
      />

      <span :style="spacer"></span>

      <button
        v-if="compact"
        type="button"
        :style="modeBtn(mode === 'preview')"
        :aria-pressed="mode === 'preview'"
        @click="togglePreview"
      >
        Preview
      </button>
      <template v-else>
        <button
          v-for="m in modes"
          :key="m"
          type="button"
          :style="modeBtn(noteEditorMode === m)"
          :aria-pressed="noteEditorMode === m"
          @click="setMode(m)"
        >
          {{ MODE_LABEL[m] }}
        </button>
      </template>
    </div>

    <div :style="panes">
      <textarea
        v-if="showSource"
        :ref="setArea"
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

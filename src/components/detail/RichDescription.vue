<script setup lang="ts">
// Rich text for a todo's description and a task's notes in the detail panes.
//
// Reads as formatted, sanitised HTML; double-click opens the same WYSIWYG
// surface the notes use (RichEditor: "/" for headings, lists, checklists,
// quotes, code; select text for bold / italic / link). Clicking away, Ctrl+Enter
// or Done saves; Escape cancels. Values saved before this existed are plain
// text — richHtml() escapes them and keeps their line breaks, so they open in
// the editor as paragraphs rather than as one run-on line.
import { computed, nextTick, ref } from 'vue'
import RichEditor from '@/components/RichEditor.vue'
import { useStyles } from '@/composables/useStyles'
import { useDetailStyles } from '@/composables/useDetailStyles'
import { richHtml, richIsEmpty } from '@/utils/richText'
import { pxify } from '@/styles'

const props = withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; emptyText?: string }>(),
  {
    placeholder: 'Write… type / for headings, lists and checklists',
    emptyText: 'Nothing here yet — double-click to write.',
  },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { s } = useStyles()
const { placeholder: emptyStyle, row, spacer, dimSmall, addBtn } = useDetailStyles()

const wrap = ref<HTMLElement | null>(null)
const editor = ref<InstanceType<typeof RichEditor> | null>(null)
const editing = ref(false)
const draft = ref('')
const html = computed(() => richHtml(props.modelValue))

function start() {
  draft.value = html.value
  editing.value = true
  nextTick(() => editor.value?.focus())
}
function save() {
  if (!editing.value) return
  editing.value = false
  const next = richIsEmpty(draft.value) ? '' : draft.value
  if (next !== props.modelValue) emit('update:modelValue', next)
}
function cancel() {
  editing.value = false
}
// Focus can leave the editor for a moment without the user leaving it — the
// link bubble opens a prompt, a slash command re-focuses — so wait a beat and
// save only if focus has really gone somewhere outside this field.
function onFocusOut() {
  if (!editing.value) return
  setTimeout(() => {
    const active = document.activeElement
    if (editing.value && !(active && wrap.value?.contains(active))) save()
  }, 150)
}
function onKeydown(e: KeyboardEvent) {
  if (editing.value && e.key === 'Escape') {
    e.stopPropagation()
    cancel()
  }
}

const viewStyle = computed(() => pxify({ ...s.value.noteRendered, cursor: 'text' }))
</script>

<template>
  <div ref="wrap" class="rdesc" @focusout="onFocusOut" @keydown="onKeydown">
    <template v-if="editing">
      <RichEditor ref="editor" v-model="draft" :placeholder="placeholder" @save="save" />
      <div :style="[row, { marginTop: 'var(--sp-2)' }]">
        <span :style="dimSmall"
          >/ for blocks · select text to format · Ctrl+Enter saves · Esc cancels</span
        >
        <span :style="spacer"></span>
        <button type="button" :style="addBtn" @mousedown.prevent @click="save">Done</button>
      </div>
    </template>
    <!-- eslint-disable-next-line vue/no-v-html -- richHtml() sanitises (or escapes plain text) -->
    <div
      v-else-if="html"
      class="rich"
      :style="viewStyle"
      title="Double-click to edit"
      @dblclick="start"
      v-html="html"
    ></div>
    <div v-else :style="emptyStyle" @dblclick="start">{{ emptyText }}</div>
  </div>
</template>

<style scoped>
.rdesc {
  min-width: 0;
}
</style>

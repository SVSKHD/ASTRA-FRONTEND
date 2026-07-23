<script setup lang="ts">
// A WYSIWYG editor over a contentEditable. document.execCommand is deprecated
// but is still the only way to get formatting, lists and undo for free without
// pulling a 100kB editor into a 4-dependency app — and every browser we target
// still implements it. The value flows in once (binding v-html reactively would
// reset the caret on every keystroke) and back out on input.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

const props = withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; autofocus?: boolean }>(),
  { placeholder: 'Write something…', autofocus: false },
)
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const { c, s, isMobile } = useStyles()
const editorRef = ref<HTMLDivElement | null>(null)
// Which of bold/italic/… apply at the caret, so the toolbar shows state rather
// than being twelve identical buttons.
const activeCmds = ref<Record<string, boolean>>({})

function seed(html: string) {
  if (editorRef.value && editorRef.value.innerHTML !== html) editorRef.value.innerHTML = html || ''
}
onMounted(() => {
  seed(props.modelValue)
  if (props.autofocus) nextTick(() => placeCaretAtEnd())
  refreshActive()
})
// Only re-seed when the value changed from the outside (a different note opened),
// never from our own emit — that would fight the caret.
watch(
  () => props.modelValue,
  (v) => {
    if (editorRef.value && editorRef.value.innerHTML !== v) seed(v)
  },
)

function placeCaretAtEnd() {
  const el = editorRef.value
  if (!el) return
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function sync() {
  if (editorRef.value) emit('update:modelValue', editorRef.value.innerHTML)
  refreshActive()
}
function refreshActive() {
  if (typeof document.queryCommandState !== 'function') return
  const next: Record<string, boolean> = {}
  for (const cmd of ['bold', 'italic', 'underline', 'strikeThrough']) {
    try {
      next[cmd] = document.queryCommandState(cmd)
    } catch {
      next[cmd] = false
    }
  }
  activeCmds.value = next
}

function exec(cmd: string, val?: string) {
  editorRef.value?.focus()
  document.execCommand(cmd, false, val)
  sync()
}
function insert(html: string) {
  editorRef.value?.focus()
  document.execCommand('insertHTML', false, html)
  sync()
}
function toggleBlock(tag: string) {
  // Second press on the same heading returns the block to a paragraph, so the
  // heading buttons behave like the inline toggles next to them.
  const current = (document.queryCommandValue?.('formatBlock') || '').toString().toLowerCase()
  exec('formatBlock', current === tag.toLowerCase() ? 'P' : tag)
}
function cmdLink() {
  const url = window.prompt('Link URL:', 'https://')
  if (!url) return
  exec('createLink', url)
}
function cmdCode() {
  const sel = window.getSelection()?.toString() || 'code'
  insert(
    '<code style="background:rgba(127,127,127,.22);padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace">' +
      escapeHtml(sel) +
      '</code>&nbsp;',
  )
}
function cmdChecklist() {
  insert(
    '<div style="display:flex;align-items:flex-start;gap:8px;margin:3px 0">' +
      '<input type="checkbox" style="margin-top:4px"><span>&nbsp;</span></div>',
  )
}
function cmdHighlight() {
  editorRef.value?.focus()
  const col = c.value.accent
  if (!document.execCommand('hiliteColor', false, col))
    document.execCommand('backColor', false, col)
  sync()
}
function escapeHtml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Ticking a box in the editor is a DOM mutation, not an input event, so catch
// it on click and write the attribute through before syncing.
function onClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    if (el.checked) el.setAttribute('checked', 'checked')
    else el.removeAttribute('checked')
    sync()
  }
}
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    emit('save')
    return
  }
  // Escape belongs to whoever owns the dialog; do not swallow it here.
  if (e.key === 'Escape') return
  e.stopPropagation()
}
// Paste as text: pasted markup from a web page brings fonts and colours that
// fight every theme.
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain')
  if (text == null) return
  e.preventDefault()
  insert(escapeHtml(text).replace(/\n/g, '<br>'))
}

type Tool = { label: string; title: string; fn: () => void; cmd?: string; group?: boolean }
const TOOLS: Tool[] = [
  { label: '<b>B</b>', title: 'Bold (Ctrl+B)', cmd: 'bold', fn: () => exec('bold') },
  { label: '<i>I</i>', title: 'Italic (Ctrl+I)', cmd: 'italic', fn: () => exec('italic') },
  { label: '<u>U</u>', title: 'Underline', cmd: 'underline', fn: () => exec('underline') },
  {
    label: '<s>S</s>',
    title: 'Strikethrough',
    cmd: 'strikeThrough',
    fn: () => exec('strikeThrough'),
  },
  { label: 'H1', title: 'Heading 1', fn: () => toggleBlock('H1'), group: true },
  { label: 'H2', title: 'Heading 2', fn: () => toggleBlock('H2') },
  { label: 'H3', title: 'Heading 3', fn: () => toggleBlock('H3') },
  { label: '❝', title: 'Quote', fn: () => toggleBlock('BLOCKQUOTE') },
  { label: '•', title: 'Bulleted list', fn: () => exec('insertUnorderedList'), group: true },
  { label: '1.', title: 'Numbered list', fn: () => exec('insertOrderedList') },
  { label: '☑', title: 'Checklist item', fn: cmdChecklist },
  { label: '🔗', title: 'Link', fn: cmdLink, group: true },
  { label: '&lt;/&gt;', title: 'Inline code', fn: cmdCode },
  { label: '▨', title: 'Highlight', fn: cmdHighlight },
  { label: '—', title: 'Divider', fn: () => insert('<hr>') },
  { label: '⌫', title: 'Clear formatting', fn: () => exec('removeFormat'), group: true },
  { label: '↶', title: 'Undo', fn: () => exec('undo') },
  { label: '↷', title: 'Redo', fn: () => exec('redo') },
]

function toolStyle(t: Tool) {
  const on = t.cmd ? activeCmds.value[t.cmd] : false
  return pxify({
    minWidth: isMobile.value ? 30 : 28,
    fontSize: 11,
    padding: '6px 8px',
    borderRadius: 9,
    border: '1px solid ' + (on ? c.value.accent : c.value.border),
    background: on ? c.value.input : 'transparent',
    color: on ? c.value.accent : c.value.text,
    cursor: 'pointer',
    fontWeight: 600,
    lineHeight: 1.1,
    transition: 'background .2s ease, color .2s ease, border-color .2s ease',
  })
}
// A thin rule before the buttons that start a new group.
function wrapStyle(t: Tool) {
  return pxify(
    t.group
      ? {
          display: 'inline-flex',
          paddingLeft: 6,
          marginLeft: 3,
          borderLeft: '1px solid ' + c.value.border,
        }
      : { display: 'inline-flex' },
  )
}
const editorStyle = computed(() => s.value.editorArea)

defineExpose({ focus: placeCaretAtEnd })
</script>

<template>
  <div :style="s.toolbar">
    <span v-for="t in TOOLS" :key="t.title" :style="wrapStyle(t)">
      <button
        :style="toolStyle(t)"
        :title="t.title"
        :aria-label="t.title"
        type="button"
        @mousedown.prevent
        @click="t.fn()"
        v-html="t.label"
      ></button>
    </span>
  </div>
  <div
    ref="editorRef"
    class="rich rich-editor"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    :data-placeholder="placeholder"
    :style="editorStyle"
    @input="sync"
    @click="onClick"
    @keyup="refreshActive"
    @mouseup="refreshActive"
    @keydown="onKeydown"
    @paste="onPaste"
  ></div>
</template>

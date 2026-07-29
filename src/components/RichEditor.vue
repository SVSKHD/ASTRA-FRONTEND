<script setup lang="ts">
// A Notion-style writing surface over a contentEditable — no toolbar. All
// formatting is inline: type "/" to open a floating command menu, or use
// markdown shortcuts (`# `, `- `, `> `, `**bold**`, …) that convert as you type.
// Selecting text raises a minimal bubble (bold / italic / link). Content is
// plain HTML, styled by the shared `.rich` rules, so what you write is what the
// reader shows. document.execCommand is deprecated but remains the only
// dependency-free way to get formatting, lists and undo in every browser we
// target — the same trade-off the toolbar version made.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { filterCommands, type BlockKind, type SlashCommand } from '@/utils/editorCommands'

const props = withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; autofocus?: boolean }>(),
  { placeholder: 'Type / for commands…', autofocus: false },
)
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const { c } = useStyles()
const editorRef = ref<HTMLDivElement | null>(null)

// --- value in / out ---------------------------------------------------------
function seed(html: string) {
  if (editorRef.value && editorRef.value.innerHTML !== html) editorRef.value.innerHTML = html || ''
}
onMounted(() => {
  seed(props.modelValue)
  if (props.autofocus) nextTick(() => placeCaretAtEnd())
  document.addEventListener('selectionchange', onSelectionChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
})
// Only re-seed when the value changed from outside (a different note opened),
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
}
function escapeHtml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function exec(cmd: string, val?: string) {
  editorRef.value?.focus()
  document.execCommand(cmd, false, val)
}
function insertHtml(html: string) {
  editorRef.value?.focus()
  document.execCommand('insertHTML', false, html)
}

// --- block actions the slash menu / markdown share --------------------------
function applyBlock(tag: string) {
  exec('formatBlock', tag)
}
function insertChecklist() {
  insertHtml(
    '<div style="display:flex;align-items:flex-start;gap:8px;margin:3px 0">' +
      '<input type="checkbox" style="margin-top:4px"><span>&nbsp;</span></div>',
  )
}
function insertDivider() {
  insertHtml('<hr><p><br></p>')
}
function insertCodeBlock() {
  // formatBlock PRE turns the current line into a code block; the shared `.rich`
  // rules give it its monospace card.
  applyBlock('PRE')
}
const BLOCK_ACTIONS: Record<BlockKind, () => void> = {
  heading1: () => applyBlock('H1'),
  heading2: () => applyBlock('H2'),
  heading3: () => applyBlock('H3'),
  paragraph: () => applyBlock('P'),
  bullet: () => exec('insertUnorderedList'),
  numbered: () => exec('insertOrderedList'),
  todo: insertChecklist,
  quote: () => applyBlock('BLOCKQUOTE'),
  divider: insertDivider,
  code: insertCodeBlock,
}

// --- slash command menu -----------------------------------------------------
const slash = ref<{ node: Text; start: number; query: string } | null>(null)
const menuOpen = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuIndex = ref(0)
const results = computed<SlashCommand[]>(() => filterCommands(slash.value?.query ?? ''))

function closeMenu() {
  menuOpen.value = false
  slash.value = null
  menuIndex.value = 0
}

// Detect a "/query" being typed at a block start or after whitespace, and open
// the menu positioned at the caret.
function detectSlash() {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return closeMenu()
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return closeMenu()
  if (!editorRef.value || !editorRef.value.contains(node)) return closeMenu()
  const text = node.textContent || ''
  const caret = range.startOffset
  const before = text.slice(0, caret)
  // Slash at the very start of the text, or after a space — followed only by
  // letters/digits up to the caret.
  const m = before.match(/(^|\s)\/([\p{L}\d]*)$/u)
  if (!m) return closeMenu()
  const slashIndex = caret - (m[2].length + 1)
  slash.value = { node: node as Text, start: slashIndex, query: m[2] }
  menuIndex.value = 0
  positionMenu(range)
  menuOpen.value = true
}
function positionMenu(range: Range) {
  const rect = range.getBoundingClientRect()
  const host = editorRef.value?.getBoundingClientRect()
  const x = rect.left || host?.left || 0
  const y = (rect.bottom || host?.bottom || 0) + 6
  menuPos.value = { x, y }
}
// Remove the typed "/query" so the command acts on a clean line, then run it.
function runCommand(cmd: SlashCommand) {
  const s = slash.value
  editorRef.value?.focus()
  if (s) {
    const end = s.start + 1 + s.query.length
    const range = document.createRange()
    try {
      range.setStart(s.node, Math.max(0, s.start))
      range.setEnd(s.node, Math.min(end, (s.node.textContent || '').length))
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.execCommand('delete')
    } catch {
      /* the node changed under us; run against the live caret instead */
    }
  }
  closeMenu()
  BLOCK_ACTIONS[cmd.id]()
  sync()
}
function moveMenu(delta: number) {
  const n = results.value.length
  if (!n) return
  menuIndex.value = (menuIndex.value + delta + n) % n
}

// --- markdown shortcuts -----------------------------------------------------
// Line-start markers convert on the space that follows them.
const LINE_MARKERS: { re: RegExp; run: () => void }[] = [
  { re: /^#$/, run: () => applyBlock('H1') },
  { re: /^##$/, run: () => applyBlock('H2') },
  { re: /^###$/, run: () => applyBlock('H3') },
  { re: /^-$/, run: () => exec('insertUnorderedList') },
  { re: /^\*$/, run: () => exec('insertUnorderedList') },
  { re: /^1\.$/, run: () => exec('insertOrderedList') },
  { re: /^>$/, run: () => applyBlock('BLOCKQUOTE') },
  { re: /^\[\]$/, run: insertChecklist },
  { re: /^\[ \]$/, run: insertChecklist },
]
// Returns true if it consumed the space (converted a line marker).
function handleLineMarkerSpace(): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return false
  const text = node.textContent || ''
  const caret = range.startOffset
  const before = text.slice(0, caret)
  const match = LINE_MARKERS.find((m) => m.re.test(before))
  if (!match) return false
  // Delete the marker characters, then apply the block.
  const del = document.createRange()
  del.setStart(node, 0)
  del.setEnd(node, caret)
  sel.removeAllRanges()
  sel.addRange(del)
  document.execCommand('delete')
  match.run()
  sync()
  return true
}
// Inline **bold**, *italic*, `code` convert when the closing delimiter lands.
const INLINE_RULES: { re: RegExp; tag: string }[] = [
  { re: /\*\*([^*\n]+)\*\*$/, tag: 'strong' },
  { re: /(?:^|[^*])\*([^*\n]+)\*$/, tag: 'em' },
  { re: /`([^`\n]+)`$/, tag: 'code' },
]
function handleInlineMarkdown() {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return
  const text = node.textContent || ''
  const caret = range.startOffset
  const before = text.slice(0, caret)
  for (const rule of INLINE_RULES) {
    const m = before.match(rule.re)
    if (!m) continue
    const inner = m[1]
    // The full delimited token (e.g. "**x**"); for italic the leading char that
    // guards against ** is outside the capture, so measure from the second `*`.
    const token = rule.tag === 'em' ? '*' + inner + '*' : m[0]
    const startIdx = caret - token.length
    if (startIdx < 0) continue
    const del = document.createRange()
    del.setStart(node, startIdx)
    del.setEnd(node, caret)
    sel.removeAllRanges()
    sel.addRange(del)
    document.execCommand('delete')
    // Insert the styled run, then a zero-width space outside it so typing
    // continues in plain text rather than inheriting the format.
    const open = rule.tag === 'code' ? codeOpen() : '<' + rule.tag + '>'
    const close = rule.tag === 'code' ? '</code>' : '</' + rule.tag + '>'
    insertHtml(open + escapeHtml(inner) + close + '​')
    sync()
    return
  }
}
function codeOpen() {
  return '<code style="background:rgba(127,127,127,.22);padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace">'
}

// --- selection bubble (bold / italic / link) --------------------------------
const bubbleOpen = ref(false)
const bubblePos = ref({ x: 0, y: 0 })
function onSelectionChange() {
  const el = editorRef.value
  const sel = window.getSelection()
  if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
    bubbleOpen.value = false
    return
  }
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) {
    bubbleOpen.value = false
    return
  }
  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) {
    bubbleOpen.value = false
    return
  }
  bubblePos.value = { x: rect.left + rect.width / 2, y: rect.top - 8 }
  bubbleOpen.value = true
}
function bubbleExec(cmd: 'bold' | 'italic') {
  exec(cmd)
  sync()
}
function bubbleLink() {
  const url = window.prompt('Link URL:', 'https://')
  if (!url) return
  exec('createLink', url)
  sync()
}

// --- input plumbing ---------------------------------------------------------
function onInput() {
  sync()
  detectSlash()
  handleInlineMarkdown()
}
function onKeydown(e: KeyboardEvent) {
  // The menu owns the arrow keys, Enter and Escape while it is open.
  if (menuOpen.value) {
    if (e.key === 'ArrowDown') return (e.preventDefault(), moveMenu(1))
    if (e.key === 'ArrowUp') return (e.preventDefault(), moveMenu(-1))
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const cmd = results.value[menuIndex.value]
      if (cmd) runCommand(cmd)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
      return
    }
  }
  if (e.key === ' ' && handleLineMarkerSpace()) {
    e.preventDefault()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    emit('save')
    return
  }
  // Escape belongs to whoever owns the dialog; do not swallow it here.
  if (e.key === 'Escape') return
  e.stopPropagation()
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
// Paste as text: pasted markup brings fonts and colours that fight every theme.
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain')
  if (text == null) return
  e.preventDefault()
  insertHtml(escapeHtml(text).replace(/\n/g, '<br>'))
  sync()
}
function onBlur() {
  // Let a click on the menu land before it closes.
  setTimeout(() => {
    if (!menuHovered.value) closeMenu()
    bubbleOpen.value = false
  }, 120)
}

// --- styles -----------------------------------------------------------------
const { s } = useStyles()
const editorStyle = computed(() => s.value.editorArea)
const menuHovered = ref(false)
const menuStyle = computed(() =>
  pxify({
    position: 'fixed',
    left: menuPos.value.x,
    top: menuPos.value.y,
    zIndex: 40,
    width: 250,
    maxHeight: 280,
    overflowY: 'auto',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 16,
    padding: 6,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }),
)
function itemStyle(active: boolean) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 11,
    cursor: 'pointer',
    background: active ? c.value.input : 'transparent',
    border: '1px solid ' + (active ? c.value.border : 'transparent'),
    textAlign: 'left',
    width: '100%',
  })
}
const itemLabel = computed(() =>
  pxify({ fontSize: 12.5, fontWeight: 600, color: c.value.text, lineHeight: 1.2 }),
)
const itemHint = computed(() => pxify({ fontSize: 10, color: c.value.dim, lineHeight: 1.2 }))
const itemGlyph = computed(() =>
  pxify({
    width: 30,
    height: 30,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.accent,
    fontSize: 12,
    fontWeight: 700,
  }),
)
const GLYPH: Record<BlockKind, string> = {
  heading1: 'H1',
  heading2: 'H2',
  heading3: 'H3',
  paragraph: '¶',
  bullet: '•',
  numbered: '1.',
  todo: '☑',
  quote: '❝',
  divider: '—',
  code: '</>',
}
const bubbleStyle = computed(() =>
  pxify({
    position: 'fixed',
    left: bubblePos.value.x,
    top: bubblePos.value.y,
    transform: 'translate(-50%, -100%)',
    zIndex: 41,
    display: 'flex',
    gap: 2,
    padding: 4,
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(24px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 12,
    boxShadow: c.value.shadow,
  }),
)
const bubbleBtn = computed(() =>
  pxify({
    minWidth: 30,
    height: 28,
    padding: '0 8px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: c.value.text,
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 700,
  }),
)

defineExpose({ focus: placeCaretAtEnd })
</script>

<template>
  <div
    ref="editorRef"
    class="rich rich-editor"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    :data-placeholder="placeholder"
    :style="editorStyle"
    @input="onInput"
    @click="onClick"
    @keydown="onKeydown"
    @paste="onPaste"
    @blur="onBlur"
  ></div>

  <!-- Floating slash-command menu, next to the caret. -->
  <Teleport to="body">
    <div
      v-if="menuOpen && results.length"
      :style="menuStyle"
      @mouseenter="menuHovered = true"
      @mouseleave="menuHovered = false"
      @mousedown.prevent
    >
      <button
        v-for="(cmd, i) in results"
        :key="cmd.id"
        :style="itemStyle(i === menuIndex)"
        @mousemove="menuIndex = i"
        @click="runCommand(cmd)"
      >
        <span :style="itemGlyph">{{ GLYPH[cmd.id] }}</span>
        <span style="display: flex; flex-direction: column; gap: 2px; min-width: 0">
          <span :style="itemLabel">{{ cmd.label }}</span>
          <span :style="itemHint">{{ cmd.hint }}</span>
        </span>
      </button>
    </div>

    <!-- Minimal selection bubble: bold / italic / link only. -->
    <div v-if="bubbleOpen" :style="bubbleStyle" @mousedown.prevent>
      <button :style="bubbleBtn" title="Bold" @click="bubbleExec('bold')"><b>B</b></button>
      <button :style="bubbleBtn" title="Italic" @click="bubbleExec('italic')"><i>I</i></button>
      <button :style="bubbleBtn" title="Link" @click="bubbleLink">🔗</button>
    </div>
  </Teleport>
</template>

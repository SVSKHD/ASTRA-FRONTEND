<script setup lang="ts">
// The trade book rules, edited where they are read.
//
// It replaced a markdown textarea with a toolbar and an Edit / Review switch,
// which made a five-line checklist into something to operate: select text, pick
// a button, flip to Review to see it, flip back to fix a typo. Here there is one
// surface. Every line is a block you type straight into, the boxes are real
// boxes you can tick while you write, and the kind of line is set by what you
// type at its start (`# `, `## `, `[] `, `- `) or from the row's menu — never by
// selecting text first.
//
// Keyboard, the way every block editor does it:
//   Enter        new line of the same kind (a heading starts a rule)
//   Enter on an empty rule / bullet       turns it into plain text
//   Backspace at the start               un-formats, then joins the line above
//   ↑ / ↓        move between lines;  Alt+↑ / Alt+↓  move the line itself
//   ⌘/Ctrl+Enter save now
//
// Each line is a `contenteditable="plaintext-only"` element, not a textarea:
// one line per block wraps and grows like text, and plaintext-only means a paste
// can never bring markup in with it. Its text is written by the `v-plain`
// directive only when it differs from the DOM, so typing is never re-rendered
// underneath the caret.
import { computed, nextTick, reactive, ref, watch, type Directive } from 'vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Dropdown, { type MenuItem } from '@/components/ui/Dropdown.vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'
import {
  detectShortcut,
  makeBlock,
  nextKind,
  parseLine,
  parseRules,
  serializeRules,
  type RuleBlock,
  type RuleKind,
} from '@/utils/ruleBlocks'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

// --- value in / out ---------------------------------------------------------
function fromSource(source: string): RuleBlock[] {
  const parsed = parseRules(source)
  return parsed.length ? parsed : [makeBlock('rule')]
}
const blocks = ref<RuleBlock[]>(fromSource(props.modelValue))
let lastEmitted = serializeRules(blocks.value)

// Only a change from outside (another device, a reload) re-reads the blocks;
// our own emit coming back round must not, or it would reset the caret.
watch(
  () => props.modelValue,
  (next) => {
    if (next === lastEmitted) return
    blocks.value = fromSource(next)
    lastEmitted = serializeRules(blocks.value)
    ticked.clear()
  },
)

function commit() {
  const md = serializeRules(blocks.value)
  if (md === lastEmitted) return
  lastEmitted = md
  emit('update:modelValue', md)
}

// --- the checklist ----------------------------------------------------------
// Ticks are held here and never saved: they are this trade's run through the
// list, and the next trade starts from a clean one.
const ticked = reactive(new Set<number>())
const rules = computed(() => blocks.value.filter((b) => b.kind === 'rule' && b.text.trim()))
const doneCount = computed(() => rules.value.filter((b) => ticked.has(b.id)).length)
const allClear = computed(() => rules.value.length > 0 && doneCount.value === rules.value.length)
function toggle(id: number, on: boolean) {
  if (on) ticked.add(id)
  else ticked.delete(id)
}
function resetTicks() {
  ticked.clear()
}

// --- elements and the caret -------------------------------------------------
const els = new Map<number, HTMLElement>()
function bindEl(id: number, el: unknown) {
  if (el instanceof HTMLElement) els.set(id, el)
  else els.delete(id)
}

const vPlain: Directive<HTMLElement, string> = {
  mounted(el, { value }) {
    el.textContent = value
  },
  updated(el, { value }) {
    if (el.textContent !== value) el.textContent = value
  },
}

function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return 0
  const before = document.createRange()
  before.selectNodeContents(el)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}
function selectionCollapsed(): boolean {
  return window.getSelection()?.isCollapsed ?? true
}
function placeCaret(el: HTMLElement, offset: number) {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const node = el.firstChild
  if (node && node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.max(0, Math.min(offset, (node as Text).length)))
  } else {
    range.selectNodeContents(el)
    range.collapse(offset <= 0)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}
function focusBlock(id: number, offset: number | 'end' = 'end') {
  void nextTick(() => {
    const el = els.get(id)
    if (!el) return
    placeCaret(el, offset === 'end' ? (el.textContent ?? '').length : offset)
  })
}
// Whether the caret is on the first / last visual line of a wrapped block, so
// ↑ and ↓ still move within a long rule before they leave it.
function onEdgeLine(el: HTMLElement, edge: 'top' | 'bottom'): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return true
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (!rect.height) return true
  const box = el.getBoundingClientRect()
  return edge === 'top'
    ? rect.top - box.top < rect.height * 0.8
    : box.bottom - rect.bottom < rect.height * 0.8
}

// --- structural edits -------------------------------------------------------
function insertAfter(index: number, block: RuleBlock) {
  blocks.value.splice(index + 1, 0, block)
}
function remove(index: number) {
  const [gone] = blocks.value.splice(index, 1)
  if (gone) ticked.delete(gone.id)
  if (!blocks.value.length) blocks.value.push(makeBlock('rule'))
}
function move(index: number, delta: number) {
  const to = index + delta
  if (to < 0 || to >= blocks.value.length) return
  const [block] = blocks.value.splice(index, 1)
  blocks.value.splice(to, 0, block)
  commit()
  focusBlock(block.id, caretOffset(els.get(block.id)!))
}
function setKind(block: RuleBlock, kind: RuleKind) {
  block.kind = kind
  commit()
  focusBlock(block.id)
}
function addRule() {
  const last = blocks.value[blocks.value.length - 1]
  // Reuse a trailing empty line rather than stacking blank ones.
  if (last && !last.text.trim()) {
    last.kind = 'rule'
    focusBlock(last.id, 0)
    return
  }
  const block = makeBlock('rule')
  blocks.value.push(block)
  focusBlock(block.id, 0)
}

// --- input ------------------------------------------------------------------
function onInput(block: RuleBlock, event: Event) {
  const el = event.target as HTMLElement
  let text = (el.textContent ?? '').replace(/\n/g, ' ')
  // Emptied lines can keep a stray <br>, which stops `:empty` showing the hint.
  if (!text && el.childNodes.length) el.textContent = ''
  // A marker just typed at the very start of the line becomes the line's kind.
  const shortcut = detectShortcut(text)
  if (shortcut && caretOffset(el) === shortcut.strip) {
    block.kind = shortcut.kind
    text = text.slice(shortcut.strip)
    el.textContent = text
    placeCaret(el, 0)
  }
  block.text = text
  commit()
}

function onKeydown(block: RuleBlock, index: number, event: KeyboardEvent) {
  if (event.isComposing) return
  const el = event.currentTarget as HTMLElement

  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    emit('save')
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const text = el.textContent ?? ''
    // An empty list line + Enter leaves the list, as in every editor.
    if (!text.trim() && block.kind !== 'text') {
      block.kind = 'text'
      commit()
      return
    }
    const at = caretOffset(el)
    if (at === 0 && text) {
      // At the start: open a line above and stay where you are.
      blocks.value.splice(index, 0, makeBlock(block.kind))
      commit()
      focusBlock(block.id, 0)
      return
    }
    block.text = text.slice(0, at)
    const next = makeBlock(nextKind(block.kind), text.slice(at))
    insertAfter(index, next)
    commit()
    focusBlock(next.id, 0)
    return
  }
  if (event.key === 'Enter') {
    // Shift+Enter: a rule is one line, so this is a new line too.
    event.preventDefault()
    return
  }

  if (event.key === 'Backspace' && selectionCollapsed() && caretOffset(el) === 0) {
    if (block.kind !== 'text') {
      event.preventDefault()
      block.kind = 'text'
      commit()
      return
    }
    if (index > 0) {
      event.preventDefault()
      const prev = blocks.value[index - 1]
      const join = prev.text.length
      prev.text += el.textContent ?? ''
      remove(index)
      commit()
      focusBlock(prev.id, join)
    }
    return
  }

  if (event.key === 'Delete' && selectionCollapsed()) {
    const text = el.textContent ?? ''
    const next = blocks.value[index + 1]
    if (next && caretOffset(el) === text.length) {
      event.preventDefault()
      block.text = text + next.text
      remove(index + 1)
      commit()
      focusBlock(block.id, text.length)
    }
    return
  }

  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    move(index, event.key === 'ArrowUp' ? -1 : 1)
    return
  }
  if (event.key === 'ArrowUp' && index > 0 && onEdgeLine(el, 'top')) {
    event.preventDefault()
    focusBlock(
      blocks.value[index - 1].id,
      Math.min(caretOffset(el), blocks.value[index - 1].text.length),
    )
    return
  }
  if (event.key === 'ArrowDown' && index < blocks.value.length - 1 && onEdgeLine(el, 'bottom')) {
    event.preventDefault()
    focusBlock(
      blocks.value[index + 1].id,
      Math.min(caretOffset(el), blocks.value[index + 1].text.length),
    )
  }
}

// A multi-line paste becomes one block per line, each read for its own kind —
// so pasting a list from anywhere arrives as a list of rules.
function onPaste(block: RuleBlock, index: number, event: ClipboardEvent) {
  const raw = event.clipboardData?.getData('text/plain')
  if (raw == null) return
  event.preventDefault()
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) {
    document.execCommand('insertText', false, raw.replace(/\s*\r?\n\s*/g, ' ').trim())
    return
  }
  const el = event.currentTarget as HTMLElement
  const text = el.textContent ?? ''
  const at = caretOffset(el)
  const head = text.slice(0, at)
  const tail = text.slice(at)
  const parsed = lines.map(parseLine)
  // The first line joins the text before the caret; an empty line takes its kind.
  if (!head.trim()) block.kind = parsed[0].kind
  block.text = head + parsed[0].text
  const added = parsed.slice(1).map((p) => makeBlock(p.kind, p.text))
  blocks.value.splice(index + 1, 0, ...added)
  const last = added[added.length - 1]
  const end = last.text.length
  last.text += tail
  commit()
  focusBlock(last.id, end)
}

// --- the row menu -----------------------------------------------------------
const KIND_META: Record<RuleKind, { label: string; icon: IconName; hint: string }> = {
  rule: { label: 'Rule (checkbox)', icon: 'list-checks', hint: '[] ' },
  heading: { label: 'Heading', icon: 'heading-1', hint: '# ' },
  subheading: { label: 'Sub-heading', icon: 'heading-2', hint: '## ' },
  bullet: { label: 'Bullet', icon: 'list', hint: '- ' },
  text: { label: 'Plain text', icon: 'pilcrow', hint: '' },
}
const KINDS = Object.keys(KIND_META) as RuleKind[]
function menuFor(block: RuleBlock, index: number): MenuItem[] {
  return [
    ...KINDS.filter((k) => k !== block.kind).map((k) => ({
      value: 'kind:' + k,
      label: 'Turn into ' + KIND_META[k].label.toLowerCase(),
      icon: KIND_META[k].icon,
    })),
    { value: 'up', label: 'Move up', icon: 'arrow-up', disabled: index === 0 },
    {
      value: 'down',
      label: 'Move down',
      icon: 'arrow-down',
      disabled: index === blocks.value.length - 1,
    },
    { value: 'delete', label: 'Delete line', icon: 'trash-2', danger: true },
  ]
}
function onMenu(block: RuleBlock, index: number, action: string) {
  if (action.startsWith('kind:')) return setKind(block, action.slice(5) as RuleKind)
  if (action === 'up') return move(index, -1)
  if (action === 'down') return move(index, 1)
  if (action === 'delete') {
    const neighbour = blocks.value[index - 1] ?? blocks.value[index + 1]
    remove(index)
    commit()
    if (neighbour) focusBlock(neighbour.id)
  }
}

function placeholderFor(block: RuleBlock, index: number): string {
  if (index === 0 && blocks.value.length === 1) return 'Type a rule — e.g. EMA 9 and 200 crossover'
  if (block.kind === 'heading') return 'Heading'
  if (block.kind === 'subheading') return 'Sub-heading'
  if (block.kind === 'rule') return 'Rule'
  if (block.kind === 'bullet') return 'Note'
  return 'Type, or start with # [] - for a heading, rule or bullet'
}

defineExpose({
  focus: () => {
    const last = blocks.value[blocks.value.length - 1]
    if (last) focusBlock(last.id)
  },
  resetTicks,
})
</script>

<template>
  <div class="rules">
    <!-- The run through the list: how far along, and a way to start over. -->
    <div
      v-if="rules.length"
      class="rules__progress"
      :class="{ 'is-clear': allClear }"
      role="status"
    >
      <Icon :name="allClear ? 'circle-check-big' : 'list-checks'" size="sm" />
      <span class="rules__progressText">
        <template v-if="allClear">All {{ rules.length }} rules checked — clear to trade.</template>
        <template v-else>{{ doneCount }} of {{ rules.length }} rules checked</template>
      </span>
      <span class="rules__bar" aria-hidden="true">
        <span :style="{ width: (doneCount / rules.length) * 100 + '%' }"></span>
      </span>
      <button
        v-if="doneCount"
        type="button"
        class="rules__reset ui-focus-ring"
        title="Untick every rule for the next trade"
        @click="resetTicks"
      >
        <Icon name="rotate-ccw" size="xs" />Reset
      </button>
    </div>

    <div class="rules__sheet">
      <div
        v-for="(block, index) in blocks"
        :key="block.id"
        class="rules__row"
        :class="['is-' + block.kind, { 'is-done': block.kind === 'rule' && ticked.has(block.id) }]"
      >
        <span class="rules__menu">
          <Dropdown
            variant="icon"
            label="Line options"
            :items="menuFor(block, index)"
            @select="onMenu(block, index, $event)"
          />
        </span>

        <span v-if="block.kind === 'rule'" class="rules__marker">
          <Checkbox
            :model-value="ticked.has(block.id)"
            :aria-label="'Checked: ' + (block.text || 'empty rule')"
            @update:model-value="toggle(block.id, $event)"
          />
        </span>
        <span
          v-else-if="block.kind === 'bullet'"
          class="rules__marker rules__dot"
          aria-hidden="true"
          >•</span
        >

        <div
          :ref="(el) => bindEl(block.id, el)"
          v-plain="block.text"
          class="rules__text"
          contenteditable="plaintext-only"
          role="textbox"
          spellcheck="true"
          :aria-label="KIND_META[block.kind].label"
          :data-placeholder="placeholderFor(block, index)"
          @input="onInput(block, $event)"
          @keydown="onKeydown(block, index, $event)"
          @paste="onPaste(block, index, $event)"
        ></div>
      </div>

      <button type="button" class="rules__add ui-focus-ring" @click="addRule">
        <Icon name="plus" size="sm" />Add rule
      </button>
    </div>

    <p class="rules__hints">
      <kbd>Enter</kbd> new line · <kbd>#</kbd> heading · <kbd>[]</kbd> rule · <kbd>-</kbd> bullet ·
      <kbd>Alt ↑↓</kbd> reorder · paste a list to add many
    </p>
  </div>
</template>

<style scoped>
.rules {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.rules__progress {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--glass-card);
  color: var(--theme-dim);
  font-size: var(--text-xs);
  transition:
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}
.rules__progress.is-clear {
  color: var(--theme-success, var(--theme-accent));
  border-color: color-mix(in srgb, var(--theme-success, var(--theme-accent)) 40%, transparent);
  background: color-mix(in srgb, var(--theme-success, var(--theme-accent)) 8%, transparent);
}
.rules__progressText {
  white-space: nowrap;
  font-weight: var(--weight-semibold);
}
.rules__bar {
  flex: 1;
  height: 4px;
  min-width: 40px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--theme-text) 10%, transparent);
  overflow: hidden;
}
.rules__bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
  transition: width 240ms var(--ease-out);
}
.rules__progress:not(.is-clear) .rules__bar > span {
  background: var(--theme-accent);
}
.rules__reset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  cursor: pointer;
}
.rules__reset:hover {
  color: var(--theme-text);
  border-color: var(--theme-accent);
}

.rules__sheet {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3) var(--sp-3) var(--sp-2) var(--sp-1);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--glass-card);
  min-height: 220px;
  max-height: 60vh;
  overflow-y: auto;
}

.rules__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  min-width: 0;
  padding: 3px var(--sp-2) 3px 0;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) ease;
}
.rules__row:hover,
.rules__row:focus-within {
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}
.rules__row.is-heading {
  margin-top: var(--sp-3);
}
.rules__row.is-subheading {
  margin-top: var(--sp-2);
}
.rules__row:first-child {
  margin-top: 0;
}

/* The row menu sits in the gutter and only shows where you are. */
.rules__menu {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-fast) ease;
}
.rules__menu :deep(.ui-dropdown__trigger--icon) {
  width: 24px;
  height: 24px;
}
.rules__row:hover .rules__menu,
.rules__row:focus-within .rules__menu,
.rules__menu:has([aria-expanded='true']) {
  opacity: 1;
}

.rules__marker {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 24px;
}
.rules__dot {
  width: 18px;
  justify-content: center;
  color: var(--theme-dim);
}

.rules__text {
  flex: 1;
  min-width: 0;
  min-height: 24px;
  padding: 1px 0;
  outline: none;
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: 22px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
}
.rules__text:empty::before {
  content: attr(data-placeholder);
  color: var(--theme-dim);
  opacity: 0.6;
  pointer-events: none;
}
/* Placeholders only on the line you are in (and a lone first line), so an
   untouched sheet is not a column of grey hints. */
.rules__row:not(:focus-within) .rules__text:empty::before {
  opacity: 0;
}
.rules__row:only-of-type .rules__text:empty::before,
.rules__row:first-child:nth-last-child(2) .rules__text:empty::before {
  opacity: 0.6;
}
.is-heading .rules__text {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: 28px;
}
.is-subheading .rules__text {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 26px;
}
.is-heading .rules__menu,
.is-subheading .rules__menu {
  padding-top: 2px;
}
.is-text .rules__text {
  color: var(--theme-dim);
}
.is-done .rules__text {
  color: var(--theme-dim);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--theme-dim) 60%, transparent);
}

.rules__add {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  align-self: flex-start;
  margin: var(--sp-2) 0 0 32px;
  padding: 4px 10px;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  cursor: pointer;
}
.rules__add:hover {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
  border-style: solid;
}

.rules__hints {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  line-height: 1.8;
}
.rules__hints kbd {
  padding: 1px 5px;
  border: 1px solid var(--glass-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: inherit;
}

@media (hover: none) {
  /* No hover on touch: the menu has to be visible to be reachable. */
  .rules__menu {
    opacity: 0.6;
  }
  .rules__hints {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rules__bar > span {
    transition: none;
  }
}
</style>

<script setup lang="ts">
// The Prompts tab: pick a topic, pick a template, fill its blanks, copy.
//
// Two columns. The library on the left — a search, the topics as filters, and
// the templates grouped under their topic, each a compact row with the topic's
// tile, its title and what it costs. The composer on the right, held in view
// while the library scrolls — a hero for the template, one field per blank
// with an example in it, a live preview that marks what was filled in and what
// is still missing, and the bar that matters: the token meter, Compact, Copy.
//
// Built-in templates ship with the app (utils/prompts.ts); the user's own are
// stored with the workspace. A built-in cannot be edited — "Customise" copies
// it into the user's own, where it can.
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import PanelHeader from '@/components/PanelHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import Button from '@/components/ui/Button.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Modal from '@/components/ui/Modal.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Switch from '@/components/ui/Switch.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import type { IconName } from '@/components/ui/icons'
import {
  BUILT_IN_PROMPTS,
  BUILT_IN_TOPICS,
  blankHint,
  blankLabel,
  blanksOf,
  compactPrompt,
  emptyBlanks,
  estimateTokens,
  fillPrompt,
  isLongBlank,
  promptParts,
  type PromptEntry,
} from '@/utils/prompts'

const app = useAppStore()
const { prompts } = storeToRefs(app)
const { panelStyle, isMobile } = useStyles()

// Each topic's tile. A topic the user invents gets the generic one.
const TOPIC_ICON: Record<string, IconName> = {
  Coding: 'monitor',
  Writing: 'pencil',
  Email: 'share',
  Research: 'search',
  Learning: 'star',
  Productivity: 'timer',
}
function topicIcon(t: string): IconName {
  return TOPIC_ICON[t] ?? 'notebook'
}
function plural(n: number, word: string): string {
  return n + ' ' + word + (n === 1 ? '' : 's')
}

// ---- the library ------------------------------------------------------------
const ALL = 'All'
const MINE = 'Mine'
const query = ref('')
const topic = ref<string>(ALL)

const ownEntries = computed<PromptEntry[]>(() =>
  prompts.value.map((p) => ({
    key: 'u:' + p.id,
    builtIn: false,
    topic: p.topic,
    title: p.title,
    body: p.body,
  })),
)
// The user's own first: they made them because they use them.
const entries = computed<PromptEntry[]>(() => [...ownEntries.value, ...BUILT_IN_PROMPTS])

const topics = computed(() => {
  const own = ownEntries.value.map((e) => e.topic).filter((t) => !BUILT_IN_TOPICS.includes(t))
  return [ALL, ...(ownEntries.value.length ? [MINE] : []), ...BUILT_IN_TOPICS, ...new Set(own)]
})
function topicCount(t: string): number {
  if (t === ALL) return entries.value.length
  if (t === MINE) return ownEntries.value.length
  return entries.value.filter((e) => e.topic === t).length
}

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return entries.value.filter((e) => {
    if (topic.value === MINE && e.builtIn) return false
    if (topic.value !== ALL && topic.value !== MINE && e.topic !== topic.value) return false
    if (!q) return true
    return (e.title + ' ' + e.topic + ' ' + e.body).toLowerCase().includes(q)
  })
})
// Under a heading per topic, so a long library reads as sections rather than
// as one column of identical boxes. The user's own come first as "Yours".
const sections = computed(() => {
  const out: { label: string; icon: IconName; items: PromptEntry[] }[] = []
  const mine = shown.value.filter((e) => !e.builtIn)
  if (mine.length) out.push({ label: 'Yours', icon: 'user-circle', items: mine })
  const byTopic = new Map<string, PromptEntry[]>()
  for (const e of shown.value) {
    if (!e.builtIn) continue
    byTopic.set(e.topic, [...(byTopic.get(e.topic) ?? []), e])
  }
  for (const [label, items] of byTopic) out.push({ label, icon: topicIcon(label), items })
  return out
})

// ---- the composer -----------------------------------------------------------
const selectedKey = ref<string>(entries.value[0]?.key ?? '')
const selected = computed(() => entries.value.find((e) => e.key === selectedKey.value) ?? null)
// If the selected template goes (deleted), fall back to the first one there is.
watch(entries, (list) => {
  if (!list.some((e) => e.key === selectedKey.value)) selectedKey.value = list[0]?.key ?? ''
})

// What has been typed into each template's blanks, kept per template so moving
// between two of them does not throw away what was filled in either.
const fills = reactive<Record<string, Record<string, string>>>({})
watch(
  selectedKey,
  (k) => {
    if (!fills[k]) fills[k] = {}
  },
  { immediate: true },
)
const values = computed<Record<string, string>>(() => fills[selectedKey.value] ?? {})
const blanks = computed(() => (selected.value ? blanksOf(selected.value.body) : []))
const parts = computed(() => (selected.value ? promptParts(selected.value.body, values.value) : []))
const missing = computed(() =>
  selected.value ? emptyBlanks(selected.value.body, values.value) : [],
)
const filledCount = computed(() => blanks.value.length - missing.value.length)
const fillPct = computed(() =>
  blanks.value.length ? Math.round((filledCount.value / blanks.value.length) * 100) : 100,
)
const baseTokens = computed(() => (selected.value ? estimateTokens(selected.value.body) : 0))

// Compact squeezes the whitespace out of the finished prompt. On by default:
// nobody wants to pay for the indentation of a pasted stack trace.
const compact = ref(true)
const raw = computed(() => (selected.value ? fillPrompt(selected.value.body, values.value) : ''))
const output = computed(() => (compact.value ? compactPrompt(raw.value) : raw.value))
const tokens = computed(() => estimateTokens(output.value))
const saved = computed(() => Math.max(0, estimateTokens(raw.value) - tokens.value))
// The meter: how heavy the prompt is, on a scale where 500 tokens is full —
// past that it is a document, not a prompt, and the bar says so by filling.
const TOKEN_SCALE = 500
const meterPct = computed(() => Math.min(100, Math.round((tokens.value / TOKEN_SCALE) * 100)))
const weight = computed(() =>
  tokens.value <= 120 ? 'Lean' : tokens.value <= 350 ? 'Moderate' : 'Heavy',
)

// The phone's composer sheet.
const sheetOpen = ref(false)
function pick(key: string) {
  selectedKey.value = key
  if (isMobile.value) sheetOpen.value = true
}
function clearFills() {
  fills[selectedKey.value] = {}
}

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
  } catch {
    app.showToastMsg("Couldn't copy — your browser blocked the clipboard")
    return
  }
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 1600)
  const n = missing.value.length
  app.showToastMsg(
    n ? `Copied — ${n} blank${n === 1 ? '' : 's'} left empty` : `Copied · ≈${tokens.value} tokens`,
  )
}

// ---- the editor -------------------------------------------------------------
const editor = reactive({
  open: false,
  id: null as number | null,
  topic: '',
  title: '',
  body: '',
})
const editorBlanks = computed(() => blanksOf(editor.body))
const editorTokens = computed(() => estimateTokens(compactPrompt(editor.body)))
const topicSuggestions = computed(() => [
  ...new Set([...BUILT_IN_TOPICS, ...ownEntries.value.map((e) => e.topic)]),
])

function openNew() {
  Object.assign(editor, { open: true, id: null, topic: '', title: '', body: '' })
}
function openEdit(e: PromptEntry) {
  if (e.builtIn) {
    // Customise: the same template, as a new one of the user's own.
    Object.assign(editor, {
      open: true,
      id: null,
      topic: e.topic,
      title: e.title + ' (mine)',
      body: e.body,
    })
    return
  }
  Object.assign(editor, {
    open: true,
    id: Number(e.key.slice(2)),
    topic: e.topic,
    title: e.title,
    body: e.body,
  })
}
function saveEditor() {
  if (!editor.body.trim()) return
  if (editor.id == null) {
    const id = app.addPrompt({ topic: editor.topic, title: editor.title, body: editor.body })
    if (id != null) {
      selectedKey.value = 'u:' + id
      app.showToastMsg('Template saved')
    }
  } else {
    app.updatePrompt(editor.id, { topic: editor.topic, title: editor.title, body: editor.body })
    app.showToastMsg('Template updated')
  }
  editor.open = false
}
function removeEntry(e: PromptEntry) {
  if (e.builtIn) return
  app.removePrompt(Number(e.key.slice(2)))
  delete fills[e.key]
  editor.open = false
  app.showToastMsg('Template deleted')
}
function deleteFromEditor() {
  if (editor.id == null) return
  removeEntry({ key: 'u:' + editor.id, builtIn: false, topic: '', title: '', body: '' })
}

defineExpose({ focus: openNew })
</script>

<template>
  <div :style="panelStyle" class="pv">
    <PanelHeader title="Prompts" new-label="New template" @new="openNew">
      <template #left>
        <span v-if="!isMobile" class="pv__sub">
          <Icon name="star" size="xs" />
          {{ entries.length }} templates · {{ ownEntries.length }} yours
        </span>
      </template>
    </PanelHeader>

    <div class="pv__cols" :class="{ 'is-stacked': isMobile }">
      <!-- ---- the library ---- -->
      <aside class="pv__lib" aria-label="Prompt templates">
        <SearchField v-model="query" size="md" placeholder="Search templates…" label="Search" />

        <div class="pv__topics" role="tablist" aria-label="Topics">
          <button
            v-for="t in topics"
            :key="t"
            type="button"
            role="tab"
            class="pv__topic"
            :class="{ 'is-on': topic === t }"
            :aria-selected="topic === t"
            @click="topic = t"
          >
            {{ t }}
            <span class="pv__topic-n">{{ topicCount(t) }}</span>
          </button>
        </div>

        <div class="pv__list">
          <section v-for="sec in sections" :key="sec.label" class="pv__sec">
            <h4 class="pv__sec-head">
              <span>{{ sec.label }}</span>
              <span class="pv__sec-n">{{ sec.items.length }}</span>
            </h4>
            <button
              v-for="e in sec.items"
              :key="e.key"
              type="button"
              class="pv__row"
              :class="{ 'is-on': e.key === selectedKey }"
              :aria-pressed="e.key === selectedKey"
              @click="pick(e.key)"
            >
              <span class="pv__tile" aria-hidden="true">
                <Icon :name="e.builtIn ? topicIcon(e.topic) : 'user-circle'" size="sm" />
              </span>
              <span class="pv__row-text">
                <span class="pv__row-title">{{ e.title }}</span>
                <span class="pv__row-meta">
                  {{ plural(blanksOf(e.body).length, 'blank') }} · ≈{{ estimateTokens(e.body) }}
                  tokens
                </span>
              </span>
              <Icon name="chevron-right" size="xs" class="pv__row-go" />
            </button>
          </section>

          <div v-if="!shown.length" class="pv__none">
            <span class="pv__none-icon"><Icon name="search" size="md" /></span>
            <p class="pv__none-title">Nothing matches</p>
            <p class="pv__none-text">Try another topic, or make it yourself.</p>
            <Button variant="tinted" size="sm" @click="openNew">
              <Icon name="plus" size="xs" /> New template
            </Button>
          </div>
        </div>
      </aside>

      <!-- ---- the composer ----
           Beside the library on a wide screen; on a phone it would land under
           the whole library, so there it rises in a sheet when a template is
           tapped instead. The sheet is teleported to the body: the tab panel
           slides in with a transform, and a fixed sheet inside a transformed
           box is positioned against that box, off the bottom of the screen. -->
      <Teleport v-if="selected" to="body" :disabled="!isMobile">
        <component
          :is="isMobile ? BottomSheet : 'div'"
          v-bind="
            isMobile ? { open: sheetOpen, title: selected.title } : { class: 'pv__compose-slot' }
          "
          @close="sheetOpen = false"
        >
          <section
            class="pv__compose"
            :class="{ 'is-sheet': isMobile }"
            aria-label="Fill in the prompt"
          >
            <!-- Hero: what this template is, and what it costs before a word. -->
            <header class="pv__hero">
              <span class="pv__hero-tile" aria-hidden="true">
                <Icon
                  :name="selected.builtIn ? topicIcon(selected.topic) : 'user-circle'"
                  size="md"
                />
              </span>
              <div class="pv__hero-text">
                <span class="pv__eyebrow">
                  {{ selected.topic }}
                  <span class="pv__badge" :class="{ 'pv__badge--mine': !selected.builtIn }">
                    {{ selected.builtIn ? 'Built-in' : 'Yours' }}
                  </span>
                </span>
                <h3 class="pv__title">{{ selected.title }}</h3>
                <span class="pv__stats">
                  <span class="pv__stat"
                    ><Icon name="list" size="xs" />{{ plural(blanks.length, 'blank') }}</span
                  >
                  <span class="pv__stat"
                    ><Icon name="tag" size="xs" />≈{{ baseTokens }} base tokens</span
                  >
                </span>
              </div>
              <button type="button" class="pv__soft" @click="openEdit(selected)">
                <Icon :name="selected.builtIn ? 'copy' : 'pencil'" size="xs" />
                {{ selected.builtIn ? 'Customise' : 'Edit' }}
              </button>
            </header>

            <!-- One field per blank. Ctrl/⌘+Enter copies from any of them. -->
            <div
              v-if="blanks.length"
              class="pv__fill-block"
              @keydown.ctrl.enter.prevent="copy"
              @keydown.meta.enter.prevent="copy"
            >
              <div class="pv__fill-head">
                <span class="pv__fill-title">Fill in the blanks</span>
                <span class="pv__fill-count">{{ filledCount }} of {{ blanks.length }}</span>
                <button v-if="filledCount" type="button" class="pv__link" @click="clearFills">
                  <Icon name="rotate-ccw" size="xs" /> Clear
                </button>
              </div>
              <div
                class="pv__track"
                role="progressbar"
                :aria-valuenow="fillPct"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Blanks filled"
              >
                <span class="pv__track-fill" :style="{ width: fillPct + '%' }" />
              </div>
              <div class="pv__fields">
                <div
                  v-for="b in blanks"
                  :key="b"
                  class="pv__field"
                  :class="{ 'is-long': isLongBlank(b), 'is-done': !!values[b]?.trim() }"
                >
                  <TextArea
                    v-if="isLongBlank(b)"
                    v-model="values[b]"
                    :label="blankLabel(b)"
                    :rows="3"
                    max-height="220px"
                    :placeholder="blankHint(b)"
                  />
                  <TextInput
                    v-else
                    v-model="values[b]"
                    :label="blankLabel(b)"
                    :placeholder="blankHint(b)"
                  />
                </div>
              </div>
            </div>
            <p v-else class="pv__noblank">This template has no blanks — copy it as it is.</p>

            <!-- The prompt as it will go out: filled words marked, gaps flagged. -->
            <div class="pv__preview" aria-live="polite">
              <div class="pv__preview-head">
                <span class="pv__preview-label">Preview</span>
                <span v-if="missing.length" class="pv__preview-warn">
                  {{ missing.length }} still empty
                </span>
                <span v-else class="pv__preview-ok"><Icon name="check" size="xs" /> Ready</span>
              </div>
              <p class="pv__prompt">
                <template v-for="(p, i) in parts" :key="i">
                  <template v-if="p.kind === 'text'">{{ p.text }}</template>
                  <mark v-else-if="p.value" class="pv__fill">{{ p.value }}</mark>
                  <span v-else class="pv__hole">{{ p.name }}</span>
                </template>
              </p>
            </div>

            <!-- The bar: what it costs, how to make it cost less, and Copy. -->
            <footer class="pv__bar">
              <div class="pv__meter">
                <div class="pv__meter-top">
                  <span class="pv__tokens">≈{{ tokens }}</span>
                  <span class="pv__tokens-unit">tokens</span>
                  <span class="pv__weight">{{ weight }}</span>
                  <span v-if="compact && saved" class="pv__saved">−{{ saved }} saved</span>
                </div>
                <div class="pv__meter-track" aria-hidden="true">
                  <span class="pv__meter-fill" :style="{ width: meterPct + '%' }" />
                </div>
              </div>
              <Switch
                v-model="compact"
                size="sm"
                label="Compact"
                class="pv__compact"
                title="Squeeze out extra spaces and blank lines"
              />
              <Button
                variant="primary"
                size="lg"
                class="pv__copy"
                :disabled="!output"
                :title="
                  missing.length ? missing.length + ' blank(s) still empty' : 'Copy the prompt'
                "
                @click="copy"
              >
                <Icon :name="copied ? 'check' : 'copy'" size="sm" />
                {{ copied ? 'Copied' : 'Copy prompt' }}
              </Button>
            </footer>
          </section>
        </component>
      </Teleport>
      <section v-else-if="!isMobile" class="pv__compose pv__compose--empty">
        <p class="pv__noblank">Pick a template on the left to start.</p>
      </section>
    </div>

    <!-- ---- create / edit ---- -->
    <Modal
      :open="editor.open"
      :title="editor.id == null ? 'New template' : 'Edit template'"
      size="md"
      @close="editor.open = false"
    >
      <div class="pv__editor">
        <div class="pv__editor-row">
          <TextInput v-model="editor.title" label="Title" placeholder="e.g. Summarise a doc" />
          <TextInput v-model="editor.topic" label="Topic" placeholder="e.g. Writing" />
        </div>
        <div class="pv__suggest">
          <button
            v-for="t in topicSuggestions"
            :key="t"
            type="button"
            class="pv__topic"
            :class="{ 'is-on': editor.topic === t }"
            @click="editor.topic = t"
          >
            <Icon :name="topicIcon(t)" size="xs" class="pv__topic-icon" />
            {{ t }}
          </button>
        </div>
        <TextArea
          v-model="editor.body"
          label="Prompt"
          :rows="6"
          max-height="320px"
          placeholder="Summarise in {{length}} for {{audience}}. Keep key numbers.&#10;{{text}}"
          hint="Write each fill-in as {{name}}. Keep it short — every word is a token."
        />
        <div class="pv__editor-meta">
          <span class="pv__editor-blanks">
            <span v-if="!editorBlanks.length">No blanks yet</span>
            <span v-for="b in editorBlanks" :key="b" class="pv__hole">{{ b }}</span>
          </span>
          <span class="pv__editor-tokens">≈{{ editorTokens }} tokens</span>
        </div>
      </div>
      <template #footer>
        <Button v-if="editor.id != null" variant="danger" size="sm" @click="deleteFromEditor">
          <Icon name="trash" size="xs" /> Delete
        </Button>
        <span class="pv__spacer" />
        <Button variant="ghost" @click="editor.open = false">Cancel</Button>
        <Button variant="primary" :disabled="!editor.body.trim()" @click="saveEditor">
          Save template
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.pv {
  /* One wash for every soft surface in the tab, so they agree. */
  --pv-wash: color-mix(in oklch, var(--theme-accent) 9%, transparent);
  --pv-wash-strong: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  --pv-line: color-mix(in oklch, var(--theme-text) 8%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.pv__sub {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}
.pv__cols {
  display: grid;
  grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.pv__cols.is-stacked {
  grid-template-columns: minmax(0, 1fr);
}

/* ---- library ---------------------------------------------------------------- */
.pv__lib {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.pv__topics,
.pv__suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* Soft pills: the selected one is a tinted chip with accent ink, not a solid
   block — the solid fill is kept for the one action that matters, Copy. */
.pv__topic {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}
.pv__topic:hover {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 9%, transparent);
}
.pv__topic.is-on {
  border-color: color-mix(in oklch, var(--theme-accent) 45%, transparent);
  background: var(--pv-wash-strong);
  color: var(--theme-text);
}
.pv__topic.is-on .pv__topic-icon {
  color: var(--theme-accent);
}
.pv__topic:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.pv__topic-n {
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.pv__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-height: min(64vh, 680px);
  overflow-y: auto;
  padding: 2px 6px 6px 2px;
  scrollbar-gutter: stable;
}
.pv__cols.is-stacked .pv__list {
  max-height: none;
}
.pv__sec {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pv__sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 2px;
  padding: 0 6px;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.pv__sec-head::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--pv-line);
}
.pv__sec-n {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
/* A row, not a box: the tile carries the colour, the row only lights up when
   it is hovered or picked. */
.pv__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 9px 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.pv__row:hover {
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.pv__row.is-on {
  background: var(--pv-wash-strong);
}
.pv__row.is-on::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 2px;
  background: var(--theme-accent);
}
.pv__row:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.pv__tile,
.pv__hero-tile,
.pv__none-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--pv-wash-strong);
  color: var(--theme-accent);
}
.pv__row.is-on .pv__tile {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.pv__row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.pv__row-title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pv__row-meta {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.pv__row-go {
  flex-shrink: 0;
  color: var(--theme-dim);
  opacity: 0;
  transform: translateX(-3px);
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}
.pv__row:hover .pv__row-go,
.pv__row.is-on .pv__row-go {
  opacity: 1;
  transform: none;
}
.pv__row.is-on .pv__row-go {
  color: var(--theme-accent);
}

.pv__none {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 12px;
  text-align: center;
}
.pv__none-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
}
.pv__none-title {
  margin: 4px 0 0;
  color: var(--theme-text);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
}
.pv__none-text {
  margin: 0 0 6px;
  color: var(--theme-dim);
  font-size: var(--text-sm);
}

/* ---- composer --------------------------------------------------------------- */
/* Held in view while the library scrolls past it. */
.pv__compose {
  position: sticky;
  top: 8px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--pv-line);
  border-radius: 24px;
  background: var(--theme-card);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 5%, transparent),
    0 16px 36px -22px color-mix(in srgb, var(--shadow-ink, #000) 30%, transparent);
}
.pv__compose-slot {
  position: sticky;
  top: 8px;
  min-width: 0;
}
.pv__compose-slot > .pv__compose {
  position: static;
}
/* In the phone's sheet the sheet is the card, so the composer drops its own.
   A class rather than a descendant rule: teleported, it has no .pv__cols
   above it. Its own tokens come with it for the same reason. */
.pv__compose.is-sheet {
  --pv-wash: color-mix(in oklch, var(--theme-accent) 9%, transparent);
  --pv-wash-strong: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  --pv-line: color-mix(in oklch, var(--theme-text) 8%, transparent);
  position: static;
  padding: 4px 2px 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
/* The sheet's own header already names the template. */
.pv__compose.is-sheet .pv__title {
  display: none;
}
.pv__compose.is-sheet .pv__fields {
  grid-template-columns: minmax(0, 1fr);
}
.pv__compose--empty {
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.pv__hero {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.pv__hero-tile {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: linear-gradient(
    145deg,
    var(--theme-accent),
    color-mix(in oklch, var(--theme-accent) 70%, var(--theme-text))
  );
  color: var(--theme-on-accent);
  box-shadow: 0 8px 18px -10px var(--theme-accent);
}
.pv__hero-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.pv__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.pv__badge {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
  letter-spacing: 0.04em;
  text-transform: none;
}
.pv__badge--mine {
  background: var(--pv-wash-strong);
  color: var(--theme-text);
}
.pv__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--theme-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pv__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 2px;
}
.pv__stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
}
.pv__soft {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--pv-wash);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.pv__soft:hover {
  background: var(--pv-wash-strong);
}
.pv__soft:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

.pv__fill-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pv__fill-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pv__fill-title {
  color: var(--theme-text);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
}
.pv__fill-count {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.pv__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.pv__link:hover {
  background: var(--pv-wash);
  color: var(--theme-text);
}
.pv__track,
.pv__meter-track {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
}
.pv__track-fill,
.pv__meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--theme-accent);
  transition: width 0.35s var(--spring, ease);
}
.pv__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  margin-top: 2px;
}
.pv__cols.is-stacked .pv__fields {
  grid-template-columns: minmax(0, 1fr);
}
.pv__field {
  min-width: 0;
}
.pv__field.is-long {
  grid-column: 1 / -1;
}
/* Labels in sentence case at a readable size; the field is a soft well with
   no frame, and a filled one keeps a quiet accent edge so progress shows. */
.pv__fields :deep(.ui-ti__label),
.pv__fields :deep(.ui-ta__label) {
  margin-bottom: 6px;
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  letter-spacing: 0;
  text-transform: none;
}
.pv__fields :deep(.ui-control),
.pv__fields :deep(.ui-control:hover),
.pv__fields :deep(.ui-control:focus-within) {
  min-height: 42px;
  border: 0;
  outline: none;
  border-radius: 12px;
  background: var(--pv-wash);
  transition:
    background var(--dur-fast) ease,
    box-shadow var(--dur-fast) ease;
}
.pv__fields :deep(.ui-control:focus-within) {
  background: var(--pv-wash-strong);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--theme-accent) 40%, transparent);
}
.pv__field.is-done :deep(.ui-control:not(:focus-within)) {
  box-shadow: inset 3px 0 0 var(--theme-accent);
}
.pv__fields :deep(.ui-control__input) {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}
.pv__fields :deep(.ui-control__input)::placeholder {
  font-weight: var(--weight-normal);
}
.pv__noblank {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-sm);
}

.pv__preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 16px;
  border: 1px dashed color-mix(in oklch, var(--theme-text) 14%, transparent);
  border-radius: 16px;
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
.pv__preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pv__preview-label {
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.pv__preview-warn,
.pv__preview-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.pv__preview-warn {
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
}
.pv__preview-ok {
  background: var(--pv-wash-strong);
  color: var(--theme-text);
}
.pv__prompt {
  min-width: 0;
  margin: 0;
  color: var(--theme-text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pv__fill {
  padding: 1px 4px;
  border-radius: 5px;
  background: var(--pv-wash-strong);
  box-shadow: inset 0 -2px 0 color-mix(in oklch, var(--theme-accent) 60%, transparent);
  color: inherit;
}
.pv__hole {
  display: inline-block;
  padding: 0 8px;
  border: 1px dashed color-mix(in oklch, var(--theme-accent) 70%, transparent);
  border-radius: var(--radius-pill);
  background: var(--pv-wash);
  color: var(--theme-accent);
  font-family: var(--font-sans, inherit);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  line-height: 1.7;
  vertical-align: baseline;
}

.pv__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--pv-wash);
}
.pv__meter {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
  min-width: 180px;
}
.pv__meter-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.pv__tokens {
  color: var(--theme-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.pv__tokens-unit {
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.pv__weight {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.pv__saved {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.pv__compact :deep(.ui-switch__label) {
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.pv__copy {
  min-width: 150px;
}

/* ---- editor ----------------------------------------------------------------- */
.pv__editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.pv__editor-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}
.pv__editor-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.pv__editor-blanks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.pv__editor-tokens {
  flex-shrink: 0;
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.pv__spacer {
  flex: 1;
}

@media (prefers-reduced-motion: reduce) {
  .pv__topic,
  .pv__row,
  .pv__row-go,
  .pv__track-fill,
  .pv__meter-fill,
  .pv__soft {
    transition: none;
  }
}
</style>

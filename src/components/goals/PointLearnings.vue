<script setup lang="ts">
// What was learnt on one point of a milestone, each with worked examples.
//
// A learning is one sentence ("`const` stops reassignment, not mutation"); its
// examples are what make it stick — a code snippet kept monospaced with its
// whitespace, or a line of prose. Everything edits in place and saves on blur,
// like the point's own text, so there is no edit mode to enter or leave.
import { computed, nextTick, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Icon from '@/components/ui/Icon.vue'
import type { Learning, LearningExample } from '@/types'

const props = defineProps<{ pointId: number }>()
const app = useAppStore()

const learnings = computed<Learning[]>(
  () => app.goalChecklist.find((c) => c.id === props.pointId)?.learnings ?? [],
)

// What an empty code example looks like filled in.
const CODE_HINT = "const user = { name: 'Ada' }\nuser.name = 'Grace' // fine: the binding is const"

// --- adding a learning -----------------------------------------------------------
const draft = ref('')
const root = ref<HTMLElement | null>(null)
async function add(withCode = false) {
  const text = draft.value.trim()
  if (!text) return
  const lid = app.addLearning(props.pointId, text, withCode ? [{ kind: 'code', body: '' }] : [])
  draft.value = ''
  if (withCode) await focusExample(lid)
}

// --- examples ---------------------------------------------------------------------
async function addExample(lid: number, kind: LearningExample['kind']) {
  app.addLearningExample(props.pointId, lid, { kind, body: '' })
  await focusExample(lid)
}
// The new example is the last one under its learning; put the caret in it.
async function focusExample(lid: number) {
  await nextTick()
  const fields = root.value?.querySelectorAll<HTMLTextAreaElement>(
    `[data-learning="${lid}"] textarea`,
  )
  fields?.[fields.length - 1]?.focus()
}

// Edits are held locally and written on blur, so typing is one write, not one
// per keystroke synced to every device.
const texts = ref<Record<string, string>>({})
const key = (lid: number, eid?: number) => (eid == null ? `l${lid}` : `l${lid}e${eid}`)
function onLearningBlur(l: Learning) {
  const k = key(l.id)
  const next = texts.value[k]
  if (next == null) return
  if (!next.trim()) app.removeLearning(props.pointId, l.id)
  else if (next !== l.text) app.updateLearning(props.pointId, l.id, next.trim())
  delete texts.value[k]
}
function onExampleBlur(l: Learning, e: LearningExample) {
  const k = key(l.id, e.id)
  const next = texts.value[k]
  if (next == null) return
  if (next !== e.body) app.updateLearningExample(props.pointId, l.id, e.id, { body: next })
  delete texts.value[k]
}
function toggleKind(l: Learning, e: LearningExample) {
  app.updateLearningExample(props.pointId, l.id, e.id, {
    kind: e.kind === 'code' ? 'text' : 'code',
  })
}
</script>

<template>
  <div ref="root" class="plearn">
    <div v-for="(l, i) in learnings" :key="l.id" class="plearn__item" :data-learning="l.id">
      <div class="plearn__head">
        <span class="plearn__num" aria-hidden="true">{{ i + 1 }}</span>
        <TextInput
          size="sm"
          class="plearn__text"
          aria-label="What was learnt"
          :model-value="texts[key(l.id)] ?? l.text"
          @update:model-value="texts[key(l.id)] = $event"
          @blur="onLearningBlur(l)"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <button
          type="button"
          class="plearn__icon"
          aria-label="Delete learning"
          title="Delete learning"
          @click="app.removeLearning(pointId, l.id)"
        >
          <Icon name="trash" size="xs" />
        </button>
      </div>

      <div v-for="e in l.examples" :key="e.id" class="plearn__example" :class="`is-${e.kind}`">
        <TextArea
          :rows="e.kind === 'code' ? 3 : 1"
          auto-grow
          max-height="320px"
          :placeholder="e.kind === 'code' ? CODE_HINT : 'An example in words…'"
          :aria-label="e.kind === 'code' ? 'Code example' : 'Example'"
          :model-value="texts[key(l.id, e.id)] ?? e.body"
          @update:model-value="texts[key(l.id, e.id)] = $event"
          @blur="onExampleBlur(l, e)"
        />
        <div class="plearn__exactions">
          <button
            type="button"
            class="plearn__kind"
            :title="e.kind === 'code' ? 'Show as text' : 'Show as code'"
            :aria-label="
              e.kind === 'code' ? 'Code example — show as text' : 'Text example — show as code'
            "
            @click="toggleKind(l, e)"
          >
            <Icon v-if="e.kind === 'code'" name="code" size="xs" />
            <template v-else>Aa</template>
          </button>
          <button
            type="button"
            class="plearn__icon"
            aria-label="Delete example"
            title="Delete example"
            @click="app.removeLearningExample(pointId, l.id, e.id)"
          >
            <Icon name="x" size="xs" />
          </button>
        </div>
      </div>

      <div class="plearn__addex">
        <button type="button" class="plearn__link" @click="addExample(l.id, 'code')">
          <Icon name="plus" size="xs" /> Code example
        </button>
        <button type="button" class="plearn__link" @click="addExample(l.id, 'text')">
          <Icon name="plus" size="xs" /> Text example
        </button>
      </div>
    </div>

    <form class="plearn__add" @submit.prevent="add()">
      <TextInput
        size="sm"
        icon="lightbulb"
        class="plearn__text"
        placeholder="What did you learn? e.g. const stops reassignment, not mutation"
        aria-label="New learning"
        :model-value="draft"
        @update:model-value="draft = $event"
      />
      <button type="submit" class="plearn__btn" :disabled="!draft.trim()">Add</button>
      <button
        type="button"
        class="plearn__btn"
        :disabled="!draft.trim()"
        title="Add, with a code example to fill in"
        @click="add(true)"
      >
        + code
      </button>
    </form>
  </div>
</template>

<style scoped>
.plearn {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-left: 2px solid color-mix(in oklch, var(--theme-accent) 45%, transparent);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  background: color-mix(in oklch, var(--theme-accent) 5%, transparent);
}
.plearn__item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.plearn__head,
.plearn__add {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.plearn__num {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-accent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.plearn__text {
  flex: 1;
  min-width: 0;
}
.plearn__example {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sp-1);
  margin-left: 26px;
}
/* Code keeps its whitespace and reads as code. */
.plearn__example.is-code :deep(textarea) {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: pre;
  overflow-x: auto;
  tab-size: 2;
}
.plearn__exactions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.plearn__kind {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  cursor: pointer;
}
.plearn__kind:hover {
  color: var(--theme-text);
}
.plearn__addex {
  display: flex;
  gap: var(--sp-2);
  margin-left: 26px;
}
.plearn__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-family: inherit;
  font-size: var(--text-2xs);
  cursor: pointer;
}
.plearn__link:hover {
  color: var(--theme-accent);
}
.plearn__icon {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.plearn__icon:hover {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.plearn__btn {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.plearn__btn:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.plearn__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>

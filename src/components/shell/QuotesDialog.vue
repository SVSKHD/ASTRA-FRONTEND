<script setup lang="ts">
// Your quotes, for the Daily spark card: paste more in as JSON or one per line,
// see how the paste was read before it is saved, and delete any you no longer
// want. Saved with the workspace, so they follow you to every device.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { parseQuotes, quoteKey } from '@/utils/quotes'
import Modal from '@/components/ui/Modal.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const { quotes } = storeToRefs(app)
const text = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) text.value = ''
  },
)

// What the paste holds, split into new and already saved.
const read = computed(() => (text.value.trim() ? parseQuotes(text.value) : null))
const saved = computed(() => new Set(quotes.value.map((q) => quoteKey(q.text))))
const fresh = computed(() => {
  const seen = new Set(saved.value)
  return (read.value?.quotes ?? []).filter((q) => {
    const k = quoteKey(q.text)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
})
const repeats = computed(() => (read.value?.quotes.length ?? 0) - fresh.value.length)

function add() {
  if (!fresh.value.length) return
  const { added } = app.addQuotes(text.value)
  app.showToastMsg(`Added ${added} quote${added === 1 ? '' : 's'}`)
  text.value = ''
}
</script>

<template>
  <Modal :open="open" title="Your quotes" size="md" @close="emit('close')">
    <div class="qd">
      <p class="qd__hint">
        Paste a JSON list — <code>["…", "…"]</code> or <code>[{ "text": "…", "by": "…" }]</code> —
        or plain text, one quote per line with <code>— Author</code> at the end. Repeats are
        skipped.
      </p>
      <TextArea
        v-model="text"
        :rows="6"
        placeholder="Done is better than perfect.
Well begun is half done. — Aristotle"
        aria-label="Quotes to add"
        class="qd__box"
      />
      <p v-if="read" class="qd__read" aria-live="polite">
        <template v-if="fresh.length">
          Will add <strong>{{ fresh.length }}</strong> quote{{ fresh.length === 1 ? '' : 's' }}
          <span class="qd__dim">· read as {{ read.as === 'json' ? 'JSON' : 'lines' }}</span>
        </template>
        <template v-else>Nothing new to add.</template>
        <span v-if="repeats" class="qd__dim"> · {{ repeats }} already saved</span>
      </p>

      <div class="qd__head">
        <span class="qd__label">Saved · {{ quotes.length }}</span>
      </div>
      <ul v-if="quotes.length" class="qd__list" role="list">
        <li v-for="q in [...quotes].reverse()" :key="q.id" class="qd__row">
          <span class="qd__text">
            “{{ q.text }}”<span v-if="q.by" class="qd__by"> — {{ q.by }}</span>
          </span>
          <button
            type="button"
            class="x-round"
            :aria-label="'Delete quote: ' + q.text"
            title="Delete"
            @click="app.removeQuote(q.id)"
          >
            <Icon name="x" size="xs" />
          </button>
        </li>
      </ul>
      <p v-else class="qd__dim qd__empty">
        None yet — the card shows its built-in quotes until you add some.
      </p>
    </div>
    <template #footer>
      <button type="button" class="qd__btn" @click="emit('close')">Done</button>
      <button type="button" class="qd__btn qd__btn--accent" :disabled="!fresh.length" @click="add">
        {{ fresh.length ? `Add ${fresh.length}` : 'Add' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.qd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.qd__hint {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--theme-dim);
}
.qd__hint code {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
}
.qd__read {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.qd__dim {
  color: var(--theme-dim);
}
.qd__head {
  display: flex;
  align-items: center;
  margin-top: 4px;
}
.qd__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.qd__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 34vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.qd__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}
.qd__text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--theme-text);
}
.qd__by {
  font-style: normal;
  color: var(--theme-dim);
}
.qd__empty {
  margin: 0;
  font-size: var(--text-xs);
}
.qd__btn {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.qd__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.qd__btn--accent {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
</style>

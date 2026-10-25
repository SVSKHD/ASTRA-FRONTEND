<script setup lang="ts">
// The trade book rules: a checklist you write and run in the same place.
//
// There used to be two modes — Review (rendered markdown) and Edit (a markdown
// textarea with a toolbar) — and a Save button between them. For a list of
// five rules read before every trade that was three clicks and a syntax to get
// one typo fixed. Now the editor IS the review: the boxes tick while you read,
// lines edit where they sit, and changes save themselves a moment after you
// stop typing. The only thing that still asks is closing with a save that has
// failed, because that is the one case where closing loses something.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettings } from '@/composables/useSettings'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'
import RulesEditor from '@/components/trades/RulesEditor.vue'

const ui = useUiStore()
const store = useSettings()
const { settings, ready } = store
const saved = computed(() => settings.value.tradeBookRules ?? '')
const draft = ref('')
const saving = ref(false)
const error = ref('')
const askDiscard = ref(false)
const dirty = computed(() => draft.value.trim() !== saved.value.trim())

// How long after the last keystroke the rules are written. Long enough not to
// write on every character, short enough that closing right after typing has
// usually already saved.
const AUTOSAVE_MS = 900
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => [ui.tradeRulesOpen, ready.value, store.uid.value],
  () => {
    if (!ui.tradeRulesOpen || !ready.value) return
    clearTimeout(timer)
    draft.value = saved.value
    error.value = ''
    askDiscard.value = false
  },
  { immediate: true },
)

function onDraft(next: string) {
  draft.value = next
  error.value = ''
  clearTimeout(timer)
  timer = setTimeout(() => void save(), AUTOSAVE_MS)
}

async function save(): Promise<boolean> {
  clearTimeout(timer)
  if (!ready.value) return false
  if (!dirty.value) return true
  if (saving.value) {
    // A save is already in flight; try again once it lands.
    timer = setTimeout(() => void save(), AUTOSAVE_MS)
    return false
  }
  saving.value = true
  error.value = ''
  const value = draft.value.trim()
  try {
    if (!(await store.save({ tradeBookRules: value }))) throw new Error('Save failed')
    return true
  } catch {
    error.value = 'Could not save your rules. They are still here — try again.'
    return false
  } finally {
    saving.value = false
  }
}

async function close() {
  if (saving.value) return
  if (dirty.value && !(await save())) {
    askDiscard.value = true
    return
  }
  ui.tradeRulesOpen = false
}
async function saveAndClose() {
  if (await save()) {
    askDiscard.value = false
    ui.tradeRulesOpen = false
  }
}
function discard() {
  clearTimeout(timer)
  askDiscard.value = false
  draft.value = saved.value
  ui.tradeRulesOpen = false
}
onBeforeUnmount(() => clearTimeout(timer))

const status = computed(() => {
  if (error.value) return { tone: 'error', icon: 'alert-circle', text: 'Not saved' } as const
  if (saving.value) return { tone: 'busy', icon: 'loader-2', text: 'Saving…' } as const
  if (dirty.value) return { tone: 'busy', icon: 'pencil', text: 'Editing…' } as const
  return { tone: 'ok', icon: 'check-circle', text: 'Saved' } as const
})
</script>

<template>
  <Modal :open="ui.tradeRulesOpen" title="Trade book rules" size="lg" resizable @close="close">
    <div class="trade-rules__intro">
      <span class="trade-rules__emblem"><Icon name="book-check" size="lg" /></span>
      <div>
        <strong>Your pre-trade checklist</strong>
        <p>Tick each rule before you place a trade. Click any line to edit it.</p>
      </div>
      <span
        v-if="ready"
        class="trade-rules__save"
        :class="'is-' + status.tone"
        role="status"
        aria-live="polite"
        ><Icon :name="status.icon" size="xs" />{{ status.text }}</span
      >
    </div>

    <p v-if="!ready" class="trade-rules__empty" role="status">
      {{ store.error.value || 'Loading your rules...' }}
    </p>
    <RulesEditor v-else :model-value="draft" @update:model-value="onDraft" @save="save()" />

    <Transition name="rules-status">
      <p v-if="error" role="alert" class="trade-rules__status trade-rules__error">
        <Icon name="alert-circle" size="sm" />{{ error }}
        <Button variant="ghost" size="sm" :disabled="saving" @click="save()">Retry</Button>
      </p>
    </Transition>

    <template #footer>
      <span class="trade-rules__resize-hint" title="Drag the bottom-right corner to resize"
        ><Icon name="move-diagonal-2" size="sm" /><span>Drag corner to resize</span></span
      >
      <Button :disabled="saving" @click="close">Done</Button>
    </template>
  </Modal>
  <UnsavedSheet
    :open="askDiscard"
    title="Your latest rule changes did not save"
    :fields="['Trade book rules']"
    @save="saveAndClose"
    @discard="discard"
    @back="askDiscard = false"
  />
</template>

<style scoped>
.trade-rules__intro {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  margin-bottom: var(--sp-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--theme-accent) 8%, transparent),
    var(--glass-card)
  );
}
.trade-rules__emblem {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}
.trade-rules__intro strong {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.trade-rules__intro p {
  margin: var(--sp-1) 0 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.trade-rules__save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 5px 9px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  white-space: nowrap;
  transition: color var(--dur-fast) ease;
}
.trade-rules__save.is-ok {
  color: var(--theme-accent);
}
.trade-rules__save.is-error {
  color: var(--theme-danger);
  border-color: color-mix(in srgb, var(--theme-danger) 40%, transparent);
}
.trade-rules__empty {
  padding: var(--sp-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--glass-card);
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.trade-rules__status {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
}
.trade-rules__error {
  color: var(--theme-danger);
  background: color-mix(in srgb, var(--theme-danger) 8%, transparent);
}
.trade-rules__error :deep(.ui-btn) {
  margin-left: auto;
}
.trade-rules__resize-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-right: auto;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
}
.rules-status-enter-active,
.rules-status-leave-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 240ms var(--ease-out);
}
.rules-status-enter-from {
  opacity: 0;
  transform: translateY(7px);
}
.rules-status-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (max-width: 600px) {
  .trade-rules__intro {
    flex-wrap: wrap;
  }
  .trade-rules__emblem {
    width: 32px;
    height: 32px;
  }
  .trade-rules__save {
    margin-left: 0;
  }
  .trade-rules__resize-hint span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rules-status-enter-active,
  .rules-status-leave-active {
    transition: none;
  }
}
</style>

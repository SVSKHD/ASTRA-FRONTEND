<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettings } from '@/composables/useSettings'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import MarkdownView from '@/components/notes/MarkdownView.vue'
const ui = useUiStore()
const store = useSettings()
const { settings, ready } = store
const saved = computed(() => settings.value.tradeBookRules ?? '')
const draft = ref('')
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const askDiscard = ref(false)
const saveState = computed(() =>
  saving.value
    ? ('working' as const)
    : error.value
      ? ('failed' as const)
      : notice.value
        ? ('done' as const)
        : ('idle' as const),
)
const dirty = computed(() => editing.value && draft.value !== saved.value)
watch(
  () => [ui.tradeRulesOpen, ready.value, store.uid.value],
  () => {
    if (!ui.tradeRulesOpen || !ready.value) return
    draft.value = saved.value
    editing.value = !saved.value.trim()
    error.value = ''
    notice.value = ''
    askDiscard.value = false
  },
  { immediate: true },
)
function close() {
  if (saving.value) return
  if (dirty.value) {
    askDiscard.value = true
    return
  }
  ui.tradeRulesOpen = false
}
function discard() {
  askDiscard.value = false
  ui.tradeRulesOpen = false
}
function edit() {
  draft.value = saved.value
  editing.value = true
  notice.value = ''
}
async function save(closeAfter = false) {
  if (saving.value || !ready.value) return
  saving.value = true
  error.value = ''
  try {
    if (!(await store.save({ tradeBookRules: draft.value.trim() }))) throw new Error('Save failed')
    editing.value = false
    askDiscard.value = false
    notice.value = 'Rules saved.'
    if (closeAfter) ui.tradeRulesOpen = false
  } catch {
    error.value = 'Could not save your rules. Your draft is still here; please try again.'
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <Modal :open="ui.tradeRulesOpen" title="Trade book rules" size="lg" resizable @close="close">
    <div class="trade-rules__intro">
      <span class="trade-rules__emblem"><Icon name="book-check" size="lg" /></span>
      <div>
        <strong>Your pre-trade checklist</strong>
        <p>Your personal rules to review before placing a trade.</p>
      </div>
      <span class="trade-rules__mode"><span></span>{{ editing ? 'Editing' : 'Review' }}</span>
    </div>
    <Transition name="rules-swap" mode="out-in">
      <p v-if="!ready" key="loading" class="trade-rules__empty" role="status">
        {{ store.error.value || 'Loading your rules...' }}
      </p>
      <div v-else-if="editing" key="edit" class="trade-rules__editor">
        <NoteEditor
          v-model="draft"
          compact
          placeholder="Write your trading rules here. Use headings, lists, or checkboxes to keep them clear."
          @save="save()"
        />
      </div>
      <div v-else-if="saved.trim()" key="review" class="trade-rules__paper">
        <MarkdownView :source="saved" />
      </div>
      <p v-else key="empty" class="trade-rules__empty">
        No rules yet. Add your own trade book rules to review here.
      </p>
    </Transition>
    <Transition name="rules-status">
      <p v-if="error" role="alert" class="trade-rules__status trade-rules__error">
        <Icon name="alert-circle" size="sm" />{{ error }}
      </p>
      <p v-else-if="notice" role="status" class="trade-rules__status">
        <Icon name="check-circle" size="sm" />{{ notice }}
      </p>
    </Transition>
    <template #footer>
      <span class="trade-rules__resize-hint" title="Drag the bottom-right corner to resize"
        ><Icon name="move-diagonal-2" size="sm" /><span>Drag corner to resize</span></span
      >
      <Button variant="ghost" :disabled="saving" @click="close">Close</Button>
      <template v-if="ready">
        <Button v-if="!editing" @click="edit">{{
          saved.trim() ? 'Edit rules' : 'Add rules'
        }}</Button>
        <Button v-else :state="saveState" :disabled="saving || !dirty" @click="save()">{{
          saving ? 'Saving...' : 'Save rules'
        }}</Button>
      </template>
    </template>
  </Modal>
  <UnsavedSheet
    :open="askDiscard"
    title="Save your trade book rules?"
    :fields="['Trade book rules']"
    @save="save(true)"
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
.trade-rules__mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 5px 8px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  color: var(--theme-accent);
  font-size: var(--text-2xs);
  white-space: nowrap;
}
.trade-rules__mode > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent) 35%, transparent);
}
.trade-rules__paper,
.trade-rules__empty {
  padding: var(--sp-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--glass-card);
}
.trade-rules__empty {
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.trade-rules__status {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  color: var(--theme-accent);
  font-size: var(--text-xs);
}
.trade-rules__error {
  color: var(--theme-danger);
  background: color-mix(in srgb, var(--theme-danger) 8%, transparent);
}
.trade-rules__resize-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-right: auto;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
}
.rules-swap-enter-active,
.rules-swap-leave-active,
.rules-status-enter-active,
.rules-status-leave-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 240ms var(--ease-out),
    filter 180ms ease;
}
.rules-swap-enter-from,
.rules-status-enter-from {
  opacity: 0;
  transform: translateY(7px);
  filter: blur(2px);
}
.rules-swap-leave-to,
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
  .trade-rules__mode {
    margin-left: 0;
  }
  .trade-rules__resize-hint span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rules-swap-enter-active,
  .rules-swap-leave-active,
  .rules-status-enter-active,
  .rules-status-leave-active {
    transition: none;
  }
}
</style>

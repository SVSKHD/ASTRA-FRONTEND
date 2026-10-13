<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettings } from '@/composables/useSettings'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
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
  <Modal :open="ui.tradeRulesOpen" title="Trade book rules" size="lg" @close="close">
    <p class="trade-rules__intro">Your personal rules to review before placing a trade.</p>
    <p v-if="!ready" role="status">{{ store.error.value || 'Loading your rules...' }}</p>
    <template v-else>
      <NoteEditor
        v-if="editing"
        v-model="draft"
        compact
        placeholder="Write your trading rules here. Use headings, lists, or checkboxes to keep them clear."
        @save="save()"
      />
      <MarkdownView v-else-if="saved.trim()" :source="saved" />
      <p v-else class="trade-rules__empty">
        No rules yet. Add your own trade book rules to review here.
      </p>
    </template>
    <p v-if="error" role="alert" class="trade-rules__error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template #footer>
      <Button variant="ghost" :disabled="saving" @click="close">Close</Button>
      <template v-if="ready">
        <Button v-if="!editing" @click="edit">{{
          saved.trim() ? 'Edit rules' : 'Add rules'
        }}</Button>
        <Button v-else :disabled="saving || !dirty" @click="save()">{{
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
.trade-rules__intro,
.trade-rules__empty {
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.trade-rules__intro {
  margin: 0 0 var(--sp-3);
}
.trade-rules__error {
  color: var(--theme-danger);
  font-size: var(--text-sm);
}
</style>

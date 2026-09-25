<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import Modal from '@/components/ui/Modal.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Button from '@/components/ui/Button.vue'
import { parseTaskTransferJson, type TaskTransferCollection } from '@/utils/taskTransfer'
import { sampleTaskTransferJson } from '@/utils/taskTransferHelp'

const props = defineProps<{ open: boolean; collection: TaskTransferCollection }>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const raw = ref('')
const area = ref<InstanceType<typeof TextArea> | null>(null)

const targetNoun = computed(() => (props.collection === 'todos' ? 'todo' : 'task'))
const title = computed(() => `Paste ${targetNoun.value} JSON`)
const placeholder = computed(
  () => `Paste ${props.collection === 'todos' ? 'todo' : 'task'} JSON here, or use Load sample.`,
)
const hasText = computed(() => raw.value.trim().length > 0)
const parsed = computed(() => parseTaskTransferJson(raw.value, props.collection))
const parsedNoun = computed(() => (parsed.value.collection === 'todos' ? 'todo' : 'task'))
const itemCount = computed(() => parsed.value.items.length)
const parseError = computed(() =>
  hasText.value && parsed.value.parseError
    ? `Could not parse JSON: ${parsed.value.parseError}`
    : '',
)
const canImport = computed(() => hasText.value && !parseError.value && itemCount.value > 0)
const statusClass = computed(() => {
  if (parseError.value || (hasText.value && itemCount.value === 0)) return 'is-error'
  if (itemCount.value > 0) return 'is-ok'
  return ''
})
const statusText = computed(() => {
  if (!hasText.value) return 'Paste a JSON document or array, then import it here.'
  if (parseError.value) return 'Fix the JSON above before importing.'
  if (itemCount.value === 0) return `JSON parsed, but no ${parsedNoun.value} items were found.`
  return `${itemCount.value} ${parsedNoun.value}${itemCount.value === 1 ? '' : 's'} ready to import.`
})
const importLabel = computed(() =>
  itemCount.value > 0
    ? `Import ${itemCount.value} ${parsedNoun.value}${itemCount.value === 1 ? '' : 's'}`
    : 'Import',
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    raw.value = ''
    await nextTick()
    area.value?.focus()
  },
)

function close() {
  emit('close')
}

function loadSample() {
  raw.value = sampleTaskTransferJson(props.collection)
  void nextTick(() => area.value?.focus())
}

async function pasteClipboard() {
  try {
    const text = await navigator.clipboard?.readText()
    if (!text?.trim()) {
      app.showToastMsg('Clipboard is empty')
      return
    }
    raw.value = text
    void nextTick(() => area.value?.focus())
  } catch {
    app.showToastMsg('Could not read clipboard')
  }
}

function importNow() {
  if (!canImport.value) {
    if (!hasText.value) app.showToastMsg('Paste JSON first')
    else if (parseError.value) app.showToastMsg('Fix the JSON before importing')
    else app.showToastMsg(`No ${parsedNoun.value} items found in that JSON`)
    return
  }
  const result = app.importTaskTransferJson(raw.value, props.collection)
  if (result.error) {
    app.showToastMsg('Could not import JSON: ' + result.error)
    return
  }
  if (result.count === 0) {
    app.showToastMsg(`No ${result.collection === 'todos' ? 'todo' : 'task'} items found`)
    return
  }
  app.showToastMsg(
    `Imported ${result.count} ${result.collection === 'todos' ? 'todo' : 'task'}${
      result.count === 1 ? '' : 's'
    }`,
  )
  raw.value = ''
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="title" size="lg" @close="close">
    <div class="tpaste">
      <p class="tpaste__lede">
        Paste exported JSON, an AI-made list, or the sample shape from the helper. A plain array
        also works.
      </p>
      <div class="tpaste__tools">
        <Button variant="secondary" size="sm" @click="pasteClipboard">Paste from clipboard</Button>
        <Button variant="ghost" size="sm" @click="loadSample">Load sample</Button>
      </div>
      <TextArea
        ref="area"
        v-model="raw"
        :label="`${targetNoun} JSON`"
        :placeholder="placeholder"
        :error="parseError"
        :rows="12"
        :auto-grow="false"
      />
      <p class="tpaste__status" :class="statusClass">{{ statusText }}</p>
    </div>

    <template #footer>
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :disabled="!canImport" @click="importNow">{{ importLabel }}</Button>
    </template>
  </Modal>
</template>

<style scoped>
.tpaste {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.tpaste__lede,
.tpaste__status {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
.tpaste__tools {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.tpaste__status.is-ok {
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
}
.tpaste__status.is-error {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
</style>

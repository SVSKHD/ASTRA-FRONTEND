<script setup lang="ts">
// The JSON of a task (or todo) and everything under it, shown rather than
// only downloaded: read it, copy it in one press, or save it as a file. It is
// the transfer format, so a copy pastes straight into "Add more" or Import.
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { copyToClipboard } from '@/utils/share'
import { downloadText } from '@/utils/noteExport'
import Modal from '@/components/ui/Modal.vue'
import Icon from '@/components/ui/Icon.vue'
import TextArea from '@/components/ui/TextArea.vue'

const props = defineProps<{
  open: boolean
  title: string
  json: string
  filename: string
  /** How many items the JSON holds, for the line above it. */
  count: number
}>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.open,
  () => {
    copied.value = false
    clearTimeout(copiedTimer)
  },
)

async function copy() {
  try {
    await copyToClipboard(props.json)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1800)
  } catch {
    app.showToastMsg('Could not copy — select the text and copy it instead')
  }
}
function download() {
  downloadText(props.json, props.filename, 'application/json;charset=utf-8')
  app.showToastMsg('Saved ' + props.filename)
}
</script>

<template>
  <Modal :open="open" :title="'Export “' + title + '”'" size="lg" @close="emit('close')">
    <div class="ej">
      <p class="ej__meta">
        {{ count }} item{{ count === 1 ? '' : 's' }} — this one and every subtask under it. Paste it
        into “Add more” or Import to bring it back.
      </p>
      <TextArea
        class="ej__code"
        :model-value="json"
        readonly
        :rows="16"
        :auto-grow="false"
        aria-label="Exported JSON"
      />
    </div>
    <template #footer>
      <button type="button" class="ej__btn" @click="emit('close')">Close</button>
      <button type="button" class="ej__btn" @click="download">
        <Icon name="download" size="xs" />Download
      </button>
      <button type="button" class="ej__btn ej__btn--accent" @click="copy">
        <Icon :name="copied ? 'check' : 'copy'" size="xs" />{{ copied ? 'Copied' : 'Copy JSON' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.ej {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.ej__meta {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ej__code :deep(textarea) {
  max-height: 60vh;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.55;
  white-space: pre;
  overflow: auto;
}
.ej__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
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
.ej__btn--accent {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
</style>

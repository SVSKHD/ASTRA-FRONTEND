<script setup lang="ts">
// "Add more" under one task or todo: paste JSON (an export, an array, nested
// items) or plain lines, see what will be added, and add it all as subtasks of
// that item. The reading is forgiving — see parseItemsForParent — and the
// preview below the box shows how the paste was read before anything is saved.
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { parseItemsForParent, type TaskTransferCollection } from '@/utils/taskTransfer'
import Modal from '@/components/ui/Modal.vue'
import TextArea from '@/components/ui/TextArea.vue'

const props = defineProps<{
  open: boolean
  collection: TaskTransferCollection
  parentId: number
  parentTitle: string
}>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const text = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) text.value = ''
  },
)

const read = computed(() =>
  text.value.trim() ? parseItemsForParent(text.value, props.collection) : null,
)
const noun = computed(() => (props.collection === 'tasks' ? 'task' : 'todo'))
const count = computed(() => read.value?.items.length ?? 0)

// The first rows of what will be added, indented by how deep they sit.
const preview = computed(() => {
  const items = read.value?.items ?? []
  const depthOf = new Map<string, number>()
  return items.slice(0, 8).map((it) => {
    const d = it.parentSourceId != null ? (depthOf.get(it.parentSourceId) ?? 0) + 1 : 0
    depthOf.set(it.sourceId, d)
    return { title: it.title, depth: d, done: it.status === 'done' }
  })
})

function add() {
  if (!count.value) return
  const result = app.addItemsUnder(props.collection, props.parentId, text.value)
  if (result.error) {
    app.showToastMsg(result.error)
    return
  }
  app.showToastMsg(
    `Added ${result.count} sub${noun.value}${result.count === 1 ? '' : 's'} to "${props.parentTitle}"`,
  )
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="'Add more to “' + parentTitle + '”'" size="md" @close="emit('close')">
    <div class="am">
      <p class="am__hint">
        Paste JSON — an export, a list, or items with their own subtasks — or plain text, one sub{{
          noun
        }}
        per line. Extra spaces, bullets and code fences are fine.
      </p>
      <TextArea
        v-model="text"
        :rows="9"
        placeholder='[{ "title": "Guest checkout" }, { "title": "Quick COD checkout" }]'
        aria-label="Sub-items to add"
        class="am__box"
      />

      <div v-if="read" class="am__preview" aria-live="polite">
        <p v-if="read.error" class="am__error">{{ read.error }}</p>
        <template v-else>
          <p class="am__summary">
            Will add <strong>{{ count }}</strong> sub{{ noun }}{{ count === 1 ? '' : 's' }}
            <span class="am__as">· read as {{ read.as === 'json' ? 'JSON' : 'lines' }}</span>
          </p>
          <ul class="am__list">
            <li
              v-for="(p, i) in preview"
              :key="i"
              :style="{ paddingLeft: 10 + p.depth * 16 + 'px' }"
              :class="{ 'is-done': p.done }"
            >
              {{ p.title }}
            </li>
            <li v-if="count > preview.length" class="am__more">
              + {{ count - preview.length }} more
            </li>
          </ul>
        </template>
      </div>
    </div>

    <template #footer>
      <button type="button" class="am__btn" @click="emit('close')">Cancel</button>
      <button type="button" class="am__btn am__btn--accent" :disabled="!count" @click="add">
        {{ count ? `Add ${count}` : 'Add' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.am {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.am__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.am__box :deep(textarea) {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.am__preview {
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  padding: 10px 4px 8px;
}
.am__summary,
.am__error {
  margin: 0 10px 6px;
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.am__error {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.am__as {
  color: var(--theme-dim);
}
.am__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
}
.am__list li {
  min-width: 0;
  padding-block: 3px;
  padding-right: 10px;
  font-size: var(--text-sm);
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.am__list li.is-done {
  color: var(--theme-dim);
  text-decoration: line-through;
}
.am__list .am__more {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.am__btn {
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
.am__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.am__btn--accent {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
</style>

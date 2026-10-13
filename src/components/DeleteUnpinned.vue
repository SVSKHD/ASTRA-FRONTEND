<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { pinnedTreeIds } from '@/utils/pinnedItems'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
const props = defineProps<{ collection: 'tasks' | 'todos' }>()
const app = useAppStore()
const open = ref(false)
const busy = ref(false)
const items = computed(() => (props.collection === 'tasks' ? app.tasks : app.todos))
const candidates = computed(() => {
  const protectedIds = pinnedTreeIds(items.value, props.collection)
  return items.value
    .filter((item) => item.archivedAt == null && !protectedIds.has(item.id))
    .map((item) => item.id)
})
async function remove() {
  if (busy.value || !candidates.value.length) return
  busy.value = true
  try {
    await app.deleteManyWithProgress(props.collection, candidates.value)
    open.value = false
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <IconButton
    label="Delete unpinned"
    tone="danger"
    :disabled="!candidates.length || busy"
    @click="open = true"
  >
    <Icon name="x" size="sm" />
  </IconButton>
  <Modal :open="open" title="Delete unpinned items" size="sm" @close="!busy && (open = false)">
    <p>
      Delete {{ candidates.length }} unpinned {{ collection }} and their subtasks? This covers the
      whole list, including items hidden by search or filters. Pinned items and their entire parent
      trees are kept.
    </p>
    <template #footer>
      <Button variant="secondary" :disabled="busy" @click="open = false">Cancel</Button>
      <Button variant="danger" :disabled="busy || !candidates.length" @click="remove">{{
        busy ? 'Deleting...' : 'Delete unpinned'
      }}</Button>
    </template>
  </Modal>
</template>

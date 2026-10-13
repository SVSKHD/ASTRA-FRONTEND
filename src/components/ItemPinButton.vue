<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
const props = defineProps<{ collection: 'tasks' | 'todos'; id: number }>()
const app = useAppStore()
const pinned = computed(
  () =>
    (props.collection === 'tasks' ? app.tasks : app.todos).find((item) => item.id === props.id)
      ?.pinned === true,
)
function toggle() {
  if (props.collection === 'tasks') app.patchTask(props.id, { pinned: !pinned.value })
  else app.updateTodo(props.id, { pinned: !pinned.value })
}
</script>
<template>
  <IconButton
    :label="pinned ? 'Unpin item' : 'Pin item'"
    :active="pinned"
    :aria-pressed="pinned"
    @pointerdown.stop
    @click.stop="toggle"
  >
    <Icon :name="pinned ? 'pin-off' : 'pin'" size="sm" />
  </IconButton>
</template>

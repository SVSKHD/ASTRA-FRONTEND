<script setup lang="ts">
// The persistent grab target for a tree row — a six-dot grip, leftmost on every
// row at every depth, on both desktop and mobile. Pointer-down starts a drag
// (touch waits for a long-press inside the engine); the handle is also keyboard-
// focusable and drives keyboard drag mode. The row stays clickable because only
// the handle owns the drag gesture, never the whole row. Opacity/cursor
// affordances live in the .drag-handle CSS.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { useTreeDrag, type TreeCollection } from '@/composables/useTreeDrag'

const props = defineProps<{ collection: TreeCollection; id: number; title: string }>()

const { c } = useStyles()
const { startPointerDrag, onHandleKeydown, isSource } = useTreeDrag()

const dots = [0, 1, 2, 3, 4, 5]
const label = computed(() => (props.collection === 'tasks' ? 'Reorder task' : 'Reorder todo'))
const dragging = computed(() => isSource(props.collection, props.id))

function onDown(e: PointerEvent) {
  startPointerDrag(props.collection, props.id, e, { title: props.title })
}
function onKeydown(e: KeyboardEvent) {
  onHandleKeydown(props.collection, props.id, e)
}
</script>

<template>
  <span
    class="drag-handle"
    :class="{ dragging }"
    :style="{ color: c.dim }"
    role="button"
    tabindex="0"
    :aria-label="label"
    :title="label"
    @pointerdown="onDown"
    @keydown="onKeydown"
    @click.stop
  >
    <span v-for="d in dots" :key="d" class="grip-dot"></span>
  </span>
</template>

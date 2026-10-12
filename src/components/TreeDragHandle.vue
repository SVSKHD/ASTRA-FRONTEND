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

const props = defineProps<{
  collection: TreeCollection
  id: number
  title: string
  selectedIds?: number[]
  hint?: boolean
  nestOnly?: boolean
}>()

const { c } = useStyles()
const { startPointerDrag, onHandleKeydown, isSource } = useTreeDrag()

const dots = [0, 1, 2, 3, 4, 5]
const label = computed(() =>
  props.nestOnly
    ? 'Move subtask to another parent'
    : props.collection === 'tasks'
      ? 'Reorder task'
      : 'Reorder todo',
)
const dragging = computed(() => isSource(props.collection, props.id))

function onDown(e: PointerEvent) {
  startPointerDrag(props.collection, props.id, e, {
    title: props.title,
    nestOnly: props.nestOnly,
    ids: props.selectedIds?.includes(props.id) ? props.selectedIds : [props.id],
  })
}
function onKeydown(e: KeyboardEvent) {
  onHandleKeydown(props.collection, props.id, e)
}
</script>

<template>
  <span
    class="drag-handle"
    :class="{ dragging, 'drag-handle--hint': hint && !dragging }"
    :style="{ color: hint || dragging ? c.accent : c.dim }"
    role="button"
    tabindex="0"
    :aria-label="label"
    :title="
      selectedIds?.includes(id) && selectedIds.length > 1
        ? `Drag ${selectedIds.length} selected items together`
        : nestOnly
          ? 'Drag this subtask onto another parent in the list'
          : 'Drag to reorder or drop onto a parent; hold on touch'
    "
    @pointerdown="onDown"
    @keydown="onKeydown"
    @click.stop
  >
    <span v-for="d in dots" :key="d" class="grip-dot"></span>
  </span>
</template>

<style scoped>
.drag-handle--hint {
  opacity: 1;
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  animation: grip-hint 3.6s ease-in-out infinite;
}
.drag-handle:hover,
.drag-handle:focus-visible {
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
}
@keyframes grip-hint {
  0%,
  16%,
  36%,
  100% {
    transform: translateX(0);
  }
  21%,
  31% {
    transform: translateX(-3px) rotate(-5deg);
  }
  26% {
    transform: translateX(3px) rotate(5deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .drag-handle--hint {
    animation: none;
  }
}
</style>

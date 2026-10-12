<script setup lang="ts">
import { computed } from 'vue'
import { useTreeDrag } from '@/composables/useTreeDrag'
import Icon from '@/components/ui/Icon.vue'
const { drag } = useTreeDrag()
const invalid = computed(() => drag.mode !== 'none' && !drag.valid)
const message = computed(() =>
  invalid.value
    ? 'Cannot drop here'
    : drag.mode === 'nest'
      ? 'Release to move under this parent'
      : drag.mode === 'root'
        ? 'Release to move to top level'
        : drag.mode === 'reorder'
          ? 'Release to reorder'
          : 'Drag onto a parent or between rows',
)
const position = computed(() => ({
  left: Math.max(8, Math.min(drag.x + 16, window.innerWidth - 248)) + 'px',
  top: Math.max(8, Math.min(drag.y + 16, window.innerHeight - 100)) + 'px',
}))
</script>
<template>
  <Teleport to="body">
    <div
      v-if="drag.active && !drag.keyboard"
      class="tree-drag-feedback"
      :class="{ 'is-invalid': invalid }"
      :style="position"
      aria-hidden="true"
    >
      <div class="tree-drag-feedback__title">
        <Icon name="grip" size="sm" /><strong>{{ drag.title }}</strong>
      </div>
      <span>{{ message }}</span>
    </div>
  </Teleport>
</template>
<style scoped>
.tree-drag-feedback {
  position: fixed;
  z-index: 300;
  pointer-events: none;
  width: 240px;
  max-width: calc(100vw - 16px);
  padding: 12px 14px;
  border: 1px solid var(--theme-accent);
  border-radius: var(--radius-card);
  background: var(--glass-solid);
  color: var(--theme-text);
  box-shadow: var(--layer-overlay-shadow);
  backdrop-filter: blur(20px);
  font-size: var(--text-xs);
  animation: drag-lift 160ms ease-out;
}
.tree-drag-feedback__title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  margin-bottom: var(--sp-1);
  font-size: var(--text-sm);
}
.tree-drag-feedback__title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-drag-feedback.is-invalid {
  border-color: var(--theme-danger);
}
@keyframes drag-lift {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tree-drag-feedback {
    animation: none;
  }
}
</style>

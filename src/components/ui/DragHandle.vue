<script setup lang="ts">
// The grip. Cursor and shadow language match section 2b, and it carries its own
// keyboard affordance so reordering is not pointer-only.
withDefaults(defineProps<{ label?: string; dragging?: boolean }>(), { label: 'Drag to reorder' })
</script>

<template>
  <span
    class="ui-grip ui-focus-ring"
    :class="{ 'is-dragging': dragging }"
    role="button"
    tabindex="0"
    :aria-label="label"
    :title="label"
  >
    <span class="ui-grip__dots" aria-hidden="true">⠿</span>
  </span>
</template>

<style scoped>
.ui-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  color: var(--theme-dim);
  cursor: grab;
  user-select: none;
  transition: color var(--dur-fast) var(--ease-out);
}
.ui-grip:hover {
  color: var(--theme-text);
}
.ui-grip.is-dragging {
  cursor: grabbing;
  color: var(--theme-accent);
}
.ui-grip__dots {
  font-size: var(--text-md);
  line-height: 1;
}
</style>

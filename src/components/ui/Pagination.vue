<script setup lang="ts">
// Page controls with a live page count. Disabled ends rather than wrapping —
// wrapping from the last page to the first reads as a glitch.
import { computed } from 'vue'

const props = defineProps<{ page: number; pageCount: number }>()
const emit = defineEmits<{ 'update:page': [number] }>()
const canPrev = computed(() => props.page > 1)
const canNext = computed(() => props.page < props.pageCount)
</script>

<template>
  <nav class="ui-pager" aria-label="Pagination">
    <button
      class="ui-pager__btn ui-focus-ring"
      type="button"
      :disabled="!canPrev"
      aria-label="Previous page"
      @click="emit('update:page', page - 1)"
    >
      ‹
    </button>
    <span class="ui-pager__label" aria-live="polite">{{ page }} / {{ pageCount }}</span>
    <button
      class="ui-pager__btn ui-focus-ring"
      type="button"
      :disabled="!canNext"
      aria-label="Next page"
      @click="emit('update:page', page + 1)"
    >
      ›
    </button>
  </nav>
</template>

<style scoped>
.ui-pager {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-pager__btn {
  min-width: var(--control-sm);
  min-height: var(--control-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  cursor: pointer;
}
.ui-pager__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-pager__label {
  font-size: var(--text-sm);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
</style>

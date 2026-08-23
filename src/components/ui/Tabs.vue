<script setup lang="ts">
// A tab strip with the ARIA tab pattern: arrow keys move between tabs, the
// active one is the only tab stop.
import { ref } from 'vue'

export interface TabItem {
  value: string
  label: string
}

defineProps<{ modelValue: string; tabs: TabItem[] }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const strip = ref<HTMLElement | null>(null)

function move(delta: number) {
  const buttons = Array.from(strip.value?.querySelectorAll('button') ?? []) as HTMLButtonElement[]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = buttons[(index + delta + buttons.length) % buttons.length]
  next?.focus()
  if (next?.dataset.value) emit('update:modelValue', next.dataset.value)
}
</script>

<template>
  <div
    ref="strip"
    class="ui-tabs"
    role="tablist"
    @keydown.right.prevent="move(1)"
    @keydown.left.prevent="move(-1)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="ui-tabs__tab ui-focus-ring"
      :class="{ 'is-active': modelValue === tab.value }"
      type="button"
      role="tab"
      :data-value="tab.value"
      :aria-selected="modelValue === tab.value"
      :tabindex="modelValue === tab.value ? 0 : -1"
      @click="emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  display: flex;
  gap: var(--sp-1);
  border-bottom: 1px solid var(--glass-border);
}
.ui-tabs__tab {
  position: relative;
  padding: var(--sp-2) var(--sp-3);
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.ui-tabs__tab.is-active {
  color: var(--theme-text);
}
/* The active indicator uses the accent gradient pair, so it is the same
   language as a primary button. */
.ui-tabs__tab.is-active::after {
  content: '';
  position: absolute;
  left: var(--sp-2);
  right: var(--sp-2);
  bottom: -1px;
  height: 2px;
  border-radius: var(--radius-pill);
  background: linear-gradient(
    90deg,
    var(--accent-grad-from, var(--theme-accent)),
    var(--accent-grad-to, var(--theme-accent))
  );
}
</style>

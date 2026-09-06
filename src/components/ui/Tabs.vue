<script setup lang="ts">
// A tab strip with the ARIA tab pattern: arrow keys move between tabs, the
// active one is the only tab stop.
import { ref } from 'vue'

export interface TabItem {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue: string
    tabs: TabItem[]
    ariaLabel?: string
    /**
     * Two heights, and only two. `sm` is the strip that shares a row with the
     * page's header actions; `md` is the strip that owns its own row. A call
     * site that could pass its own padding is a call site that will, which is
     * how one tab strip became five slightly different ones.
     */
    size?: 'sm' | 'md'
  }>(),
  { ariaLabel: 'Tabs', size: 'md' },
)
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
    :class="`ui-tabs--${size}`"
    role="tablist"
    :aria-label="ariaLabel"
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
  width: max-content;
  max-width: 100%;
  padding: 4px;
  overflow-x: auto;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--theme-glass);
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    var(--theme-shadow);
}
.ui-tabs--sm {
  padding: 3px;
}
.ui-tabs__tab {
  position: relative;
  flex: 0 0 auto;
  padding: 7px var(--sp-3);
  border: none;
  background: transparent;
  border-radius: var(--radius-pill);
  color: var(--theme-dim);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition:
    color 0.24s ease,
    background 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ui-tabs--sm .ui-tabs__tab {
  padding: 4px 10px;
  font-size: var(--text-xs);
}
.ui-tabs__tab:hover {
  color: var(--theme-text);
  transform: translateY(-1px);
}
.ui-tabs__tab.is-active {
  color: var(--theme-text);
  background: var(--theme-card);
  box-shadow:
    0 4px 14px color-mix(in srgb, var(--theme-accent) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 18%, transparent);
}
.ui-tabs__tab.is-active::after {
  content: '';
  position: absolute;
  left: 22%;
  right: 22%;
  bottom: 3px;
  height: 1px;
  border-radius: var(--radius-pill);
  background: linear-gradient(
    90deg,
    var(--accent-grad-from, var(--theme-accent)),
    var(--accent-grad-to, var(--theme-accent))
  );
  animation: tabGlow 0.3s ease both;
}
@keyframes tabGlow {
  from {
    opacity: 0;
    transform: scaleX(0.35);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-tabs__tab {
    transition: none;
  }
}
</style>

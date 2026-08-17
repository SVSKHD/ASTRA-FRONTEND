<script setup lang="ts">
// An anchored panel: the shared shell behind Dropdown and any inline surface.
// Closes on outside click and on Escape, so no caller has to remember to.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ open: boolean; align?: 'start' | 'end' }>(), {
  align: 'start',
})
const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)

function onPointer(event: MouseEvent) {
  if (!props.open) return
  if (root.value && !root.value.contains(event.target as Node)) emit('close')
}
onMounted(() => document.addEventListener('mousedown', onPointer))
onBeforeUnmount(() => document.removeEventListener('mousedown', onPointer))
</script>

<template>
  <div ref="root" class="ui-popover" @keydown.esc="emit('close')">
    <slot name="trigger" />
    <div v-if="open" class="ui-popover__panel" :class="`is-${align}`">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ui-popover {
  position: relative;
  display: inline-flex;
}
.ui-popover__panel {
  position: absolute;
  top: calc(100% + 6px);
  z-index: 30;
  min-width: 180px;
  padding: var(--sp-2);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  box-shadow: var(--elev-1);
  color: var(--theme-text);
  animation: uiPop var(--dur-fast) var(--ease-out) both;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-popover__panel {
    background: var(--glass-solid);
  }
}
.ui-popover__panel.is-start {
  left: 0;
}
.ui-popover__panel.is-end {
  right: 0;
}
@keyframes uiPop {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>

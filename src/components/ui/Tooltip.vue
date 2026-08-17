<script setup lang="ts">
// A hover/focus tooltip. Shown on focus as well as hover, because a tooltip only
// reachable by pointer is not a tooltip for everyone.
import { ref } from 'vue'

withDefaults(defineProps<{ text: string; placement?: 'top' | 'bottom' }>(), { placement: 'top' })
const shown = ref(false)
</script>

<template>
  <span
    class="ui-tooltip"
    @mouseenter="shown = true"
    @mouseleave="shown = false"
    @focusin="shown = true"
    @focusout="shown = false"
  >
    <slot />
    <span v-if="shown" class="ui-tooltip__bubble" :class="`is-${placement}`" role="tooltip">
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.ui-tooltip {
  position: relative;
  display: inline-flex;
}
.ui-tooltip__bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--glass-solid);
  color: var(--theme-text);
  font-size: var(--text-xs);
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--elev-1);
}
.ui-tooltip__bubble.is-top {
  bottom: calc(100% + 6px);
}
.ui-tooltip__bubble.is-bottom {
  top: calc(100% + 6px);
}
</style>

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
  /* Same rounded glass as the app-wide title tooltip (utils/glassTooltip). */
  padding: 6px 11px;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--theme-text);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--elev-1);
  animation: uiTipIn 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes uiTipIn {
  from {
    opacity: 0;
    transform: translate(-50%, 4px) scale(0.98);
  }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-tooltip__bubble {
    background: var(--glass-solid);
  }
}
.ui-tooltip__bubble.is-top {
  bottom: calc(100% + 6px);
}
.ui-tooltip__bubble.is-bottom {
  top: calc(100% + 6px);
}
</style>

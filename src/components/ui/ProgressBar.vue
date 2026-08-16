<script setup lang="ts">
// A determinate progress line. The fill uses the accent gradient pair so it
// matches the primary button, and falls back to a solid accent where a theme
// defines no gradient.
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; max?: number; label?: string; size?: 'sm' | 'md' }>(),
  { max: 100, size: 'md' },
)
const pct = computed(() => Math.max(0, Math.min(100, (props.value / (props.max || 1)) * 100)))
</script>

<template>
  <div class="ui-progress" :class="`ui-progress--${size}`">
    <div
      class="ui-progress__track"
      role="progressbar"
      :aria-valuenow="value"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-label="label"
    >
      <div class="ui-progress__fill" :style="{ width: pct + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.ui-progress__track {
  width: 100%;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--glass-border) 60%, transparent);
  overflow: hidden;
}
.ui-progress--sm .ui-progress__track {
  height: 4px;
}
.ui-progress--md .ui-progress__track {
  height: 8px;
}
.ui-progress__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: linear-gradient(
    90deg,
    var(--accent-grad-from, var(--theme-accent)),
    var(--accent-grad-to, var(--theme-accent))
  );
  transition: width var(--dur-med) var(--ease-out);
}
</style>

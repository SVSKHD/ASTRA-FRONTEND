<script setup lang="ts">
// A circular progress indicator, sized by prop. The ratio is clamped here so a
// caller that hands over 1.4 draws a full ring rather than an overshoot.
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{ ratio: number; size?: number; stroke?: number; label?: string; color?: string }>(),
  { size: 44, stroke: 4 },
)
const clamped = computed(() => Math.max(0, Math.min(1, props.ratio || 0)))
const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - clamped.value))
const pct = computed(() => Math.round(clamped.value * 100))
// Unique per instance: two rings on a page must not share one gradient node.
const gradientId = `ui-ring-${useId()}`
</script>

<template>
  <svg
    class="ui-ring"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${size} ${size}`"
    role="img"
    :aria-label="label || `${pct}%`"
  >
    <circle
      class="ui-ring__track"
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      :stroke-width="stroke"
    />
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--accent-grad-from, var(--theme-accent))" />
        <stop offset="100%" stop-color="var(--accent-grad-to, var(--theme-accent))" />
      </linearGradient>
    </defs>
    <circle
      class="ui-ring__fill"
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      :stroke="color || `url(#${gradientId})`"
      :stroke-width="stroke"
      stroke-linecap="round"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="offset"
      :transform="`rotate(-90 ${size / 2} ${size / 2})`"
    />
    <text
      v-if="size >= 36"
      class="ui-ring__text"
      :x="size / 2"
      :y="size / 2"
      text-anchor="middle"
      dominant-baseline="central"
    >
      {{ pct }}
    </text>
  </svg>
</template>

<style scoped>
.ui-ring__track {
  stroke: color-mix(in oklch, var(--glass-border) 70%, transparent);
}
.ui-ring__fill {
  transition: stroke-dashoffset var(--dur-med) var(--ease-out);
}
.ui-ring__text {
  fill: var(--theme-text);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
}
</style>

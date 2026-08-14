<script setup lang="ts">
// A small SVG progress ring for goal cards and the detail header. Purely
// presentational — the ratio (0..1) is computed by the caller from the live
// checklist + attached tasks/todos, never stored.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'

const props = withDefaults(
  defineProps<{ ratio: number; size?: number; stroke?: number; label?: boolean }>(),
  { size: 44, stroke: 4, label: true },
)
const { c } = useStyles()

const r = computed(() => (props.size - props.stroke) / 2)
const circ = computed(() => 2 * Math.PI * r.value)
const clamped = computed(() => Math.max(0, Math.min(1, props.ratio || 0)))
const dash = computed(() => `${circ.value * clamped.value} ${circ.value}`)
const pct = computed(() => Math.round(clamped.value * 100))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`0 0 ${size} ${size}`"
    role="img"
    :aria-label="`${pct}% complete`"
  >
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="r"
      fill="none"
      :stroke="c.border"
      :stroke-width="stroke"
    />
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="r"
      fill="none"
      :stroke="c.accent"
      :stroke-width="stroke"
      stroke-linecap="round"
      :stroke-dasharray="dash"
      :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      style="transition: stroke-dasharray 0.35s ease"
    />
    <text
      v-if="label"
      :x="size / 2"
      :y="size / 2"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="size * 0.26"
      font-weight="700"
      :fill="c.text"
    >
      {{ pct }}
    </text>
  </svg>
</template>

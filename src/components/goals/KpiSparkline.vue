<script setup lang="ts">
// A KPI's logged values as a line: geometry computed from data, the same case
// as BotsView's equity sparkline, so it is drawn rather than taken from the set.
// The target is a dashed line, so "how far off" is visible without a number.
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ values: number[]; target: number; width?: number; height?: number }>(),
  { width: 120, height: 28 },
)

const PAD = 2
const geometry = computed(() => {
  const vs = props.values
  const lo = Math.min(...vs, props.target)
  const hi = Math.max(...vs, props.target)
  const span = hi - lo || 1
  const w = props.width - PAD * 2
  const h = props.height - PAD * 2
  const y = (v: number) => PAD + h - ((v - lo) / span) * h
  const x = (i: number) => PAD + (vs.length > 1 ? (i / (vs.length - 1)) * w : w)
  return {
    points: vs.map((v, i) => `${x(i)},${y(v)}`).join(' '),
    last: vs.length ? { x: x(vs.length - 1), y: y(vs[vs.length - 1]) } : null,
    targetY: y(props.target),
  }
})
</script>

<template>
  <svg
    class="kspark"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    role="img"
    :aria-label="`Trend over ${values.length} entries`"
  >
    <line
      class="kspark__target"
      :x1="PAD"
      :x2="width - PAD"
      :y1="geometry.targetY"
      :y2="geometry.targetY"
    />
    <polyline v-if="values.length > 1" class="kspark__line" :points="geometry.points" />
    <circle
      v-if="geometry.last"
      class="kspark__dot"
      :cx="geometry.last.x"
      :cy="geometry.last.y"
      r="2.5"
    />
  </svg>
</template>

<style scoped>
.kspark {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
.kspark__target {
  stroke: color-mix(in oklch, var(--theme-dim) 45%, transparent);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.kspark__line {
  fill: none;
  stroke: var(--kpi-color, var(--theme-accent));
  stroke-width: 1.75;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.kspark__dot {
  fill: var(--kpi-color, var(--theme-accent));
}
</style>

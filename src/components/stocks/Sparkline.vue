<script setup lang="ts">
// A price's recent path as one line, in the colour of the way it went: the
// success tone up, the danger tone down. No axes, no labels; the row beside it
// carries the numbers.
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ values: number[]; width?: number; height?: number; label?: string }>(),
  { width: 96, height: 32, label: 'Price trend' },
)

const geo = computed(() => {
  const v = props.values.filter(Number.isFinite)
  if (v.length < 2) return null
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const pad = 2
  const w = props.width - pad * 2
  const h = props.height - pad * 2
  const pts = v.map((y, i) => [pad + (i / (v.length - 1)) * w, pad + h - ((y - min) / span) * h])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x!.toFixed(1)},${y!.toFixed(1)}`).join('')
  const area = `${line}L${pts[pts.length - 1]![0]!.toFixed(1)},${props.height}L${pad},${props.height}Z`
  return { line, area, up: v[v.length - 1]! >= v[0]! }
})
</script>

<template>
  <svg
    v-if="geo"
    class="spark"
    :class="geo.up ? 'is-up' : 'is-down'"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    role="img"
    :aria-label="`${label}: ${geo.up ? 'up' : 'down'} over the period`"
  >
    <path class="spark__area" :d="geo.area" />
    <path class="spark__line" :d="geo.line" />
  </svg>
  <span v-else class="spark spark--empty" :style="{ width: width + 'px', height: height + 'px' }" />
</template>

<style scoped>
.spark {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
.spark.is-up {
  color: var(--theme-success);
}
.spark.is-down {
  color: var(--theme-danger);
}
.spark__line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.spark__area {
  fill: currentColor;
  opacity: 0.1;
  stroke: none;
}
.spark--empty {
  display: inline-block;
}
</style>

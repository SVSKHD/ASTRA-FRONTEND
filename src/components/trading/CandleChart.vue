<script setup lang="ts">
// Candles with EMA overlays, drawn as SVG. Prices become numbers here ONLY to
// place pixels; every value shown as text stays the server's decimal string.
// Up and down candles differ by SHAPE (hollow vs filled), not by colour alone.
import { computed } from 'vue'

export interface ChartCandle {
  ts: string
  open: string
  high: string
  low: string
  close: string
}
export interface ChartLine {
  name: string
  points: { ts: string; value: string | null }[]
}

const props = defineProps<{ candles: ChartCandle[]; lines?: ChartLine[]; height?: number }>()

const W = 1000
const H = computed(() => props.height ?? 320)
const PAD = 8

const geo = computed(() => {
  const c = props.candles
  if (!c.length) return null
  const hi = Math.max(...c.map((x) => Number(x.high)))
  const lo = Math.min(...c.map((x) => Number(x.low)))
  const span = hi - lo || 1
  const step = (W - PAD * 2) / c.length
  const y = (v: number) => PAD + ((hi - v) / span) * (H.value - PAD * 2)
  const index = new Map(c.map((x, i) => [x.ts, i]))
  const xAt = (i: number) => PAD + step * i + step / 2
  return { step, y, xAt, index, hi, lo }
})

const bodies = computed(() => {
  const g = geo.value
  if (!g) return []
  const w = Math.max(1, g.step * 0.6)
  return props.candles.map((c, i) => {
    const o = Number(c.open)
    const cl = Number(c.close)
    const up = cl >= o
    const top = g.y(Math.max(o, cl))
    const bottom = g.y(Math.min(o, cl))
    return {
      key: c.ts,
      x: g.xAt(i),
      w,
      wickTop: g.y(Number(c.high)),
      wickBottom: g.y(Number(c.low)),
      top,
      h: Math.max(1, bottom - top),
      up,
    }
  })
})

const paths = computed(() => {
  const g = geo.value
  if (!g) return []
  return (props.lines ?? []).map((line, n) => {
    let d = ''
    for (const p of line.points) {
      const i = g.index.get(p.ts)
      if (i === undefined || p.value === null) continue
      d += `${d ? 'L' : 'M'}${g.xAt(i).toFixed(1)},${g.y(Number(p.value)).toFixed(1)}`
    }
    return { name: line.name, d, dash: n % 2 ? '6 4' : '' }
  })
})
</script>

<template>
  <figure class="cc">
    <svg
      v-if="geo"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      class="cc__svg"
      role="img"
      :aria-label="`Candles, high ${candles.length ? 'to low' : ''}`"
    >
      <g v-for="b in bodies" :key="b.key">
        <line :x1="b.x" :x2="b.x" :y1="b.wickTop" :y2="b.wickBottom" class="cc__wick" />
        <rect
          :x="b.x - b.w / 2"
          :y="b.top"
          :width="b.w"
          :height="b.h"
          :class="b.up ? 'cc__up' : 'cc__down'"
        />
      </g>
      <path
        v-for="p in paths"
        :key="p.name"
        :d="p.d"
        class="cc__line"
        :stroke-dasharray="p.dash"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <figcaption class="cc__legend">
      <span>Hollow = close above open · filled = close below open</span>
      <span v-for="(p, n) in paths" :key="p.name">{{ n % 2 ? '- - -' : '———' }} {{ p.name }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.cc {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.cc__svg {
  width: 100%;
  height: 320px;
}
.cc__wick {
  stroke: var(--text-secondary);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.cc__up {
  fill: transparent;
  stroke: var(--theme-success);
  vector-effect: non-scaling-stroke;
}
.cc__down {
  fill: var(--theme-danger);
  stroke: var(--theme-danger);
  vector-effect: non-scaling-stroke;
}
.cc__line {
  fill: none;
  stroke: var(--theme-accent);
  stroke-width: 1.5;
}
.cc__legend {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  min-width: 0;
}
</style>

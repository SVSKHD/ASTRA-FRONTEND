<script setup lang="ts">
// Saving versus wasting, as one picture (section 35b).
//
// Two lines over the month: where spending IS (cumulative) and where it would
// be if the budget were spent evenly (pace). The gap between them is the whole
// story, so the gap is what gets the colour — green where the month is under
// its pace, red where it is over — and a dashed line carries today's rate on to
// the month's end.
//
// Drawn rather than taken from the icon set: geometry computed from data, the
// same case as KpiSparkline and BotsView's equity line.
//
// HOVER (section 35d): a crosshair on the day under the pointer and a card with
// that day's figures, instantly — arrow keys walk the days from the keyboard.
import { computed, ref } from 'vue'
import ChartTip, { type TipRow } from '@/components/expenses/ChartTip.vue'
import { amount2 } from '@/utils/format'
import type { DayPoint } from '@/utils/expensePlan'

const props = defineProps<{
  series: DayPoint[]
  budget: number
  monthDays: number
  projected: number
}>()

const W = 640
const H = 220
const PAD = { top: 12, right: 12, bottom: 24, left: 52 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

const top = computed(() => {
  const last = props.series[props.series.length - 1]?.cumulative ?? 0
  const peak = Math.max(props.budget, last, props.projected, 1)
  return peak * 1.08
})

const x = (day: number) => PAD.left + (day / Math.max(1, props.monthDays)) * plotW
const y = (value: number) => PAD.top + plotH - (value / top.value) * plotH

/** Day 0 at zero, so both lines start from the same corner. */
const points = computed(() => [
  { day: 0, cumulative: 0, pace: 0 },
  ...props.series.map((d) => ({ day: d.day, cumulative: d.cumulative, pace: d.pace })),
])

const actualPath = computed(() =>
  points.value.map((p) => `${x(p.day).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(' '),
)

const pacePath = computed(() =>
  props.budget > 0 ? `${x(0)},${y(0)} ${x(props.monthDays)},${y(props.budget)}` : '',
)

const last = computed(() => points.value[points.value.length - 1])

const projectionPath = computed(() => {
  const end = last.value
  if (end.day >= props.monthDays || props.series.length === 0) return ''
  return `${x(end.day)},${y(end.cumulative)} ${x(props.monthDays)},${y(props.projected)}`
})

/**
 * The gap, split into polygons by which side of the pace line it is on. Where a
 * segment crosses the line it is cut at the crossing, so no sliver of green
 * sits on the wrong side.
 */
const gaps = computed(() => {
  if (props.budget <= 0) return { saved: [] as string[], over: [] as string[] }
  const saved: string[] = []
  const over: string[] = []
  const pts = points.value
  const poly = (vs: [number, number][]) =>
    vs.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]
    const b = pts[i]
    const da = a.pace - a.cumulative
    const db = b.pace - b.cumulative
    if (da === 0 && db === 0) continue
    if (da >= 0 === db >= 0) {
      const shape = poly([
        [a.day, a.cumulative],
        [b.day, b.cumulative],
        [b.day, b.pace],
        [a.day, a.pace],
      ])
      ;(da + db >= 0 ? saved : over).push(shape)
      continue
    }
    const t = da / (da - db)
    const cd = a.day + (b.day - a.day) * t
    const cv = a.cumulative + (b.cumulative - a.cumulative) * t
    const first = poly([
      [a.day, a.cumulative],
      [cd, cv],
      [a.day, a.pace],
    ])
    const second = poly([
      [cd, cv],
      [b.day, b.cumulative],
      [b.day, b.pace],
    ])
    ;(da >= 0 ? saved : over).push(first)
    ;(db >= 0 ? saved : over).push(second)
  }
  return { saved, over }
})

const yTicks = computed(() => [0, 0.5, 1].map((f) => (top.value / 1.08) * f))
const xTicks = computed(() =>
  [1, 10, 20, props.monthDays].filter((d, i, all) => all.indexOf(d) === i),
)

// ---- hover -------------------------------------------------------------

const svg = ref<SVGSVGElement | null>(null)
const hoverDay = ref<number | null>(null)

function dayAt(clientX: number): number {
  const rect = svg.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return 1
  const vx = ((clientX - rect.left) / rect.width) * W
  const day = Math.round(((vx - PAD.left) / plotW) * props.monthDays)
  return Math.min(props.monthDays, Math.max(1, day))
}

function onMove(ev: PointerEvent) {
  hoverDay.value = dayAt(ev.clientX)
}

function onKey(ev: KeyboardEvent) {
  const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  ev.preventDefault()
  const from = hoverDay.value ?? last.value.day
  hoverDay.value = Math.min(props.monthDays, Math.max(1, from + step))
}

const hovered = computed(() => {
  const day = hoverDay.value
  if (day === null) return null
  const point = props.series.find((d) => d.day === day) ?? null
  const pace = props.budget > 0 ? (props.budget * day) / props.monthDays : 0
  return { day, point, pace }
})

const tip = computed(() => {
  const h = hovered.value
  if (!h) return null
  const rows: TipRow[] = []
  if (h.point) {
    rows.push({ label: 'Spent that day', value: amount2(h.point.spent) })
    rows.push({ label: 'Spent so far', value: amount2(h.point.cumulative) })
  } else if (h.day > last.value.day && projectionPath.value) {
    const est =
      last.value.cumulative +
      ((props.projected - last.value.cumulative) * (h.day - last.value.day)) /
        Math.max(1, props.monthDays - last.value.day)
    rows.push({ label: 'Projected by then', value: amount2(est), tone: 'warn' })
  }
  if (props.budget > 0) {
    rows.push({ label: 'Even pace', value: amount2(h.pace) })
    if (h.point) {
      const gap = h.pace - h.point.cumulative
      rows.push({
        label: gap >= 0 ? 'Under pace' : 'Over pace',
        value: amount2(Math.abs(gap)),
        tone: gap >= 0 ? 'pos' : 'neg',
      })
    }
  }
  return { at: x(h.day) / W, title: h.point?.date ?? `Day ${h.day}`, rows }
})

const summary = computed(() => {
  const end = last.value
  const gap = end.pace - end.cumulative
  if (props.budget <= 0)
    return `Spent ${amount2(end.cumulative)} so far. No budget to pace against.`
  return gap >= 0
    ? `Spent ${amount2(end.cumulative)} by day ${end.day}, ${amount2(gap)} under the even pace.`
    : `Spent ${amount2(end.cumulative)} by day ${end.day}, ${amount2(gap)} over the even pace.`
})
</script>

<template>
  <figure class="pace">
    <figcaption class="pace__head">
      <span class="ui-label">Spending pace</span>
      <span class="pace__summary">{{ summary }}</span>
    </figcaption>
    <div class="pace__plot">
      <svg
        ref="svg"
        class="pace__svg"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        tabindex="0"
        :aria-label="`${summary} Use the arrow keys to read each day.`"
        preserveAspectRatio="xMidYMid meet"
        @pointermove="onMove"
        @pointerleave="hoverDay = null"
        @keydown="onKey"
        @blur="hoverDay = null"
      >
        <g class="pace__grid">
          <line
            v-for="t in yTicks"
            :key="`y${t}`"
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="y(t)"
            :y2="y(t)"
          />
        </g>
        <g class="pace__axis">
          <text
            v-for="t in yTicks"
            :key="`yl${t}`"
            :x="PAD.left - 6"
            :y="y(t) + 4"
            text-anchor="end"
          >
            {{ Math.round(t).toLocaleString() }}
          </text>
          <text v-for="d in xTicks" :key="`xl${d}`" :x="x(d)" :y="H - 6" text-anchor="middle">
            {{ d }}
          </text>
        </g>

        <polygon v-for="(p, i) in gaps.saved" :key="`s${i}`" class="pace__saved" :points="p" />
        <polygon v-for="(p, i) in gaps.over" :key="`o${i}`" class="pace__over" :points="p" />

        <polyline v-if="pacePath" class="pace__pace" :points="pacePath" />
        <polyline v-if="projectionPath" class="pace__proj" :points="projectionPath" />
        <polyline class="pace__actual" :points="actualPath" />
        <circle
          v-if="series.length"
          class="pace__dot"
          :cx="x(last.day)"
          :cy="y(last.cumulative)"
          r="3.5"
        />

        <g v-if="hovered" class="pace__hover" aria-hidden="true">
          <line :x1="x(hovered.day)" :x2="x(hovered.day)" :y1="PAD.top" :y2="PAD.top + plotH" />
          <circle
            v-if="budget > 0"
            class="pace__hoverPace"
            :cx="x(hovered.day)"
            :cy="y(hovered.pace)"
            r="3.5"
          />
          <circle
            v-if="hovered.point"
            class="pace__hoverDot"
            :cx="x(hovered.day)"
            :cy="y(hovered.point.cumulative)"
            r="5"
          />
        </g>
        <!-- The whole plot answers the pointer, not only the thin lines. -->
        <rect
          class="pace__hit"
          :x="PAD.left"
          :y="PAD.top"
          :width="plotW"
          :height="plotH"
          aria-hidden="true"
        />
      </svg>
      <ChartTip v-if="tip" :at="tip.at" :title="tip.title" :rows="tip.rows" />
    </div>
    <ul class="pace__legend">
      <li><span class="pace__key pace__key--actual" aria-hidden="true"></span>Spent so far</li>
      <li v-if="budget > 0">
        <span class="pace__key pace__key--pace" aria-hidden="true"></span>Even pace to budget
      </li>
      <li v-if="projectionPath">
        <span class="pace__key pace__key--proj" aria-hidden="true"></span>Projected
      </li>
      <li v-if="budget > 0">
        <span class="pace__key pace__key--saved" aria-hidden="true"></span>Saved (under pace)
      </li>
      <li v-if="budget > 0">
        <span class="pace__key pace__key--over" aria-hidden="true"></span>Wasted (over pace)
      </li>
    </ul>
  </figure>
</template>

<style scoped>
.pace {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.pace__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pace__summary {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.pace__plot {
  position: relative;
  min-width: 0;
}
.pace__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  cursor: crosshair;
  touch-action: pan-y;
}
.pace__svg:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}
.pace__hit {
  fill: transparent;
}
.pace__hover line {
  stroke: var(--text-secondary, var(--theme-dim));
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.pace__hoverDot {
  fill: var(--theme-accent);
  stroke: var(--layer-raised-bg);
  stroke-width: 2;
}
.pace__hoverPace {
  fill: var(--layer-raised-bg);
  stroke: var(--theme-dim);
  stroke-width: 1.5;
}
.pace__grid line {
  stroke: color-mix(in oklch, var(--theme-dim) 25%, transparent);
  stroke-width: 1;
}
.pace__axis text {
  fill: var(--text-muted, var(--theme-dim));
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}
.pace__saved {
  fill: color-mix(in oklch, var(--theme-success) 28%, transparent);
}
.pace__over {
  fill: color-mix(in oklch, var(--theme-danger) 30%, transparent);
}
.pace__pace {
  fill: none;
  stroke: var(--theme-dim);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.pace__proj {
  fill: none;
  stroke: var(--theme-accent);
  stroke-width: 1.5;
  stroke-dasharray: 2 4;
  stroke-linecap: round;
}
.pace__actual {
  fill: none;
  stroke: var(--theme-accent);
  stroke-width: 2.25;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.pace__dot {
  fill: var(--theme-accent);
}
.pace__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.pace__legend li {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.pace__key {
  display: inline-block;
  flex-shrink: 0;
  width: 14px;
  height: 0;
  border-top: 2px solid var(--theme-accent);
}
.pace__key--pace {
  border-top: 2px dashed var(--theme-dim);
}
.pace__key--proj {
  border-top: 2px dotted var(--theme-accent);
}
.pace__key--saved,
.pace__key--over {
  height: 10px;
  border: none;
  border-radius: 2px;
}
.pace__key--saved {
  background: color-mix(in oklch, var(--theme-success) 45%, transparent);
}
.pace__key--over {
  background: color-mix(in oklch, var(--theme-danger) 45%, transparent);
}
</style>

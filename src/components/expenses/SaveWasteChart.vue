<script setup lang="ts">
// Each day against its share of the budget (section 35b).
//
// A day that spent less than an even share of the budget is a bar UP, in green:
// money saved. A day that spent more is a bar DOWN, in red: money over. The
// avoidable part of a day's spending is drawn inside its bar in full strength,
// so the days where the overspend was waste rather than need stand out.
//
// Direction carries the meaning as well as colour, and the totals under the
// chart say it again in words.
//
// HOVER (section 35d): the day under the pointer is lit and the others dim, with
// a card of that day's figures beside it — instant, and walkable by arrow keys.
import { computed, ref } from 'vue'
import ChartTip, { type TipRow } from '@/components/expenses/ChartTip.vue'
import { amount2 } from '@/utils/format'
import { round2 } from '@/utils/tradeMath'
import type { DayPoint } from '@/utils/expensePlan'

const props = defineProps<{ series: DayPoint[]; monthDays: number; budget: number }>()

const W = 640
const H = 200
const PAD = { top: 10, right: 8, bottom: 22, left: 52 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

const extent = computed(() => {
  let up = 1
  let down = 1
  for (const d of props.series) {
    up = Math.max(up, d.saved)
    down = Math.max(down, -d.saved, d.avoidable)
  }
  return { up, down }
})

/** Zero sits where the two extents meet, so a big overspend does not flatten the savings. */
const zeroY = computed(
  () => PAD.top + (extent.value.up / (extent.value.up + extent.value.down)) * plotH,
)
const scale = computed(() => plotH / (extent.value.up + extent.value.down))

const slot = computed(() => plotW / Math.max(1, props.monthDays))
const barW = computed(() => Math.max(2, slot.value * 0.68))

const bars = computed(() =>
  props.series.map((d) => {
    const cx = PAD.left + (d.day - 0.5) * slot.value
    const h = Math.abs(d.saved) * scale.value
    const up = d.saved >= 0
    return {
      ...d,
      x: cx - barW.value / 2,
      y: up ? zeroY.value - h : zeroY.value,
      h: Math.max(h, d.spent > 0 || d.saved !== 0 ? 1 : 0),
      up,
      // Avoidable spend, hanging below zero from the same slot.
      wasteH: d.avoidable * scale.value,
    }
  }),
)

const totals = computed(() => {
  const savedDays = props.series.filter((d) => d.saved >= 0)
  const overDays = props.series.filter((d) => d.saved < 0)
  return {
    savedDays: savedDays.length,
    saved: round2(savedDays.reduce((s, d) => s + d.saved, 0)),
    overDays: overDays.length,
    over: round2(overDays.reduce((s, d) => s - d.saved, 0)),
    avoidable: round2(props.series.reduce((s, d) => s + d.avoidable, 0)),
  }
})

const xTicks = computed(() =>
  [1, 10, 20, props.monthDays].filter((d, i, all) => all.indexOf(d) === i),
)

// ---- hover -------------------------------------------------------------

const svg = ref<SVGSVGElement | null>(null)
const hoverDay = ref<number | null>(null)
const lastDay = computed(() => props.series[props.series.length - 1]?.day ?? 1)

function onMove(ev: PointerEvent) {
  const rect = svg.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return
  const vx = ((ev.clientX - rect.left) / rect.width) * W
  const day = Math.floor((vx - PAD.left) / slot.value) + 1
  // Only days that have happened have a bar to read.
  hoverDay.value = day >= 1 && day <= lastDay.value ? day : null
}

function onKey(ev: KeyboardEvent) {
  const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
  if (!step || !props.series.length) return
  ev.preventDefault()
  const from = hoverDay.value ?? lastDay.value
  hoverDay.value = Math.min(lastDay.value, Math.max(1, from + step))
}

const tip = computed(() => {
  const d = props.series.find((p) => p.day === hoverDay.value)
  if (!d) return null
  const rows: TipRow[] = [
    { label: 'Spent', value: amount2(d.spent) },
    { label: 'Day’s share', value: amount2(round2(d.spent + d.saved)) },
    d.saved >= 0
      ? { label: 'Saved', value: amount2(d.saved), tone: 'pos' }
      : { label: 'Over', value: amount2(-d.saved), tone: 'neg' },
  ]
  if (d.avoidable > 0) rows.push({ label: 'Avoidable', value: amount2(d.avoidable), tone: 'neg' })
  return { at: (PAD.left + (d.day - 0.5) * slot.value) / W, title: d.date, rows }
})

const label = computed(
  () =>
    `Saved on ${totals.value.savedDays} days, ${amount2(totals.value.saved)} in all. Over on ${totals.value.overDays} days, ${amount2(totals.value.over)} in all.`,
)
</script>

<template>
  <figure class="sw">
    <figcaption class="sw__head">
      <span class="ui-label">Saved vs wasted, by day</span>
      <span class="sw__summary">
        {{ budget > 0 ? label : 'Set a budget to measure each day against its share.' }}
      </span>
    </figcaption>

    <div v-if="budget > 0" class="sw__plot">
      <svg
        ref="svg"
        class="sw__svg"
        :class="{ 'is-hovering': hoverDay !== null }"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        tabindex="0"
        :aria-label="`${label} Use the arrow keys to read each day.`"
        preserveAspectRatio="xMidYMid meet"
        @pointermove="onMove"
        @pointerleave="hoverDay = null"
        @keydown="onKey"
        @blur="hoverDay = null"
      >
        <rect
          v-if="hoverDay !== null"
          class="sw__band"
          :x="PAD.left + (hoverDay - 1) * slot"
          :y="PAD.top"
          :width="slot"
          :height="plotH"
          aria-hidden="true"
        />
        <line class="sw__zero" :x1="PAD.left" :x2="W - PAD.right" :y1="zeroY" :y2="zeroY" />
        <g class="sw__axis">
          <text :x="PAD.left - 6" :y="PAD.top + 8" text-anchor="end">
            +{{ Math.round(extent.up).toLocaleString() }}
          </text>
          <text :x="PAD.left - 6" :y="zeroY + 4" text-anchor="end">0</text>
          <text :x="PAD.left - 6" :y="H - PAD.bottom" text-anchor="end">
            −{{ Math.round(extent.down).toLocaleString() }}
          </text>
          <text
            v-for="d in xTicks"
            :key="d"
            :x="PAD.left + (d - 0.5) * slot"
            :y="H - 6"
            text-anchor="middle"
          >
            {{ d }}
          </text>
        </g>
        <g v-for="b in bars" :key="b.date" class="sw__day" :class="{ 'is-on': b.day === hoverDay }">
          <rect
            :class="b.up ? 'sw__save' : 'sw__over'"
            :x="b.x"
            :y="b.y"
            :width="barW"
            :height="b.h"
            rx="1.5"
          />
          <rect
            v-if="b.wasteH > 0"
            class="sw__waste"
            :x="b.x + barW * 0.25"
            :y="zeroY"
            :width="barW * 0.5"
            :height="b.wasteH"
            rx="1"
          />
        </g>
        <rect
          class="sw__hit"
          :x="PAD.left"
          :y="PAD.top"
          :width="plotW"
          :height="plotH"
          aria-hidden="true"
        />
      </svg>
      <ChartTip v-if="tip" :at="tip.at" :title="tip.title" :rows="tip.rows" />
    </div>

    <dl v-if="budget > 0" class="sw__totals">
      <div>
        <dt><span class="sw__key sw__key--save" aria-hidden="true"></span>Saved</dt>
        <dd class="ui-tabular is-pos">{{ amount2(totals.saved) }}</dd>
        <dd class="sw__sub">{{ totals.savedDays }} days under</dd>
      </div>
      <div>
        <dt><span class="sw__key sw__key--over" aria-hidden="true"></span>Over</dt>
        <dd class="ui-tabular is-neg">{{ amount2(totals.over) }}</dd>
        <dd class="sw__sub">{{ totals.overDays }} days over</dd>
      </div>
      <div>
        <dt><span class="sw__key sw__key--waste" aria-hidden="true"></span>Avoidable</dt>
        <dd class="ui-tabular is-neg">{{ amount2(totals.avoidable) }}</dd>
        <dd class="sw__sub">money that bought nothing</dd>
      </div>
    </dl>
  </figure>
</template>

<style scoped>
.sw {
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
.sw__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sw__summary {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.sw__plot {
  position: relative;
  min-width: 0;
}
.sw__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  cursor: crosshair;
  touch-action: pan-y;
}
.sw__svg:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}
.sw__hit {
  fill: transparent;
}
.sw__band {
  fill: color-mix(in oklch, var(--text-primary, currentcolor) 7%, transparent);
}
/* The lit day stays full strength and the rest step back: opacity only, the
   one property a compositor changes without repainting. */
.sw__day {
  transition: opacity 100ms var(--ease-out);
}
.sw__svg.is-hovering .sw__day:not(.is-on) {
  opacity: 0.35;
}
@media (prefers-reduced-motion: reduce) {
  .sw__day {
    transition: none;
  }
}
.sw__zero {
  stroke: color-mix(in oklch, var(--theme-dim) 55%, transparent);
  stroke-width: 1;
}
.sw__axis text {
  fill: var(--text-muted, var(--theme-dim));
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}
.sw__save {
  fill: color-mix(in oklch, var(--theme-success) 70%, transparent);
}
.sw__over {
  fill: color-mix(in oklch, var(--theme-danger) 45%, transparent);
}
.sw__waste {
  fill: var(--theme-danger);
}
.sw__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
}
.sw__totals > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.sw__totals dt {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.sw__totals dd {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-md);
  line-height: var(--lh-md);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.sw__totals dd.sw__sub {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: inherit;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-normal);
  color: var(--text-muted, var(--theme-dim));
}
.is-pos {
  color: var(--theme-success);
}
.is-neg {
  color: var(--theme-danger);
}
.sw__key {
  display: inline-block;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.sw__key--save {
  background: color-mix(in oklch, var(--theme-success) 70%, transparent);
}
.sw__key--over {
  background: color-mix(in oklch, var(--theme-danger) 45%, transparent);
}
.sw__key--waste {
  background: var(--theme-danger);
}
</style>

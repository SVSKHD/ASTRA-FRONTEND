<script setup lang="ts">
// Candles, volume, indicator overlays and sub-panes, drawn as SVG by hand.
//
// Prices become numbers here ONLY to place pixels; every candle value shown as text
// (tooltip, legend, last-price tag) stays the server's decimal string. Indicator values
// show what their source gave: the server's string, or the browser's rounding, and the
// legend says which. Up and down candles differ by SHAPE (hollow vs filled), not by
// colour alone; markers carry a letter and a direction as well as a colour.
//
// Only the candles inside the view are drawn (src/trading/chartView.ts), so a few
// thousand candles cost what the visible hundred cost. Pan and zoom: drag, wheel or
// trackpad, pinch on touch, and the keyboard (arrows pan, + / − zoom, Home / End).
//
// No charting library: the chart needs candles, lines, histograms and markers, which
// is a few hundred lines of SVG, and a library would add 40–200 kB gzip, its own theme
// system (fighting the tokens) and a canvas the tests cannot read.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { dec } from '@/trading/format'
import type { SeriesLine } from '@/trading/studies'
import {
  atLatest,
  axisLabel,
  clampView,
  fullTime,
  initialView,
  keyView,
  labelEvery,
  niceTicks,
  panView,
  stepDecimals,
  visibleRange,
  zoomView,
  type Timeframe,
  type View,
} from '@/trading/chartView'

export interface ChartCandle {
  ts: string
  open: string
  high: string
  low: string
  close: string
  volume?: string | null
}
/** Server lines keyed by timestamp (the MT5 panel's EMAs). */
export interface ChartLine {
  name: string
  points: { ts: string; value: string | null }[]
}
/** A study: one or more lines aligned to `candles` by index. */
export interface ChartGroup {
  id: string
  label: string
  /** 'server' or 'browser' — the legend says where the values came from. */
  source?: string
  lines: SeriesLine[]
  range?: [number, number]
  guides?: number[]
}
export interface ChartMarker {
  index: number
  kind: 'buy' | 'sell' | 'bull' | 'bear'
  /** False for a marker on the live (unconfirmed) candle. */
  confirmed: boolean
  label: string
}

const props = withDefaults(
  defineProps<{
    candles: ChartCandle[]
    lines?: ChartLine[]
    overlays?: ChartGroup[]
    panes?: ChartGroup[]
    markers?: ChartMarker[]
    /** The newest candle's period has not ended: drawn dashed and labelled. */
    unconfirmedLast?: boolean
    timeframe?: Timeframe
    height?: number
    label?: string
  }>(),
  {
    lines: () => [],
    overlays: () => [],
    panes: () => [],
    markers: () => [],
    unconfirmedLast: false,
    timeframe: '15m',
    height: 320,
    label: 'Candle chart',
  },
)

const AXIS_W = 64
const TIME_H = 22
const GAP = 6
const SUB_H = 96

const root = ref<HTMLElement | null>(null)
const plot = ref<HTMLElement | null>(null)
const width = ref(800)
const rootH = ref(0)
const fullscreen = ref(false)
/** True when the Fullscreen API was unavailable or refused, so CSS fills the window. */
const cssFull = ref(false)

const total = computed(() => props.candles.length)
const view = ref<View>(initialView(props.candles.length))
const times = computed(() => props.candles.map((c) => Date.parse(c.ts)))

// Keep the view sensible when the data changes: a different series starts over at the
// newest candles; more candles on the same series keep following if it was following.
watch(
  () => [props.candles[0]?.ts, props.candles.length] as const,
  ([first, n], [prevFirst, prevN]) => {
    if (first !== prevFirst) view.value = initialView(n)
    else if (atLatest(view.value, prevN ?? 0)) view.value = panView(view.value, n - (prevN ?? 0), n)
    else view.value = clampView(view.value, n)
  },
)

const range = computed(() => visibleRange(view.value, total.value))
const span = computed(() => view.value.end - view.value.start)
const plotW = computed(() => Math.max(60, width.value - AXIS_W))
const barPx = computed(() => plotW.value / span.value)
const xOf = (i: number) => (i - view.value.start + 0.5) * barPx.value

const legacyGroups = computed<ChartGroup[]>(() => {
  const idx = new Map(times.value.map((t, i) => [t, i]))
  const colors = [
    'var(--theme-accent)',
    'var(--theme-warning)',
    'var(--theme-info, var(--theme-accent))',
  ]
  return props.lines.map((l, n) => {
    const values: (number | null)[] = new Array(total.value).fill(null)
    const display: (string | null)[] = new Array(total.value).fill(null)
    for (const p of l.points) {
      const i = idx.get(Date.parse(p.ts))
      if (i === undefined || p.value === null) continue
      values[i] = Number(p.value)
      display[i] = p.value
    }
    return {
      id: `legacy-${n}`,
      label: l.name,
      source: 'server',
      lines: [
        {
          key: 'value',
          label: l.name,
          color: colors[n % colors.length],
          values,
          display,
          style: n % 2 ? 'dashed' : 'line',
        },
      ],
    }
  })
})
const overlayGroups = computed(() => [...legacyGroups.value, ...props.overlays])

const hasVolume = computed(() =>
  props.candles.some((c) => c.volume != null && Number(c.volume) > 0),
)

const layout = computed(() => {
  const nPanes = props.panes.length
  let priceH = props.height
  let volH = hasVolume.value ? Math.round(priceH * 0.22) : 0
  if (fullscreen.value && rootH.value > 0) {
    const avail = Math.max(240, rootH.value - 140 - nPanes * (SUB_H + GAP) - TIME_H)
    volH = hasVolume.value ? Math.round(avail * 0.18) : 0
    priceH = avail - volH
  }
  const volTop = priceH + (volH ? GAP : 0)
  const paneTops = props.panes.map((_, i) => volTop + volH + GAP + i * (SUB_H + GAP))
  const timeTop = (nPanes ? paneTops[nPanes - 1] + SUB_H : volTop + volH) + 4
  return { priceH, volH, volTop, paneTops, timeTop, H: timeTop + TIME_H }
})

const prices = computed(() => {
  const [a, b] = range.value
  let hi = -Infinity
  let lo = Infinity
  for (let i = a; i < b; i++) {
    const c = props.candles[i]
    hi = Math.max(hi, Number(c.high))
    lo = Math.min(lo, Number(c.low))
  }
  for (const g of overlayGroups.value)
    for (const l of g.lines)
      for (let i = a; i < b; i++) {
        const v = l.values[i]
        if (v === null || v === undefined || !Number.isFinite(v)) continue
        hi = Math.max(hi, v)
        lo = Math.min(lo, v)
      }
  if (!Number.isFinite(hi)) return { hi: 1, lo: 0 }
  const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.06
  return { hi: hi + pad, lo: lo - pad }
})
const yPrice = (v: number) =>
  ((prices.value.hi - v) / (prices.value.hi - prices.value.lo)) * layout.value.priceH
const priceAt = (y: number) =>
  prices.value.hi - (y / layout.value.priceH) * (prices.value.hi - prices.value.lo)

const priceTicks = computed(() => {
  const t = niceTicks(
    prices.value.lo,
    prices.value.hi,
    Math.max(3, Math.round(layout.value.priceH / 60)),
  )
  const dp = stepDecimals(t)
  return t.map((v) => ({ y: yPrice(v), text: v.toFixed(dp) }))
})

const bodies = computed(() => {
  const [a, b] = range.value
  const w = Math.max(1, Math.min(barPx.value * 0.7, 24))
  const out = []
  for (let i = a; i < b; i++) {
    const c = props.candles[i]
    const o = Number(c.open)
    const cl = Number(c.close)
    const top = yPrice(Math.max(o, cl))
    const bottom = yPrice(Math.min(o, cl))
    out.push({
      key: c.ts,
      x: xOf(i),
      w,
      wickTop: yPrice(Number(c.high)),
      wickBottom: yPrice(Number(c.low)),
      top,
      h: Math.max(1, bottom - top),
      up: cl >= o,
      live: props.unconfirmedLast && i === total.value - 1,
    })
  }
  return out
})

const volumes = computed(() => {
  const { volH, volTop } = layout.value
  if (!volH) return []
  const [a, b] = range.value
  let max = 0
  for (let i = a; i < b; i++) max = Math.max(max, Number(props.candles[i].volume ?? 0) || 0)
  if (!max) return []
  const w = Math.max(1, Math.min(barPx.value * 0.7, 24))
  const out = []
  for (let i = a; i < b; i++) {
    const c = props.candles[i]
    const v = Number(c.volume ?? 0) || 0
    const h = (v / max) * (volH - 2)
    out.push({
      key: c.ts,
      x: xOf(i) - w / 2,
      y: volTop + volH - h,
      w,
      h,
      up: Number(c.close) >= Number(c.open),
    })
  }
  return out
})

/** An SVG path through a line's visible values; a null breaks the line. */
function pathOf(values: (number | null)[], y: (v: number) => number): string {
  const [a, b] = range.value
  let d = ''
  let pen = false
  for (let i = Math.max(0, a - 1); i < Math.min(total.value, b + 1); i++) {
    const v = values[i]
    if (v === null || v === undefined || !Number.isFinite(v)) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  }
  return d
}

const overlayPaths = computed(() =>
  overlayGroups.value.flatMap((g) =>
    g.lines.map((l) => ({
      key: `${g.id}:${l.key}`,
      d: pathOf(l.values, yPrice),
      color: l.color,
      dashed: l.style === 'dashed',
    })),
  ),
)

const paneShapes = computed(() => {
  const [a, b] = range.value
  return props.panes.map((p, n) => {
    const top = layout.value.paneTops[n]
    let lo = Infinity
    let hi = -Infinity
    if (p.range) [lo, hi] = p.range
    else {
      for (const l of p.lines)
        for (let i = a; i < b; i++) {
          const v = l.values[i]
          if (v === null || v === undefined || !Number.isFinite(v)) continue
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
      for (const g of p.guides ?? []) {
        if (Number.isFinite(lo)) {
          lo = Math.min(lo, g)
          hi = Math.max(hi, g)
        }
      }
      if (!Number.isFinite(lo)) [lo, hi] = [0, 1]
      const pad = (hi - lo || 1) * 0.08
      lo -= pad
      hi += pad
    }
    const y = (v: number) => top + 4 + ((hi - v) / (hi - lo || 1)) * (SUB_H - 8)
    const w = Math.max(1, Math.min(barPx.value * 0.6, 16))
    const lines = p.lines.map((l) => {
      if (l.style !== 'hist')
        return {
          key: l.key,
          color: l.color,
          dashed: l.style === 'dashed',
          d: pathOf(l.values, y),
          bars: [],
        }
      const zero = y(Math.min(Math.max(0, lo), hi))
      const bars = []
      for (let i = a; i < b; i++) {
        const v = l.values[i]
        if (v === null || v === undefined || !Number.isFinite(v)) continue
        const yy = y(v)
        bars.push({
          key: i,
          x: xOf(i) - w / 2,
          y: Math.min(yy, zero),
          w,
          h: Math.max(1, Math.abs(zero - yy)),
          neg: v < 0,
        })
      }
      return { key: l.key, color: l.color, dashed: false, d: '', bars }
    })
    const guides = (p.guides ?? []).map((g) => ({ v: g, y: y(g) }))
    const ticks = niceTicks(lo, hi, 2)
    const dp = stepDecimals(ticks)
    return {
      id: p.id,
      top,
      lines,
      guides,
      ticks: ticks.map((v) => ({ y: y(v), text: v.toFixed(dp) })),
    }
  })
})

const timeTicks = computed(() => {
  const [a, b] = range.value
  const k = labelEvery(barPx.value)
  const out = []
  for (let i = a; i < b; i++) {
    if (i % k) continue
    const prev = i - k >= 0 ? times.value[i - k] : null
    out.push({ key: i, x: xOf(i), text: axisLabel(times.value[i], prev, props.timeframe) })
  }
  return out
})

const markerShapes = computed(() => {
  const [a, b] = range.value
  return props.markers
    .filter((m) => m.index >= a && m.index < b)
    .map((m) => {
      const c = props.candles[m.index]
      const below = m.kind === 'buy' || m.kind === 'bull'
      const x = xOf(m.index)
      const y = below ? yPrice(Number(c.low)) + 12 : yPrice(Number(c.high)) - 12
      const s = 6
      const d =
        m.kind === 'buy'
          ? `M${x},${y - s}L${x + s},${y + s}L${x - s},${y + s}Z`
          : m.kind === 'sell'
            ? `M${x},${y + s}L${x + s},${y - s}L${x - s},${y - s}Z`
            : `M${x},${y - s}L${x + s},${y}L${x},${y + s}L${x - s},${y}Z`
      return {
        key: `${m.kind}-${m.index}`,
        d,
        x,
        ty: below ? y + s + 11 : y - s - 4,
        letter: m.kind === 'buy' ? 'B' : m.kind === 'sell' ? 'S' : m.kind === 'bull' ? '↑' : '↓',
        good: below,
        confirmed: m.confirmed,
        label: m.label,
      }
    })
})

const last = computed(() => props.candles[total.value - 1])
const lastTag = computed(() => {
  const c = last.value
  if (!c) return null
  const y = yPrice(Number(c.close))
  if (y < 0 || y > layout.value.priceH) return null
  return { y, text: dec(c.close, 4) }
})

// --- Crosshair -----------------------------------------------------------------------

const hover = ref<{ i: number; x: number; y: number } | null>(null)
const hoverIndex = computed(() => {
  const h = hover.value
  if (!h) return null
  return h.i >= 0 && h.i < total.value ? h.i : null
})
const focusIndex = computed(() => hoverIndex.value ?? total.value - 1)
const tooltip = computed(() => {
  const i = hoverIndex.value
  const h = hover.value
  if (i === null || !h) return null
  const c = props.candles[i]
  return {
    time: fullTime(times.value[i], props.timeframe),
    ohlc: [
      ['O', dec(c.open, 4)],
      ['H', dec(c.high, 4)],
      ['L', dec(c.low, 4)],
      ['C', dec(c.close, 4)],
      ...(c.volume != null ? [['V', dec(c.volume, 2)]] : []),
    ] as [string, string][],
    live: props.unconfirmedLast && i === total.value - 1,
    left: h.x > plotW.value / 2,
    x: h.x,
  }
})
const crossPrice = computed(() => {
  const h = hover.value
  if (!h || h.y < 0 || h.y > layout.value.priceH) return null
  const dp = stepDecimals(niceTicks(prices.value.lo, prices.value.hi, 5)) + 1
  return { y: h.y, text: priceAt(h.y).toFixed(Math.min(dp, 6)) }
})

/** Legend rows: each study with its value at the crosshair (or the newest candle). */
const legend = computed(() => {
  const i = focusIndex.value
  const row = (g: ChartGroup) => ({
    id: g.id,
    label: g.label,
    source: g.source,
    values: g.lines.map((l) => ({
      key: l.key,
      label: l.label,
      color: l.color,
      dashed: l.style === 'dashed',
      text: l.display[i] != null ? dec(l.display[i], 4) : '—',
    })),
  })
  return { overlays: overlayGroups.value.map(row), panes: props.panes.map(row) }
})

// --- Input ---------------------------------------------------------------------------

function localX(e: { clientX: number; clientY: number }) {
  const box = plot.value?.getBoundingClientRect()
  return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
}
function indexAt(x: number) {
  return Math.floor(view.value.start + x / barPx.value)
}

const pointers = new Map<number, { x: number; y: number }>()
let drag: { x: number; view: View } | null = null
let pinch: { dist: number; view: View; anchor: number } | null = null

function pinchInfo() {
  const [p, q] = [...pointers.values()]
  return {
    dist: Math.hypot(p.x - q.x, p.y - q.y) || 1,
    anchor: Math.min(1, Math.max(0, (p.x + q.x) / 2 / plotW.value)),
  }
}
function onPointerDown(e: PointerEvent) {
  const p = localX(e)
  pointers.set(e.pointerId, p)
  try {
    plot.value?.setPointerCapture?.(e.pointerId)
  } catch {
    /* jsdom and old browsers */
  }
  if (pointers.size === 2) {
    drag = null
    pinch = { ...pinchInfo(), view: view.value }
  } else {
    drag = { x: p.x, view: view.value }
    hover.value = { i: indexAt(p.x), ...p }
  }
}
function onPointerMove(e: PointerEvent) {
  const p = localX(e)
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p)
  if (pinch && pointers.size === 2) {
    const now = pinchInfo()
    view.value = zoomView(pinch.view, pinch.dist / now.dist, pinch.anchor, total.value)
    return
  }
  if (drag) {
    const dx = p.x - drag.x
    if (Math.abs(dx) > 2) view.value = panView(drag.view, -dx / barPx.value, total.value)
  }
  if (p.x >= 0 && p.x <= plotW.value) hover.value = { i: indexAt(p.x), ...p }
  else hover.value = null
}
function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  if (!pointers.size) drag = null
}
function onPointerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse' && !drag) hover.value = null
}
function onWheel(e: WheelEvent) {
  if (!total.value) return
  e.preventDefault()
  const { x } = localX(e)
  // Trackpad pinch arrives as a wheel with ctrlKey; a sideways swipe pans.
  if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    view.value = panView(view.value, e.deltaX / barPx.value, total.value)
    return
  }
  const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
  view.value = zoomView(view.value, factor, x / plotW.value, total.value)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && cssFull.value) {
    cssFull.value = false
    fullscreen.value = false
    return
  }
  const next = keyView(view.value, e.key, total.value)
  if (!next) return
  e.preventDefault()
  view.value = next
}
function zoom(factor: number) {
  view.value = zoomView(view.value, factor, 1, total.value)
}
function reset() {
  view.value = initialView(total.value)
}

async function toggleFullscreen() {
  const el = root.value
  if (fullscreen.value) {
    if (cssFull.value) {
      cssFull.value = false
      fullscreen.value = false
    } else if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {})
    return
  }
  if (el?.requestFullscreen && document.fullscreenEnabled !== false) {
    try {
      await el.requestFullscreen()
      return
    } catch {
      /* refused (iframe, iOS): fall back to filling the window */
    }
  }
  cssFull.value = true
  fullscreen.value = true
}
function onFullscreenChange() {
  fullscreen.value = cssFull.value || document.fullscreenElement === root.value
}

let observer: ResizeObserver | null = null
function measure() {
  width.value = plot.value?.clientWidth || root.value?.clientWidth || width.value
  rootH.value = root.value?.clientHeight ?? 0
}
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(measure)
    observer.observe(root.value)
  }
  plot.value?.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('fullscreenchange', onFullscreenChange)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  plot.value?.removeEventListener('wheel', onWheel)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  pointers.clear()
})

const summary = computed(() => {
  const [a, b] = range.value
  if (!total.value || b <= a) return 'No candles.'
  const c = last.value!
  return `Showing ${b - a} of ${total.value} candles, ${fullTime(times.value[a], props.timeframe)} to ${fullTime(
    times.value[b - 1],
    props.timeframe,
  )}. Newest close ${dec(c.close, 4)}${props.unconfirmedLast ? ', unconfirmed' : ''}.`
})

defineExpose({ view, setView: (v: View) => (view.value = clampView(v, total.value)) })
</script>

<template>
  <figure
    ref="root"
    class="cc"
    :class="{ 'is-fs': fullscreen, 'is-css-fs': cssFull }"
    :aria-label="label"
  >
    <div class="cc__tools" role="toolbar" :aria-label="`${label} view`">
      <span class="cc__hint">Drag to pan · wheel or pinch to zoom · ← → + − Home End</span>
      <IconButton label="Zoom out" size="sm" @click="zoom(1.25)">
        <Icon name="zoom-out" size="sm" />
      </IconButton>
      <IconButton label="Zoom in" size="sm" @click="zoom(0.8)">
        <Icon name="zoom-in" size="sm" />
      </IconButton>
      <IconButton label="Show latest candles" size="sm" @click="reset">
        <Icon name="refresh-cw" size="sm" />
      </IconButton>
      <IconButton
        :label="fullscreen ? 'Exit full screen' : 'Full screen'"
        size="sm"
        :active="fullscreen"
        @click="toggleFullscreen"
      >
        <Icon :name="fullscreen ? 'minimize' : 'maximize'" size="sm" />
      </IconButton>
    </div>

    <div class="cc__legend" aria-hidden="false">
      <span class="cc__legend-key">Hollow = close above open · filled = close below open</span>
      <span v-for="g in legend.overlays" :key="g.id" class="cc__legend-item">
        <span v-for="v in g.values" :key="v.key" class="cc__legend-val">
          <span
            class="cc__swatch"
            :class="{ 'is-dashed': v.dashed }"
            :style="{ '--swatch': v.color }"
            aria-hidden="true"
          ></span>
          {{ g.values.length > 1 ? `${g.label} ${v.label}` : g.label }}
          <span class="tp-num">{{ v.text }}</span>
        </span>
        <span v-if="g.source" class="cc__src">{{
          g.source === 'server' ? 'server' : 'browser'
        }}</span>
      </span>
    </div>

    <div
      ref="plot"
      class="cc__plot"
      data-no-tab-swipe
      tabindex="0"
      role="group"
      aria-roledescription="interactive chart"
      :aria-label="`${label}. Arrow keys pan, plus and minus zoom, Home and End jump.`"
      aria-keyshortcuts="ArrowLeft ArrowRight + - Home End"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @keydown="onKey"
    >
      <svg
        class="cc__svg"
        :width="width"
        :height="layout.H"
        :viewBox="`0 0 ${width} ${layout.H}`"
        aria-hidden="true"
      >
        <!-- price grid and axis -->
        <g class="cc__grid">
          <line
            v-for="t in priceTicks"
            :key="`g${t.text}`"
            x1="0"
            :x2="plotW"
            :y1="t.y"
            :y2="t.y"
          />
        </g>
        <g class="cc__axis">
          <line :x1="plotW" :x2="plotW" y1="0" :y2="layout.timeTop" />
          <text v-for="t in priceTicks" :key="`t${t.text}`" :x="plotW + 6" :y="t.y + 4">
            {{ t.text }}
          </text>
        </g>

        <!-- candles -->
        <g v-for="b in bodies" :key="b.key" :class="{ cc__live: b.live }">
          <line :x1="b.x" :x2="b.x" :y1="b.wickTop" :y2="b.wickBottom" class="cc__wick" />
          <rect
            :x="b.x - b.w / 2"
            :y="b.top"
            :width="b.w"
            :height="b.h"
            :class="b.up ? 'cc__up' : 'cc__down'"
          />
          <text v-if="b.live" :x="b.x" :y="Math.max(10, b.wickTop - 6)" class="cc__live-text">
            unconfirmed
          </text>
        </g>

        <!-- price-pane overlays -->
        <path
          v-for="p in overlayPaths"
          :key="p.key"
          :d="p.d"
          class="cc__line"
          :class="{ 'is-dashed': p.dashed }"
          :style="{ stroke: p.color }"
        />

        <!-- signal and crossover markers -->
        <g
          v-for="m in markerShapes"
          :key="m.key"
          class="cc__marker"
          :class="[m.good ? 'is-good' : 'is-bad', { 'is-unconfirmed': !m.confirmed }]"
        >
          <path :d="m.d" />
          <text :x="m.x" :y="m.ty">{{ m.letter }}</text>
        </g>

        <!-- last price -->
        <g v-if="lastTag" class="cc__last">
          <line x1="0" :x2="plotW" :y1="lastTag.y" :y2="lastTag.y" />
          <rect :x="plotW + 1" :y="lastTag.y - 9" :width="AXIS_W - 2" height="18" rx="3" />
          <text :x="plotW + 6" :y="lastTag.y + 4">{{ lastTag.text }}</text>
        </g>

        <!-- volume -->
        <g v-if="layout.volH" class="cc__vol">
          <line class="cc__sep" x1="0" :x2="plotW" :y1="layout.volTop" :y2="layout.volTop" />
          <rect
            v-for="v in volumes"
            :key="v.key"
            :x="v.x"
            :y="v.y"
            :width="v.w"
            :height="v.h"
            :class="v.up ? 'is-up' : 'is-down'"
          />
          <text class="cc__pane-label" x="4" :y="layout.volTop + 12">Volume</text>
        </g>

        <!-- sub-panes -->
        <g v-for="(p, n) in paneShapes" :key="p.id" class="cc__pane">
          <line class="cc__sep" x1="0" :x2="plotW" :y1="p.top" :y2="p.top" />
          <line
            v-for="g in p.guides"
            :key="`gd${g.v}`"
            class="cc__guide"
            x1="0"
            :x2="plotW"
            :y1="g.y"
            :y2="g.y"
          />
          <text
            v-for="t in p.ticks"
            :key="`pt${t.text}`"
            class="cc__axis-text"
            :x="plotW + 6"
            :y="t.y + 4"
          >
            {{ t.text }}
          </text>
          <template v-for="l in p.lines" :key="l.key">
            <rect
              v-for="b in l.bars"
              :key="b.key"
              :x="b.x"
              :y="b.y"
              :width="b.w"
              :height="b.h"
              class="cc__hist"
              :class="{ 'is-neg': b.neg }"
            />
            <path
              v-if="l.d"
              :d="l.d"
              class="cc__line"
              :class="{ 'is-dashed': l.dashed }"
              :style="{ stroke: l.color }"
            />
          </template>
          <text class="cc__pane-label" x="4" :y="p.top + 12">{{ panes[n].label }}</text>
        </g>

        <!-- time axis -->
        <g class="cc__axis">
          <line x1="0" :x2="plotW" :y1="layout.timeTop" :y2="layout.timeTop" />
          <text
            v-for="t in timeTicks"
            :key="t.key"
            :x="t.x"
            :y="layout.timeTop + 15"
            text-anchor="middle"
          >
            {{ t.text }}
          </text>
        </g>

        <!-- crosshair -->
        <g v-if="tooltip" class="cc__cross">
          <line :x1="tooltip.x" :x2="tooltip.x" y1="0" :y2="layout.timeTop" />
          <template v-if="crossPrice">
            <line x1="0" :x2="plotW" :y1="crossPrice.y" :y2="crossPrice.y" />
            <rect :x="plotW + 1" :y="crossPrice.y - 9" :width="AXIS_W - 2" height="18" rx="3" />
            <text :x="plotW + 6" :y="crossPrice.y + 4">{{ crossPrice.text }}</text>
          </template>
        </g>
      </svg>

      <div
        v-if="tooltip"
        class="cc__tip"
        :class="{ 'is-left': tooltip.left }"
        :style="{ '--tip-x': `${tooltip.x}px` }"
      >
        <span class="cc__tip-time">{{ tooltip.time }}</span>
        <span v-if="tooltip.live" class="cc__tip-live">Unconfirmed: this period has not ended</span>
        <span class="cc__tip-row tp-num">
          <span v-for="[k, v] in tooltip.ohlc" :key="k"
            ><b>{{ k }}</b> {{ v }}</span
          >
        </span>
        <span v-for="g in legend.panes" :key="g.id" class="cc__tip-row tp-num">
          {{ g.label }}:
          <span v-for="v in g.values" :key="v.key"
            >{{ g.values.length > 1 ? `${v.label} ` : '' }}{{ v.text }}</span
          >
        </span>
      </div>
    </div>

    <div v-if="legend.panes.length" class="cc__legend">
      <span v-for="g in legend.panes" :key="g.id" class="cc__legend-item">
        <span v-for="v in g.values" :key="v.key" class="cc__legend-val">
          <span
            class="cc__swatch"
            :class="{ 'is-dashed': v.dashed }"
            :style="{ '--swatch': v.color }"
            aria-hidden="true"
          ></span>
          {{ g.values.length > 1 ? v.label : g.label }}
          <span class="tp-num">{{ v.text }}</span>
        </span>
        <span v-if="g.source" class="cc__src">{{
          g.source === 'server' ? 'server' : 'browser'
        }}</span>
      </span>
    </div>
    <p v-if="unconfirmedLast" class="cc__note">
      The newest candle is unconfirmed: its period has not ended, so it and anything drawn on it can
      still change.
    </p>
    <p class="cc__sr" aria-live="polite">{{ summary }}</p>
  </figure>
</template>

<style scoped>
.cc {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.cc.is-fs {
  background: var(--theme-surface, var(--bg));
  padding: var(--sp-3);
  overflow: auto;
}
.cc.is-css-fs {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.cc__tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-1);
  flex-wrap: wrap;
  min-width: 0;
}
.cc__hint {
  margin-right: auto;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  min-width: 0;
  overflow-wrap: anywhere;
}
.cc__plot {
  position: relative;
  min-width: 0;
  width: 100%;
  touch-action: pan-y;
  user-select: none;
  cursor: crosshair;
  border-radius: var(--radius-sm);
  outline: none;
}
.cc__plot:focus-visible {
  box-shadow: 0 0 0 2px var(--theme-accent);
}
.cc__svg {
  display: block;
  overflow: hidden;
}
.cc__grid line {
  stroke: var(--theme-border);
  stroke-opacity: 0.5;
  stroke-width: 1;
}
.cc__axis line,
.cc__sep {
  stroke: var(--theme-border);
  stroke-width: 1;
}
.cc__axis text,
.cc__axis-text,
.cc__pane-label {
  fill: var(--text-secondary);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}
.cc__wick {
  stroke: var(--text-secondary);
  stroke-width: 1;
}
.cc__up {
  fill: transparent;
  stroke: var(--theme-success);
  stroke-width: 1;
}
.cc__down {
  fill: var(--theme-danger);
  stroke: var(--theme-danger);
  stroke-width: 1;
}
.cc__live rect {
  stroke-dasharray: 3 2;
  fill-opacity: 0.35;
}
.cc__live-text {
  fill: var(--text-secondary);
  font-size: var(--text-2xs);
  text-anchor: middle;
}
.cc__line {
  fill: none;
  stroke-width: 1.5;
}
.cc__line.is-dashed {
  stroke-dasharray: 6 4;
}
.cc__vol rect.is-up {
  fill: var(--theme-success);
  fill-opacity: 0.35;
}
.cc__vol rect.is-down {
  fill: var(--theme-danger);
  fill-opacity: 0.35;
}
.cc__hist {
  fill: var(--theme-dim);
  fill-opacity: 0.55;
}
.cc__hist.is-neg {
  fill: var(--theme-danger);
}
.cc__guide {
  stroke: var(--theme-dim);
  stroke-dasharray: 2 3;
  stroke-width: 1;
}
.cc__marker path {
  stroke-width: 1.5;
}
.cc__marker.is-good path {
  fill: var(--theme-success);
  stroke: var(--theme-success);
}
.cc__marker.is-bad path {
  fill: var(--theme-danger);
  stroke: var(--theme-danger);
}
.cc__marker.is-unconfirmed path {
  fill: transparent;
  stroke-dasharray: 2 2;
}
.cc__marker text {
  fill: var(--text-primary);
  font-size: var(--text-2xs);
  text-anchor: middle;
}
.cc__last line {
  stroke: var(--theme-accent);
  stroke-dasharray: 2 3;
  stroke-width: 1;
}
.cc__last rect,
.cc__cross rect {
  fill: var(--theme-accent);
}
.cc__last text,
.cc__cross text {
  fill: var(--theme-on-accent);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}
.cc__cross line {
  stroke: var(--text-secondary);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}
.cc__tip {
  position: absolute;
  top: var(--sp-2);
  left: calc(var(--tip-x) + 14px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: min(280px, 70%);
  padding: var(--sp-2);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-sm);
  background: var(--layer-raised-bg, var(--theme-surface));
  color: var(--text-primary);
  font-size: var(--text-2xs);
  pointer-events: none;
  min-width: 0;
}
.cc__tip.is-left {
  left: auto;
  right: calc(100% - var(--tip-x) + 14px);
}
.cc__tip-time {
  color: var(--text-secondary);
}
.cc__tip-live {
  color: var(--theme-warning);
  overflow-wrap: anywhere;
  min-width: 0;
}
.cc__tip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.cc__legend {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  min-width: 0;
}
.cc__legend-key {
  min-width: 0;
  overflow-wrap: anywhere;
}
.cc__legend-item,
.cc__legend-val {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.cc__legend-item {
  gap: var(--sp-2);
}
.cc__swatch {
  width: 14px;
  height: 0;
  border-top: 2px solid var(--swatch);
}
.cc__swatch.is-dashed {
  border-top-style: dashed;
}
.cc__src {
  padding: 0 5px;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-pill);
}
.cc__note {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  min-width: 0;
  overflow-wrap: anywhere;
}
.cc__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (pointer: coarse) {
  .cc__tools :deep(button) {
    min-width: 44px;
    min-height: 44px;
  }
  .cc__hint {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cc,
  .cc * {
    transition: none;
    animation: none;
  }
}
</style>

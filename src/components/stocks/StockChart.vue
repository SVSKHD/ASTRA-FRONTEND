<script setup lang="ts">
// The stock page's chart: Live (today's minute candles, the newest one moving
// with each streamed tick) while NSE is open, and the historic ranges beside it,
// with a few indicators to switch on.
//
// Steady by design: it reloads only when the stock or the range changes (not on
// every price tick), keeps the last chart on screen while a new one loads, and
// draws a range it has already read at once from memory.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { aureon } from '@/api/client'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import CandleChart, { type ChartGroup } from '@/components/trading/CandleChart.vue'
import { explainHistory, forgetHistory, historyStatus, requestHistory } from '@/trading/history'
import { isUnconfirmed } from '@/trading/chartView'
import { marketOpen } from '@/trading/dhanHealth'
import { chartPath } from '@/trading/sections'
import { computeStudy, toNumbers } from '@/trading/studies'
import { must } from '@/trading/useLoad'
import { ago } from '@/trading/format'
import {
  HISTORIC,
  INDICATORS,
  INDICATORS_KEY,
  RANGES,
  cacheCandles,
  cachedCandles,
  mergeTick,
  parseIndicators,
  sessionStart,
  studyOf,
  type Candle,
  type RangeKey,
  sameCandles,
  stableCandles,
} from '@/trading/stockChart'

const props = defineProps<{
  instrumentId: number
  symbol: string
  /** The newest price and when it arrived; `streaming` when it came from the live feed. */
  ltp: string | null
  ltpAt: string | null
  streaming: boolean
  now: number
}>()
const router = useRouter()

// --- range ------------------------------------------------------------------------
const RANGE_KEY = 'aureon.stocks.range.v1'
const isOpen = computed(() => marketOpen(props.now))
function savedRange(): RangeKey {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(RANGE_KEY)
  } catch {
    /* not remembered */
  }
  if (saved === 'live') return marketOpen(Date.now()) ? 'live' : '1d'
  if (saved && saved in RANGES) return saved as RangeKey
  return marketOpen(Date.now()) ? 'live' : '6m'
}
const range = ref<RangeKey>(savedRange())
watch(range, (r) => {
  try {
    localStorage.setItem(RANGE_KEY, r)
  } catch {
    /* not remembered */
  }
})
// The bell rang: Live has nothing new to show, so fall back to the day's chart.
watch(isOpen, (open) => {
  if (!open && range.value === 'live') range.value = '1d'
})
const options = computed(() => [
  ...(isOpen.value ? [{ value: 'live', label: '● Live' }] : []),
  ...HISTORIC.map((k) => ({ value: k, label: RANGES[k].label })),
])
const spec = computed(() => RANGES[range.value])

// --- candles ------------------------------------------------------------------------
const candles = shallowRef<readonly Candle[]>([])
/** The range the drawn candles belong to (the previous one while a new range loads). */
const shownRange = ref<RangeKey>(range.value)
const shownId = ref<number | null>(null)
const state = ref<'loading' | 'ready' | 'fetching' | 'empty' | 'error'>('loading')
const busy = ref(false)
const note = ref('')
const loadedAt = ref(0)

// While the server says the request is queued or running, keep looking: 5 s,
// easing to 15 s, for about four minutes (it may wait behind other requests).
const POLLS = 20
const pollDelay = (attempt: number) => Math.min(15_000, 5_000 + attempt * 1_000)
let seq = 0
let inflight = false
let pollTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  seq++
  clearTimeout(pollTimer)
})

async function load(attempt = 0, quiet = false) {
  const id = props.instrumentId
  const r = range.value
  const s = RANGES[r]
  const key = `${id}:${r}`
  const mine = ++seq
  clearTimeout(pollTimer)

  if (attempt === 0 && !quiet) {
    const hit = cachedCandles(key)
    if (hit) {
      candles.value = hit.candles
      shownRange.value = r
      shownId.value = id
      loadedAt.value = hit.at
      state.value = 'ready'
    } else if (shownId.value !== id) {
      // Another stock's chart must not stand in for this one.
      candles.value = []
      shownId.value = id
      state.value = 'loading'
    } else if (!candles.value.length) {
      state.value = 'loading'
    }
    busy.value = true
    note.value = ''
  }

  inflight = true
  try {
    const query: Record<string, unknown> = { instrument_id: id, timeframe: s.tf, limit: s.limit }
    if (s.live) query.start = new Date(sessionStart(Date.now())).toISOString()
    const rows = must(
      await aureon.GET('/api/trading/candles', {
        params: { query: query as { instrument_id: number; timeframe: typeof s.tf } },
      }),
    )
    if (mine !== seq) return
    const got: Candle[] = rows
      .filter((c) => !c.is_gap)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    if (got.length) {
      // A refresh that brought nothing new keeps the same array: no redraw.
      const same = shownRange.value === r && shownId.value === id && sameCandles(candles.value, got)
      if (!same) candles.value = got
      shownRange.value = r
      shownId.value = id
      loadedAt.value = Date.now()
      cacheCandles(key, got)
      state.value = 'ready'
      busy.value = false
      note.value = ''
      return
    }
    // A quiet refresh that found nothing new leaves the chart as it is.
    if (quiet) return
    // Nothing on this range: the old range's candles must not pose as this one.
    if (shownRange.value !== r) candles.value = []
    shownRange.value = r

    // Nothing stored: ask the server to fetch it, then look again while it does.
    const asked = await requestHistory(id, s.tf)
    if (mine !== seq) return
    if (asked.state !== 'queued') {
      state.value = 'empty'
      busy.value = false
      note.value = `No history for this range: ${asked.reason}`
      return
    }
    const status = attempt > 0 ? await historyStatus(id, s.tf) : null
    if (mine !== seq) return
    const said = status ? explainHistory(status) : null
    if ((said ? said.waiting : true) && attempt < POLLS) {
      state.value = 'fetching'
      note.value = said?.text || 'Asking the broker for this range…'
      pollTimer = setTimeout(() => void load(attempt + 1), pollDelay(attempt))
      return
    }
    state.value = 'empty'
    busy.value = false
    note.value =
      said?.text ||
      'The broker has not sent this history yet, and the server did not say why. Try again in a minute.'
  } catch (e) {
    if (mine !== seq || quiet) return
    state.value = 'error'
    busy.value = false
    note.value = `The chart could not be loaded${(e as Error).message ? `: ${(e as Error).message}` : ''}.`
  } finally {
    if (mine === seq) inflight = false
  }
}

function retry() {
  forgetHistory(props.instrumentId, spec.value.tf)
  void load()
}

// Separate sources: a new `row` object from the parent (every price tick) does
// NOT reload the chart; only a different stock or range does.
watch([() => props.instrumentId, range], () => void load(), { immediate: true })

// Keep intraday ranges current while the market is open, without a spinner.
watch(
  () => props.now,
  (now) => {
    if (!isOpen.value || !spec.value.intraday || inflight || state.value !== 'ready') return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const every = spec.value.live ? 30_000 : 60_000
    if (now - loadedAt.value >= every) void load(0, true)
  },
)

const isLive = computed(() => shownRange.value === 'live' && range.value === 'live')
const shownTf = computed(() => RANGES[shownRange.value].tf)
/**
 * What is drawn: the stored candles with the live price folded into the newest
 * one, on every range, while the market is open and the feed is live. When the
 * price has not changed, the same array comes back and nothing redraws.
 */
const keep = stableCandles()
const drawn = computed(() =>
  keep(
    isOpen.value && props.streaming
      ? mergeTick(candles.value, props.ltp, props.ltpAt, shownTf.value, props.now)
      : candles.value,
  ),
)
const unconfirmedLast = computed(() => {
  const last = drawn.value[drawn.value.length - 1]
  return !!last && isOpen.value && isUnconfirmed(last.ts, shownTf.value, props.now)
})

// --- indicators ------------------------------------------------------------------------
function savedIndicators(): string[] {
  try {
    return parseIndicators(localStorage.getItem(INDICATORS_KEY))
  } catch {
    return parseIndicators(null)
  }
}
const on = ref<string[]>(savedIndicators())
function toggle(key: string) {
  on.value = on.value.includes(key) ? on.value.filter((k) => k !== key) : [...on.value, key]
  try {
    localStorage.setItem(INDICATORS_KEY, JSON.stringify(on.value))
  } catch {
    /* not remembered */
  }
}
const available = computed(() =>
  INDICATORS.filter((i) => !i.intradayOnly || RANGES[shownRange.value].intraday),
)
const numbers = computed(() => toNumbers(drawn.value))
const results = computed(() =>
  available.value
    .filter((i) => on.value.includes(i.key))
    .map((i) => computeStudy(studyOf(i), numbers.value)),
)
const overlays = computed<ChartGroup[]>(() =>
  results.value
    .filter((r) => r.pane === 'price')
    .map((r) => ({ id: r.study.id, label: r.label, source: r.source, lines: r.lines })),
)
const panes = computed<ChartGroup[]>(() =>
  results.value
    .filter((r) => r.pane === 'sub')
    .map((r) => ({
      id: r.study.id,
      label: r.label,
      source: r.source,
      lines: r.lines,
      range: r.range,
      guides: r.guides,
    })),
)

const footer = computed(() => {
  if (state.value === 'fetching' && drawn.value.length) return note.value
  if (isLive.value)
    return props.streaming
      ? 'Live · 1-minute candles, moving with each tick'
      : 'Today · 1-minute candles · waiting for the live feed'
  if (!drawn.value.length) return ''
  const tf = { '5m': '5-minute', '1h': 'hourly', '1d': 'daily' }[shownTf.value as string] ?? ''
  return `${tf} candles · read ${ago(new Date(loadedAt.value).toISOString(), props.now)}`
})
</script>

<template>
  <section class="sc" aria-label="Chart">
    <div class="sc__bar">
      <SegmentedControl
        v-model="range"
        size="sm"
        aria-label="Chart range"
        :options="options"
        :class="{ 'is-liveOn': range === 'live' }"
      />
      <span class="sc__barEnd">
        <span v-if="isOpen && streaming" class="sc__live" aria-hidden="true">LIVE</span>
        <IconButton
          label="Open the full chart: every indicator, drawing room, full screen"
          size="sm"
          tone="default"
          @click="router.push(chartPath(instrumentId, RANGES[shownRange].tf))"
        >
          <Icon name="maximize" size="sm" />
        </IconButton>
      </span>
    </div>

    <div class="sc__ind" role="group" aria-label="Indicators">
      <button
        v-for="i in available"
        :key="i.key"
        type="button"
        class="sc__chip"
        :class="{ 'is-on': on.includes(i.key) }"
        :aria-pressed="on.includes(i.key)"
        @click="toggle(i.key)"
      >
        {{ i.label }}
      </button>
    </div>

    <div class="sc__frame" :class="{ 'is-busy': busy && drawn.length }">
      <CandleChart
        v-if="drawn.length"
        :candles="drawn as Candle[]"
        :timeframe="shownTf"
        :height="220"
        :overlays="overlays"
        :panes="panes"
        :unconfirmed-last="unconfirmedLast"
        :series-key="`${shownId}:${shownRange}`"
        :label="`${symbol} price chart`"
      />
      <div v-else-if="state === 'loading' || state === 'fetching'" class="sc__wait">
        <Skeleton height="100%" radius="var(--radius-md)" />
        <span v-if="state === 'fetching'" class="sc__waitNote">{{ note }}</span>
      </div>
      <div v-else class="sc__empty">
        <Icon name="chart-candlestick" size="lg" />
        <span class="sc__muted">{{ note }}</span>
        <div class="sc__actions">
          <Button size="sm" variant="secondary" @click="retry()">
            <Icon name="refresh-cw" size="sm" />Try again
          </Button>
          <Button size="sm" variant="ghost" @click="router.push(chartPath(instrumentId, spec.tf))">
            Open in Charts
          </Button>
        </div>
      </div>
      <span v-if="busy && drawn.length" class="sc__spinner" aria-label="Loading">
        <Icon name="refresh-cw" size="sm" />
      </span>
    </div>
    <p class="sc__foot" aria-live="polite">{{ footer }}</p>
  </section>
</template>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  min-width: 0;
}
.sc__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.sc__barEnd {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-left: auto;
}
.sc__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  color: var(--theme-success);
}
.sc__live::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-success);
  animation: sc-pulse 1.6s ease-in-out infinite;
}
@keyframes sc-pulse {
  50% {
    opacity: 0.35;
  }
}
.sc__ind {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sc__chip {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}
.sc__chip:hover {
  color: var(--theme-text);
}
.sc__chip.is-on {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  border-color: color-mix(in oklch, var(--theme-accent) 55%, var(--theme-border));
  color: var(--theme-text);
}
.sc__chip:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
/* A fixed floor, so loading, fetching and the chart all take the same room. */
.sc__frame {
  position: relative;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sc__frame > :first-child {
  transition: opacity var(--dur-fast) ease;
}
.sc__frame.is-busy > :first-child {
  opacity: 0.55;
}
.sc__wait {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 300px;
}
.sc__wait > :first-child {
  flex: 1;
}
.sc__waitNote {
  position: absolute;
  inset: auto 12px 12px;
  font-size: var(--text-sm);
  color: var(--theme-dim);
  text-align: center;
}
.sc__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-4);
  text-align: center;
  color: var(--theme-dim);
}
.sc__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-2);
}
.sc__actions :deep(.ui-icon) {
  margin-right: 6px;
}
.sc__muted {
  font-size: var(--text-sm);
  color: var(--theme-dim);
  max-width: 46ch;
}
.sc__spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--theme-card);
  border: 1px solid var(--theme-border);
  color: var(--theme-accent);
}
.sc__spinner :deep(.ui-icon) {
  animation: sc-spin 0.9s linear infinite;
}
@keyframes sc-spin {
  to {
    transform: rotate(360deg);
  }
}
.sc__foot {
  margin: 0;
  min-height: 1.4em;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .sc__live::before,
  .sc__spinner :deep(.ui-icon) {
    animation: none;
  }
}
</style>

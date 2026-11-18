<script setup lang="ts">
// A finished backtest, replayed: the candles of its period drawn bar by bar with
// play / pause, steps and a scrubber, each trade marked on the chart as it
// happens, the score so far (net P&L, win rate, drawdown, the open trade at the
// replay's price), the equity curve, and the trade log beside it.
//
// It reads the run's own candles (GET /api/trading/candles over the run's
// period) and its trades (GET /api/trading/backtests/{id}, paged). Simulated
// only: nothing here places or proposes an order.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { aureon, type components } from '@/api/client'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Slider from '@/components/ui/Slider.vue'
import CandleChart from './CandleChart.vue'
import BacktestTradeLog from './BacktestTradeLog.vue'
import { fullTime, type Timeframe } from '@/trading/chartView'
import { dec, pct, signed } from '@/trading/format'
import { must } from '@/trading/useLoad'
import {
  SPEEDS,
  markersAt,
  placeTrades,
  statsAt,
  unrealised,
  type BacktestTrade,
  type PlacedTrade,
} from '@/trading/backtestReplay'

type Run = components['schemas']['BacktestRunOut']
interface Candle {
  ts: string
  open: string
  high: string
  low: string
  close: string
  volume?: string | null
}

const props = defineProps<{ run: Run; title: string }>()
const tf = computed(() => props.run.timeframe as Timeframe)

// --- loading ---------------------------------------------------------------------------
const candles = shallowRef<Candle[]>([])
const trades = shallowRef<BacktestTrade[]>([])
const loading = ref(true)
const error = ref('')
const truncated = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = {
      instrument_id: props.run.instrument_id,
      timeframe: tf.value,
      start: props.run.period_start,
      end: props.run.period_end,
      limit: 5000,
    }
    const [rows, ...pages] = await Promise.all([
      aureon
        .GET('/api/trading/candles', {
          params: { query: query as { instrument_id: number; timeframe: Timeframe } },
        })
        .then(must),
      readTrades(),
    ])
    candles.value = rows
      .filter((c) => !c.is_gap)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    truncated.value = rows.length >= 5000
    trades.value = pages[0]
    seek(firstTradeBar())
  } catch (e) {
    error.value = (e as Error).message || 'The replay could not be loaded.'
  } finally {
    loading.value = false
  }
}
/** Every trade, 500 at a time (the endpoint's page). */
async function readTrades(): Promise<BacktestTrade[]> {
  const out: BacktestTrade[] = []
  for (let offset = 0; offset < 20_000; offset += 500) {
    const page = must(
      await aureon.GET('/api/trading/backtests/{run_id}', {
        params: { path: { run_id: props.run.id }, query: { limit: 500, offset } },
      }),
    )
    out.push(...page.trades)
    if (!page.trades.length || out.length >= page.trades_total) break
  }
  return out
}
onMounted(load)

const times = computed(() => candles.value.map((c) => Date.parse(c.ts)))
const placed = computed<PlacedTrade[]>(() => placeTrades(trades.value, times.value))
const last = computed(() => Math.max(0, candles.value.length - 1))

// --- the cursor and playback -------------------------------------------------------------
const cursor = ref(0)
const playing = ref(false)
const speed = ref<string>('12')
const speedOptions = SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))

function seek(bar: number) {
  cursor.value = Math.min(last.value, Math.max(0, Math.round(bar)))
}
/** Open on the bars just before the first trade, so there is something to watch. */
function firstTradeBar(): number {
  const first = placed.value.find((t) => t.entryBar >= 0)
  return first ? Math.max(0, first.entryBar - 40) : Math.min(last.value, 60)
}

let raf = 0
let lastFrame = 0
let carry = 0
function frame(t: number) {
  if (!playing.value) return
  const dt = lastFrame ? Math.min(250, t - lastFrame) : 0
  lastFrame = t
  carry += (dt / 1000) * Number(speed.value)
  const steps = Math.floor(carry)
  if (steps) {
    carry -= steps
    seek(cursor.value + steps)
  }
  if (cursor.value >= last.value) {
    playing.value = false
    return
  }
  raf = requestAnimationFrame(frame)
}
function play() {
  if (!candles.value.length) return
  if (cursor.value >= last.value) seek(0)
  playing.value = true
  lastFrame = 0
  carry = 0
  raf = requestAnimationFrame(frame)
}
function pause() {
  playing.value = false
  cancelAnimationFrame(raf)
}
function toggle() {
  if (playing.value) pause()
  else play()
}
function step(by: number) {
  pause()
  seek(cursor.value + by)
}
onBeforeUnmount(pause)
watch(
  () => props.run.id,
  () => {
    pause()
    void load()
  },
)

/** The next / previous trade event (an entry or an exit) from the cursor. */
const events = computed(() =>
  [...new Set(placed.value.flatMap((t) => [t.entryBar, t.exitBar]).filter((b) => b >= 0))].sort(
    (a, b) => a - b,
  ),
)
function jumpTrade(dir: 1 | -1) {
  pause()
  const e = events.value
  const next =
    dir > 0 ? e.find((b) => b > cursor.value) : [...e].reverse().find((b) => b < cursor.value)
  if (next !== undefined) seek(next)
}
function seekTrade(n: number) {
  pause()
  const t = placed.value.find((x) => x.n === n)
  if (t) seek(t.exitBar >= 0 ? t.exitBar : t.entryBar)
  activeN.value = n
}

function onKey(e: KeyboardEvent) {
  // The chart owns its own keys (arrows pan it) while it has focus.
  if ((e.target as HTMLElement | null)?.closest('.cc__plot, input, textarea, [role="slider"]'))
    return
  if (e.key === ' ' || e.key === 'k') {
    e.preventDefault()
    toggle()
  } else if (e.key === '.' || e.key === 'l') step(1)
  else if (e.key === ',' || e.key === 'j') step(-1)
  else if (e.key === ']') jumpTrade(1)
  else if (e.key === '[') jumpTrade(-1)
}

// --- what is on screen ---------------------------------------------------------------------
const shown = computed(() => candles.value.slice(0, cursor.value + 1))
const markers = computed(() => markersAt(placed.value, cursor.value))
const price = computed(() => {
  const c = candles.value[cursor.value]
  return c ? Number(c.close) : null
})
const stats = computed(() => statsAt(placed.value, cursor.value))
const activeN = ref<number | null>(null)
// The highlight follows the replay: the trade most recently entered or closed.
watch(cursor, (c) => {
  let n: number | null = null
  let at = -1
  for (const t of placed.value) {
    for (const b of [t.entryBar, t.exitBar])
      if (b >= 0 && b <= c && b >= at) {
        at = b
        n = t.n
      }
  }
  activeN.value = n
})
const openValue = computed(() =>
  stats.value.open && price.value !== null ? unrealised(stats.value.open, price.value) : null,
)
const cursorTime = computed(() =>
  times.value[cursor.value] ? fullTime(times.value[cursor.value], tf.value) : '',
)
const progress = computed(() => (last.value ? cursor.value / last.value : 0))

const kpis = computed(() => {
  const s = stats.value
  const tone = (v: number | null) => (v === null || v === 0 ? '' : v > 0 ? 'is-up' : 'is-down')
  return [
    { label: 'Net P&L', value: signed(s.net, 2), tone: tone(s.net), big: true },
    {
      label: 'Open trade',
      value: openValue.value === null ? '—' : signed(openValue.value, 2),
      tone: tone(openValue.value),
      note: stats.value.open
        ? `#${stats.value.open.n} ${stats.value.open.long ? 'long' : 'short'}`
        : 'flat',
    },
    { label: 'Trades closed', value: String(s.closed), note: `${s.wins} won · ${s.losses} lost` },
    { label: 'Win rate', value: s.winRate === null ? '—' : pct(s.winRate) },
    {
      label: 'Max drawdown',
      value: s.maxDrawdown ? `−${dec(s.maxDrawdown, 2)}` : '0.00',
      tone: s.maxDrawdown ? 'is-down' : '',
    },
    {
      label: 'Best / worst',
      value: `${s.best === null ? '—' : signed(s.best, 2)} / ${s.worst === null ? '—' : signed(s.worst, 2)}`,
    },
    { label: 'Fees', value: dec(s.fees, 2) },
  ]
})

// --- the equity curve (closed P&L), drawn to the replay so far --------------------------
const EQ_W = 600
const EQ_H = 90
const equity = computed(() => {
  const pts = stats.value.equity
  const end = Math.max(1, cursor.value)
  const vals = pts.map((p) => p.value)
  const lo = Math.min(0, ...vals)
  const hi = Math.max(0, ...vals)
  const span = hi - lo || 1
  const x = (bar: number) => (Math.max(0, bar) / end) * EQ_W
  const y = (v: number) => EQ_H - 6 - ((v - lo) / span) * (EQ_H - 12)
  // A step line: equity only moves when a trade closes.
  let d = `M0,${y(0).toFixed(1)}`
  for (const p of pts.slice(1)) d += ` H${x(p.bar).toFixed(1)} V${y(p.value).toFixed(1)}`
  d += ` H${EQ_W}`
  const zero = y(0)
  return {
    line: d,
    area: `${d} V${zero.toFixed(1)} H0 Z`,
    zero,
    up: (vals.at(-1) ?? 0) >= 0,
    hi,
    lo,
  }
})
</script>

<template>
  <div class="br" @keydown="onKey">
    <div v-if="loading" class="br__loading">
      <Skeleton :lines="1" height="72px" radius="var(--radius-card)" />
      <Skeleton :lines="1" height="420px" radius="var(--radius-card)" />
    </div>
    <div v-else-if="error" class="br__error" role="alert">
      <Icon name="triangle-alert" size="md" />
      <span>{{ error }}</span>
      <Button size="sm" variant="secondary" @click="load">Try again</Button>
    </div>
    <div v-else-if="!candles.length" class="br__error">
      <Icon name="chart-candlestick" size="md" />
      <span>
        No stored candles for {{ title }} over this period, so there is nothing to replay. Open the
        chart to fetch its history, then come back.
      </span>
    </div>

    <template v-else>
      <!-- The score at the replay's point. -->
      <section class="br__kpis" aria-label="Score so far">
        <div v-for="k in kpis" :key="k.label" class="br__kpi" :class="{ 'is-big': k.big }">
          <span class="br__kpiLabel">{{ k.label }}</span>
          <span class="br__kpiValue tp-num" :class="k.tone">{{ k.value }}</span>
          <span v-if="k.note" class="br__kpiNote">{{ k.note }}</span>
        </div>
      </section>

      <div class="br__main">
        <div class="br__left">
          <section class="br__card br__chart" aria-label="Replay chart">
            <CandleChart
              :candles="shown"
              :timeframe="tf"
              :markers="markers"
              :height="380"
              :series-key="run.id"
              :initial-bars="120"
              :label="`${title} backtest replay`"
            />
          </section>

          <!-- Transport. -->
          <section class="br__card br__transport" aria-label="Replay controls">
            <div class="br__buttons">
              <IconButton label="Back to the start" size="sm" @click="(pause(), seek(0))">
                <Icon name="skip-back" size="sm" />
              </IconButton>
              <IconButton label="Previous trade  [" size="sm" @click="jumpTrade(-1)">
                <Icon name="chevron-left" size="sm" />
              </IconButton>
              <IconButton label="One bar back  ," size="sm" @click="step(-1)">
                <Icon name="step-back" size="sm" />
              </IconButton>
              <button
                type="button"
                class="br__play"
                :aria-label="playing ? 'Pause (Space)' : 'Play (Space)'"
                :aria-pressed="playing"
                @click="toggle"
              >
                <Icon :name="playing ? 'pause' : 'play'" size="md" />
              </button>
              <IconButton label="One bar on  ." size="sm" @click="step(1)">
                <Icon name="step-forward" size="sm" />
              </IconButton>
              <IconButton label="Next trade  ]" size="sm" @click="jumpTrade(1)">
                <Icon name="chevron-right" size="sm" />
              </IconButton>
              <IconButton label="Jump to the end" size="sm" @click="(pause(), seek(last))">
                <Icon name="skip-forward" size="sm" />
              </IconButton>
            </div>

            <div class="br__scrub">
              <div class="br__track" aria-hidden="true">
                <span class="br__fill" :style="{ width: `${progress * 100}%` }" />
                <span
                  v-for="t in placed"
                  :key="t.n"
                  class="br__tick"
                  :class="(t.pnl ?? 0) > 0 ? 'is-up' : (t.pnl ?? 0) < 0 ? 'is-down' : ''"
                  :style="{ left: `${(Math.max(0, t.entryBar) / Math.max(1, last)) * 100}%` }"
                />
              </div>
              <Slider
                :model-value="cursor"
                :min="0"
                :max="last"
                :step="1"
                label="Replay position"
                @update:model-value="(v: number) => (pause(), seek(v))"
              />
            </div>

            <div class="br__where">
              <span class="br__time tp-num">{{ cursorTime }}</span>
              <span class="br__bar tp-num">bar {{ cursor + 1 }} / {{ last + 1 }}</span>
              <SegmentedControl
                v-model="speed"
                :options="speedOptions"
                size="sm"
                aria-label="Replay speed, candles per second"
              />
            </div>
          </section>

          <!-- Equity: closed P&L so far. -->
          <section class="br__card br__equity" aria-label="Equity curve">
            <div class="br__eqHead">
              <span class="br__kpiLabel">Equity (closed P&amp;L)</span>
              <span class="br__kpiNote tp-num"
                >high {{ signed(equity.hi, 2) }} · low {{ signed(equity.lo, 2) }}</span
              >
            </div>
            <svg
              class="br__eq"
              :class="equity.up ? 'is-up' : 'is-down'"
              :viewBox="`0 0 ${EQ_W} ${EQ_H}`"
              preserveAspectRatio="none"
              role="img"
              :aria-label="`Equity ${signed(stats.net, 2)} after ${stats.closed} trades`"
            >
              <line class="br__eqZero" x1="0" :x2="EQ_W" :y1="equity.zero" :y2="equity.zero" />
              <path class="br__eqArea" :d="equity.area" />
              <path class="br__eqLine" :d="equity.line" />
            </svg>
          </section>
        </div>

        <aside class="br__card br__log">
          <BacktestTradeLog
            :placed="placed"
            :cursor="cursor"
            :price="price"
            :active-n="activeN"
            @seek="seekTrade"
          />
        </aside>
      </div>

      <p class="br__foot">
        Simulated fills at the next bar's open, with the run's costs. Space plays and pauses, , and
        . step a bar, [ and ] jump between trades.
        <template v-if="truncated">
          The period has more than 5,000 candles; the first 5,000 are replayed.</template
        >
      </p>
    </template>
  </div>
</template>

<style scoped>
.br {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  min-height: 0;
}
.br__loading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.br__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-6, 32px) var(--sp-4);
  text-align: center;
  color: var(--theme-dim);
}
.br__card {
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
  padding: var(--sp-3);
  min-width: 0;
}
/* --- the score ------------------------------------------------------------------------ */
.br__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--sp-2);
}
.br__kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
  min-width: 0;
}
.br__kpi.is-big {
  background: color-mix(in oklch, var(--theme-accent) 6%, var(--theme-card));
}
.br__kpiLabel {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.br__kpiValue {
  min-width: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
  overflow-wrap: anywhere;
}
.br__kpi.is-big .br__kpiValue {
  font-size: var(--text-xl);
}
.br__kpiValue.is-up {
  color: var(--theme-success);
}
.br__kpiValue.is-down {
  color: var(--theme-danger);
}
.br__kpiNote {
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
/* --- layout: chart and controls on the left, the log on the right --------------------- */
.br__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
  gap: var(--sp-3);
  min-height: 0;
}
.br__left {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.br__log {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 260px);
  min-height: 360px;
}
@media (max-width: 1000px) {
  .br__main {
    grid-template-columns: minmax(0, 1fr);
  }
  .br__log {
    max-height: 520px;
  }
}
/* --- transport ------------------------------------------------------------------------- */
.br__transport {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-4);
}
.br__buttons {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.br__play {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin: 0 4px;
  border-radius: 50%;
  border: 0;
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
  cursor: pointer;
  transition: transform var(--dur-fast) ease;
}
.br__play:hover {
  transform: scale(1.05);
}
.br__play:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 3px;
}
.br__scrub {
  position: relative;
  flex: 1 1 260px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.br__track {
  position: relative;
  height: 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  overflow: hidden;
}
.br__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in oklch, var(--theme-accent) 35%, transparent);
}
.br__tick {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: var(--theme-dim);
}
.br__tick.is-up {
  background: var(--theme-success);
}
.br__tick.is-down {
  background: var(--theme-danger);
}
.br__where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  min-width: 0;
}
.br__time {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--theme-text);
}
.br__bar {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
/* --- equity ---------------------------------------------------------------------------- */
.br__eqHead {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.br__eq {
  display: block;
  width: 100%;
  height: 90px;
  --eq: var(--theme-success);
}
.br__eq.is-down {
  --eq: var(--theme-danger);
}
.br__eqZero {
  stroke: var(--theme-border);
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}
.br__eqArea {
  fill: color-mix(in oklch, var(--eq) 14%, transparent);
}
.br__eqLine {
  fill: none;
  stroke: var(--eq);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.br__foot {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .br__play {
    transition: none;
  }
}
</style>

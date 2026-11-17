<script setup lang="ts">
// The one chart viewer for Stock Signals, inside the desktop dialog or the
// phone's bottom drawer (SignalChartHost). Real Dhan candles with the server's
// EMA 8, EMA 32 and session VWAP, the crossover candle marked (▲ / ▼) apart from
// the VWAP-confirmation candle (B / S), the volume pane, crosshair, zoom / pan
// and fit-to-screen, a timeframe switch that re-reads only this chart, and the
// engine's own reading of the signal beside it.
//
// Daily bars: no VWAP line is drawn (the compute endpoint has no intraday VWAP
// on them); the engine's daily state carries the session VWAP it built from
// 15-minute candles, and the detail panel shows it as that.
import { computed, ref, shallowRef, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CandleChart, {
  type ChartGroup,
  type ChartMarker,
} from '@/components/trading/CandleChart.vue'
import SignalDetail from './SignalDetail.vue'
import { colorCss, fmtNum } from '@/trading/studies'
import { loadSeries, type Series } from '@/trading/stockSignals/series'
import {
  SIGNAL_TFS,
  barForClose,
  latestFor,
  type PortfolioHolding,
  type SignalEvent,
  type SignalTf,
  type StateRow,
} from '@/trading/stockSignals/api'
import type { Target } from '@/trading/stockSignals/useStockSignals'

const props = defineProps<{
  target: Target
  /** The signal's own timeframe: the chart opens on it. */
  tf: SignalTf
  /** The engine's state and newest event on `tf`, when the page already has them. */
  state?: StateRow | null
  event?: SignalEvent | null
  holding?: PortfolioHolding | null
  now: number
  tall?: boolean
}>()
const emit = defineEmits<{ watchlist: []; alert: [] }>()

const tf = ref<SignalTf>(props.tf)
watch(
  () => [props.target.id, props.tf] as const,
  ([, t]) => (tf.value = t),
)
const tfOptions = SIGNAL_TFS.map((t) => ({ value: t, label: t === '1d' ? '1D' : t.toUpperCase() }))

// --- the engine's reading for the shown timeframe ----------------------------------------
const state = shallowRef<StateRow | null>(props.state ?? null)
const event = shallowRef<SignalEvent | null>(props.event ?? null)
const signalNote = ref('')
let sigSeq = 0
async function loadSignal() {
  const mine = ++sigSeq
  signalNote.value = ''
  if (tf.value === props.tf && (props.state || props.event)) {
    state.value = props.state ?? null
    event.value = props.event ?? null
    return
  }
  state.value = null
  event.value = null
  try {
    const d = await latestFor(props.target.id, props.target.symbol, tf.value)
    if (mine !== sigSeq) return
    if (d) {
      state.value = d.current ?? null
      event.value = d.event
    } else signalNote.value = `No EMA 8/32 crossover on ${tf.value} within the stored history.`
  } catch (e) {
    if (mine === sigSeq) signalNote.value = (e as Error).message || 'The signal could not be read.'
  }
}

// --- the candles and lines ------------------------------------------------------------
const series = shallowRef<Series | null>(null)
const loading = ref(false)
const error = ref('')
let seq = 0
async function load(force = false) {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const s = await loadSeries(props.target.id, tf.value, force)
    if (mine === seq) series.value = s
  } catch (e) {
    if (mine === seq) error.value = (e as Error).message || 'The chart could not be loaded.'
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(
  [() => props.target.id, tf],
  () => {
    void load()
    void loadSignal()
  },
  { immediate: true },
)

function line(label: string, values: (number | null)[], color: string, dashed = false) {
  return {
    key: 'value',
    label,
    color,
    style: dashed ? ('dashed' as const) : ('line' as const),
    values,
    display: values.map((v) => (v === null ? null : fmtNum(v))),
  }
}
const overlays = computed<ChartGroup[]>(() => {
  const s = series.value
  if (!s) return []
  const out: ChartGroup[] = [
    {
      id: 'ema8',
      label: 'EMA 8',
      source: 'server',
      lines: [line('EMA 8', s.ema8, colorCss('accent'))],
    },
    {
      id: 'ema32',
      label: 'EMA 32',
      source: 'server',
      lines: [line('EMA 32', s.ema32, colorCss('warning'))],
    },
  ]
  if (tf.value !== '1d')
    out.push({
      id: 'vwap',
      label: 'VWAP (session)',
      source: 'server',
      lines: [line('VWAP', s.vwap, colorCss('info'), true)],
    })
  return out
})
const markers = computed<ChartMarker[]>(() => {
  const s = series.value
  const e = event.value
  if (!s || !e) return []
  const out: ChartMarker[] = []
  const up = e.direction === 'bullish'
  const cross = barForClose(s.time, e.crossed_at)
  if (cross >= 0)
    out.push({
      index: cross,
      kind: up ? 'bull' : 'bear',
      confirmed: true,
      label: `EMA 8/32 ${up ? 'bullish' : 'bearish'} cross`,
    })
  const conf = barForClose(s.time, e.confirmed_at)
  if (conf >= 0)
    out.push({
      index: conf,
      kind: up ? 'buy' : 'sell',
      confirmed: true,
      label: 'VWAP confirmed the cross',
    })
  return out
})

const chart = ref<InstanceType<typeof CandleChart> | null>(null)
function fit() {
  const n = series.value?.bars.length ?? 0
  chart.value?.setView({ start: 0, end: n + 2 })
}
</script>

<template>
  <div class="cv" :class="{ 'is-tall': tall }">
    <div class="cv__bar">
      <div class="cv__id">
        <span class="cv__sym">{{ target.symbol }}</span>
        <span class="cv__name"
          >{{ target.name
          }}<template v-if="target.exchange"> · {{ target.exchange }}</template></span
        >
      </div>
      <SegmentedControl v-model="tf" :options="tfOptions" size="sm" aria-label="Timeframe" />
      <span class="cv__tools">
        <Button size="sm" variant="ghost" :disabled="!series" @click="fit">
          <Icon name="scan" size="sm" />Fit
        </Button>
        <Button size="sm" variant="ghost" :loading="loading" @click="load(true)">
          <Icon name="refresh-cw" size="sm" />Refresh
        </Button>
      </span>
    </div>
    <p class="cv__key" aria-hidden="true">
      <span>▲ ▼ EMA 8/32 cross candle</span>
      <span>B / S VWAP confirmation candle</span>
      <span v-if="tf === '1d'">Daily: no VWAP line</span>
    </p>

    <div class="cv__body">
      <div class="cv__chart">
        <Skeleton
          v-if="loading && !series"
          :lines="1"
          :height="tall ? '520px' : '380px'"
          radius="var(--radius-card)"
        />
        <div v-else-if="error && !series" class="cv__empty" role="alert">
          <Icon name="triangle-alert" size="md" />
          <span>{{ error }}</span>
          <Button size="sm" variant="secondary" @click="load(true)">Try again</Button>
        </div>
        <div v-else-if="series && !series.bars.length" class="cv__empty">
          <Icon name="chart-candlestick" size="md" />
          <span>No stored candles for this stock on {{ tf }} yet.</span>
        </div>
        <CandleChart
          v-else-if="series"
          ref="chart"
          :candles="series.bars"
          :timeframe="tf"
          :overlays="overlays"
          :markers="markers"
          :height="tall ? 520 : 380"
          :series-key="`${target.id}:${tf}`"
          :label="`${target.symbol} ${tf} chart`"
        />
      </div>
      <aside class="cv__side">
        <p v-if="signalNote && !state" class="cv__note">{{ signalNote }}</p>
        <SignalDetail :state="state" :event="event" :holding="holding" :now="now">
          <Button size="sm" variant="secondary" @click="emit('watchlist')">
            <Icon name="star" size="sm" />Add to watchlist
          </Button>
          <Button size="sm" variant="secondary" @click="emit('alert')">
            <Icon name="bell" size="sm" />Alerts
          </Button>
        </SignalDetail>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.cv {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.cv__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  padding-right: 40px;
}
.cv__id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-right: auto;
}
.cv__sym {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.cv__name {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  overflow-wrap: anywhere;
}
.cv__tools {
  display: inline-flex;
  gap: 4px;
}
.cv__tools :deep(.ui-icon) {
  margin-right: 4px;
}
.cv__key {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.cv__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 330px);
  gap: var(--sp-3);
  min-width: 0;
}
@media (max-width: 900px) {
  .cv__body {
    grid-template-columns: minmax(0, 1fr);
  }
}
.cv__chart {
  min-width: 0;
}
.cv__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
}
.cv__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.cv__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-6, 32px);
  text-align: center;
  color: var(--theme-dim);
}
</style>

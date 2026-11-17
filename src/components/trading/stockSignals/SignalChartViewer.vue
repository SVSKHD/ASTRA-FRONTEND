<script setup lang="ts">
// The one chart viewer for Stock Signals, shown inside the desktop dialog or the
// phone's bottom drawer (SignalChartHost). Real Dhan candles with EMA 8, EMA 32
// and session VWAP drawn from the server's computed values, the EMA cross marked
// on its candle (▲ / ▼) and VWAP's confirmation marked separately (B / S), the
// volume pane, crosshair, zoom / pan and fit-to-screen, a timeframe switch that
// re-reads only this chart, and the signal's details beside it.
//
// Daily bars have no session VWAP: the line is not drawn and the reading says so.
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
import type { Timeframe } from '@/trading/chartView'
import { readSignal, SIGNAL_TFS, type Reading, type Series } from '@/trading/stockSignals/classify'
import { loadSeries } from '@/trading/stockSignals/useStockSignals'
import type { HoldingView } from '@/trading/stockSignals/portfolio'
import type { Instrument } from '@/trading/instruments'

const props = defineProps<{
  instrument: Instrument
  /** The signal's own timeframe: the chart opens on it. */
  tf: Timeframe
  now: number
  holding?: HoldingView | null
  /** Taller chart (fullscreen). */
  tall?: boolean
}>()
const emit = defineEmits<{ watchlist: []; alert: [] }>()

const tf = ref<Timeframe>(props.tf)
watch(
  () => [props.instrument.id, props.tf] as const,
  ([, t]) => (tf.value = t),
)
const tfOptions = SIGNAL_TFS.map((t) => ({ value: t, label: t === '1d' ? '1D' : t.toUpperCase() }))

const series = shallowRef<Series | null>(null)
const reading = shallowRef<Reading | null>(null)
const loading = ref(false)
const error = ref('')
let seq = 0
async function load(force = false) {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const s = await loadSeries(props.instrument.id, tf.value, force)
    if (mine !== seq) return
    series.value = s
    reading.value = readSignal(s, tf.value)
  } catch (e) {
    if (mine !== seq) return
    error.value = (e as Error).message || 'The chart could not be loaded.'
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch([() => props.instrument.id, tf], () => void load(), { immediate: true })

function line(
  key: string,
  label: string,
  values: (number | null)[],
  color: string,
  dashed = false,
) {
  return {
    key,
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
      lines: [line('value', 'EMA 8', s.ema8, colorCss('accent'))],
    },
    {
      id: 'ema32',
      label: 'EMA 32',
      source: 'server',
      lines: [line('value', 'EMA 32', s.ema32, colorCss('warning'))],
    },
  ]
  if (tf.value !== '1d')
    out.push({
      id: 'vwap',
      label: 'VWAP (session)',
      source: 'server',
      lines: [line('value', 'VWAP', s.vwap, colorCss('info'), true)],
    })
  return out
})
const markers = computed<ChartMarker[]>(() => {
  const r = reading.value
  const out: ChartMarker[] = []
  if (r?.cross)
    out.push({
      index: r.cross.index,
      kind: r.cross.direction === 'up' ? 'bull' : 'bear',
      confirmed: true,
      label: `EMA 8/32 cross ${r.cross.direction === 'up' ? 'up' : 'down'}`,
    })
  if (r?.confirmed)
    out.push({
      index: r.confirmed.index,
      kind: r.cross?.direction === 'up' ? 'buy' : 'sell',
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
        <span class="cv__sym">{{ instrument.trading_symbol || instrument.symbol }}</span>
        <span class="cv__name"
          >{{ instrument.name || instrument.display_name }} · {{ instrument.exchange }}</span
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
      <span>▲▼ EMA 8/32 cross</span>
      <span v-if="tf !== '1d'">B / S VWAP confirmation</span>
      <span v-else>Daily bars: no session VWAP</span>
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
          :series-key="`${instrument.id}:${tf}`"
          :label="`${instrument.symbol} ${tf} chart`"
        />
      </div>
      <aside class="cv__side">
        <SignalDetail
          :reading="reading"
          :tf="tf"
          :now="now"
          :holding="holding"
          :error="error"
          compact
        >
          <Button size="sm" variant="secondary" @click="emit('watchlist')">
            <Icon name="star" size="sm" />Add to watchlist
          </Button>
          <Button size="sm" variant="secondary" @click="emit('alert')">
            <Icon name="bell" size="sm" />Create alert
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
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
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
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
}
.cv__side :deep(.ui-icon) {
  margin-right: 4px;
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

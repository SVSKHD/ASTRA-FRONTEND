<script setup lang="ts">
// Charts & Indicators (/trading/charts): one instrument's stored candles, its live
// quote, the strategy signals on it, and the studies the user adds.
//
// Deep link: /trading/charts?instrument=<id>&tf=<timeframe> (sections.ts `chartPath`),
// so the Explorer, the Screener and the Watchlists open a chart directly.
//
// Data rules (docs/market-terminal.md): candles come from GET /api/trading/candles and
// are never invented; the newest candle is UNCONFIRMED while its period has not ended
// by the server's clock (§3); stored indicator rows are used when their name matches
// and every other study is calculated in the browser and labelled so (§4). Nothing on
// this page places, changes or cancels an order.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SlideOver from '@/components/ui/SlideOver.vue'
import CandleChart, { type ChartGroup, type ChartMarker } from './CandleChart.vue'
import IndicatorStudio from './IndicatorStudio.vue'
import InstrumentPicker from './InstrumentPicker.vue'
import SourceTag from './SourceTag.vue'
import { aureon, type components } from '@/api/client'
import { useNow } from '@/control/poll'
import { useUiStore } from '@/stores/ui'
import { marketOpen, quoteFreshness } from '@/trading/dhanHealth'
import { ago, dec } from '@/trading/format'
import { ema } from '@/trading/indicators'
import type { Instrument } from '@/trading/instruments'
import { chartPath } from '@/trading/sections'
import { syncStudio } from '@/trading/studioSync'
import { requestHistory, type HistoryState } from '@/trading/history'
import { connect, live } from '@/trading/stream'
import { ApiFailure, must } from '@/trading/useLoad'
import { useLiveQuotes } from '@/trading/liveQuotes'
import { mergeTick, sameCandles, stableCandles } from '@/trading/stockChart'
import { readWatchlist } from '@/trading/watchlist'
import { allInstruments, watchlistStore } from '@/trading/watchlists'
import {
  TIMEFRAMES,
  fullTime,
  isStale,
  isTimeframe,
  isUnconfirmed,
  type Timeframe,
} from '@/trading/chartView'
import {
  computeStudy,
  createStudio,
  crossMarkers,
  serverName,
  sourceOf,
  studyLabel,
  toNumbers,
  type ServerRow,
  type ValueSource,
} from '@/trading/studies'

defineProps<{ accounts?: unknown[] }>()

type Candle = components['schemas']['CandleOut']
type Signal = components['schemas']['SignalOut']

/** Candles asked for: a few thousand at most; only the visible window is drawn. */
const CANDLE_LIMIT = 1500
/** The indicators endpoint's maximum page. */
const INDICATOR_LIMIT = 500
const REFRESH_MS = 60_000
const HISTORY_POLL_MS = 15_000

const route = useRoute()
const router = useRouter()
const { isPhone } = storeToRefs(useUiStore())

const instrumentId = computed(() => {
  const n = Number(route.query.instrument)
  return Number.isInteger(n) && n > 0 ? n : 0
})
const tf = computed<Timeframe>(() => (isTimeframe(route.query.tf) ? route.query.tf : '15m'))
const TF_OPTIONS = TIMEFRAMES.map((t) => ({ value: t, label: t }))

function open(id: number, timeframe: Timeframe = tf.value) {
  void router.replace(chartPath(id, timeframe))
}
function setTf(t: string) {
  if (isTimeframe(t) && instrumentId.value) open(instrumentId.value, t)
  else if (isTimeframe(t)) void router.replace({ query: { ...route.query, tf: t } })
}

// --- Instrument ------------------------------------------------------------------

const lists = watchlistStore()
/** The quick-pick: instruments on the user's watchlists (read only here). */
const quick = computed(() => allInstruments(lists.lists).slice(0, 16))
const picked = ref<Instrument | null>(null)
function onPick(i: Instrument) {
  picked.value = i
  open(i.id)
}
const symbol = computed(() => {
  const id = instrumentId.value
  if (!id) return ''
  if (picked.value?.id === id) return picked.value.symbol
  return quick.value.find((w) => w.id === id)?.symbol ?? `Instrument #${id}`
})

// --- Candles ---------------------------------------------------------------------

interface Loaded {
  key: string
  candles: Candle[]
  /** The server's clock at the response (Date header), or null when it sent none. */
  serverNow: number | null
  /** The browser's clock at the same moment, to carry the server's clock forward. */
  loadedAt: number
}
const loaded = shallowRef<Loaded | null>(null)
const loading = ref(false)
const error = ref('')
let seq = 0

const key = computed(() => (instrumentId.value ? `${instrumentId.value}:${tf.value}` : ''))

async function loadCandles() {
  const id = instrumentId.value
  const t = tf.value
  const k = key.value
  const mine = ++seq
  // Never show one instrument's candles under another's name.
  if (loaded.value?.key !== k) loaded.value = null
  error.value = ''
  if (!id) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const r = await aureon.GET('/api/trading/candles', {
      params: { query: { instrument_id: id, timeframe: t, limit: CANDLE_LIMIT } },
    })
    const rows = must(r)
    if (mine !== seq) return
    const date = Date.parse(r.response.headers.get('date') ?? '')
    const got = rows.filter((c) => !c.is_gap)
    const prev = loaded.value?.key === k ? loaded.value.candles : null
    loaded.value = {
      key: k,
      // Same candles as before: keep the same array, so the chart does not redraw.
      candles: prev && sameCandles(prev, got) ? prev : got,
      serverNow: Number.isNaN(date) ? null : date,
      loadedAt: Date.now(),
    }
    if (!loaded.value.candles.length) void askForHistory(id, t, k)
  } catch (e) {
    if (mine !== seq) return
    error.value =
      e instanceof ApiFailure
        ? `Candles could not be loaded: ${e.message}`
        : 'Candles could not be loaded. Check the connection.'
  } finally {
    if (mine === seq) loading.value = false
  }
}

// --- History on demand: an empty chart asks the server to fetch it from Dhan -------

const history = ref<{ key: string; state: HistoryState } | null>(null)
async function askForHistory(id: number, t: Timeframe, k: string) {
  const state = await requestHistory(id, t)
  if (key.value === k) history.value = { key: k, state }
}
const historyState = computed(() =>
  history.value && history.value.key === key.value ? history.value.state : null,
)
const emptyTitle = computed(() =>
  historyState.value?.state === 'queued'
    ? 'Loading history from Dhan…'
    : 'No candles stored for this timeframe',
)
const emptyText = computed(() => {
  const h = historyState.value
  if (!h) return 'Asking the server for the history of this instrument…'
  if (h.state === 'queued') {
    return 'Queued for the research worker, which fetches it from Dhan. This chart refreshes by itself when the candles arrive. If nothing comes, check that the research worker is running.'
  }
  if (h.state === 'unsupported') return h.reason
  if (h.state === 'rejected') return `Dhan cannot serve this history: ${h.reason}.`
  return `History could not be requested: ${h.reason}. Try another timeframe or reload.`
})

const stored = computed(() => loaded.value?.candles ?? [])
const now = useNow(5_000)
// The live price moves the newest candle while the market is open (at most once a
// second): the chart shows the price as it changes, between candle reads.
const liveQuote = useLiveQuotes(() => (instrumentId.value ? [instrumentId.value] : []))
const keep = stableCandles<Candle>()
const candles = computed<Candle[]>(() => {
  const q = instrumentId.value ? liveQuote.value.get(instrumentId.value) : undefined
  const merged =
    q && !q.stale && marketOpen(now.value)
      ? (mergeTick(stored.value, q.ltp, q.received_at, tf.value, now.value) as Candle[])
      : stored.value
  return keep(merged) as Candle[]
})
/** The server's clock when it told us, carried forward by the browser's. */
const serverNow = computed(() => {
  const l = loaded.value
  return l?.serverNow != null ? l.serverNow + (now.value - l.loadedAt) : now.value
})
const lastCandle = computed(() => candles.value[candles.value.length - 1])
const unconfirmedLast = computed(
  () => !!lastCandle.value && isUnconfirmed(lastCandle.value.ts, tf.value, serverNow.value),
)
const stale = computed(
  () => !!lastCandle.value && isStale(lastCandle.value.ts, tf.value, serverNow.value),
)

// --- Signals (server) ------------------------------------------------------------

const signals = shallowRef<Signal[]>([])
const signalsError = ref('')
async function loadSignals() {
  const id = instrumentId.value
  signals.value = []
  signalsError.value = ''
  if (!id) return
  try {
    const page = must(
      await aureon.GET('/api/trading/signals', {
        params: { query: { instrument_id: id, limit: 200 } },
      }),
    )
    if (id === instrumentId.value) signals.value = page.items
  } catch (e) {
    signalsError.value = (e as Error).message || 'Signals could not be loaded.'
  }
}

// --- Studies ---------------------------------------------------------------------

const studio = createStudio()
// Your indicators follow you: saved to your account, not just this browser.
onBeforeUnmount(syncStudio(studio))
const studioOpen = ref(false)
const numbers = computed(() => toNumbers(candles.value))

/** Stored indicator names the studies on the chart can use. */
const serverNames = computed(() => {
  const names = new Set<string>()
  for (const s of studio.state.studies) {
    const n = serverName(s)
    if (n) names.add(n)
  }
  return [...names].sort()
})
const serverRows = shallowRef(new Map<string, ServerRow[]>())
const serverRowsError = ref('')
let rowsSeq = 0
async function loadServerRows() {
  const id = instrumentId.value
  const t = tf.value
  const mine = ++rowsSeq
  serverRowsError.value = ''
  if (!id || !serverNames.value.length) {
    serverRows.value = new Map()
    return
  }
  try {
    const pairs = await Promise.all(
      serverNames.value.map(async (name) => {
        const rows = must(
          await aureon.GET('/api/trading/indicators', {
            params: { query: { instrument_id: id, timeframe: t, name, limit: INDICATOR_LIMIT } },
          }),
        )
        return [name, rows.filter((r) => r.name === name)] as const
      }),
    )
    if (mine === rowsSeq) serverRows.value = new Map(pairs)
  } catch (e) {
    if (mine !== rowsSeq) return
    serverRows.value = new Map()
    serverRowsError.value = (e as Error).message || 'not available'
  }
}

const results = computed(() =>
  studio.state.studies
    .filter((s) => s.visible)
    .map((s) => computeStudy(s, numbers.value, serverRows.value)),
)
const sources = computed<Record<string, ValueSource>>(() =>
  Object.fromEntries(
    studio.state.studies.map((s) => [s.id, sourceOf(s, numbers.value.time, serverRows.value)]),
  ),
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

/** The marked EMA pair's crossovers, from the browser's EMAs on every candle shown. */
const crosses = computed(() => {
  const c = studio.state.cross
  if (!c) return null
  const f = studio.state.studies.find((s) => s.id === c.fast)
  const s = studio.state.studies.find((x) => x.id === c.slow)
  if (!f || !s || !f.visible || !s.visible || !candles.value.length) return null
  const close = numbers.value.close
  const marks = crossMarkers(
    ema(close, f.params[0]),
    ema(close, s.params[0]),
    unconfirmedLast.value,
  )
  return { label: `${studyLabel(f)}/${s.params[0]}`, marks }
})

const markers = computed<ChartMarker[]>(() => {
  const out: ChartMarker[] = []
  const at = new Map(numbers.value.time.map((t, i) => [t, i]))
  const seen = new Set<string>()
  const streamed = live.signals.filter((s) => s.instrument_id === instrumentId.value)
  for (const s of [...signals.value, ...streamed]) {
    if (seen.has(s.id) || s.timeframe !== tf.value) continue
    seen.add(s.id)
    if (s.side !== 'BUY' && s.side !== 'SELL') continue
    const i = at.get(Date.parse(s.candle_time))
    if (i === undefined) continue
    out.push({
      index: i,
      kind: s.side === 'BUY' ? 'buy' : 'sell',
      confirmed: true,
      label: `${s.side} signal`,
    })
  }
  for (const m of crosses.value?.marks ?? []) {
    out.push({
      index: m.index,
      kind: m.side === 'bullish' ? 'bull' : 'bear',
      confirmed: m.confirmed,
      label: `${m.side === 'bullish' ? 'Bullish' : 'Bearish'} cross`,
    })
  }
  return out
})
const signalCount = computed(
  () => markers.value.filter((m) => m.kind === 'buy' || m.kind === 'sell').length,
)
const recentCrosses = computed(() =>
  (crosses.value?.marks ?? [])
    .slice(-5)
    .reverse()
    .map((m) => ({
      key: m.index,
      side: m.side === 'bullish' ? 'Bullish' : 'Bearish',
      when: fullTime(numbers.value.time[m.index], tf.value),
      confirmed: m.confirmed,
    })),
)

// --- Live quote ------------------------------------------------------------------

const quote = computed(() => (instrumentId.value ? live.quotes[instrumentId.value] : undefined))
const fresh = computed(() =>
  quote.value ? quoteFreshness(quote.value, live.status, now.value) : null,
)

// --- Lifecycle -------------------------------------------------------------------

watch(
  key,
  () => {
    void loadCandles()
    void loadSignals()
  },
  { immediate: true },
)
watch([key, () => serverNames.value.join()], () => void loadServerRows(), { immediate: true })
// The stream follows every watchlist instrument plus the one on the chart.
watch(instrumentId, (id) => connect([...readWatchlist().map((w) => w.id), ...(id ? [id] : [])]), {
  immediate: true,
})

let timer: ReturnType<typeof setInterval> | undefined
let historyTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (!instrumentId.value && quick.value.length) open(quick.value[0].id)
  timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    // The market is shut: nothing new to read, and a re-read would only redraw.
    if (!marketOpen(Date.now())) return
    if (instrumentId.value && !loading.value) void loadCandles()
  }, REFRESH_MS)
  // While history is being fetched, look for it more often than the usual refresh.
  historyTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (historyState.value?.state === 'queued' && !candles.value.length && !loading.value) {
      void loadCandles()
    }
  }, HISTORY_POLL_MS)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(historyTimer)
  connect(readWatchlist().map((w) => w.id))
})

const optionsOpen = ref(false)
function pickFromSheet(id: number) {
  open(id)
  optionsOpen.value = false
}
const staleAgo = computed(() => (lastCandle.value ? ago(lastCandle.value.ts) : ''))
const loadedAtText = computed(() =>
  loaded.value ? new Date(loaded.value.loadedAt).toLocaleTimeString() : '',
)
</script>

<template>
  <div class="tp-page tc">
    <Card class="tc__card">
      <template #header>
        <div class="tc__toolbar" role="toolbar" aria-label="Chart toolbar">
          <div class="tc__picker">
            <InstrumentPicker
              :key="instrumentId"
              :model-value="instrumentId ? String(instrumentId) : ''"
              :selected-label="symbol"
              size="sm"
              placeholder="Search an instrument to chart…"
              @pick="onPick"
            />
          </div>
          <SegmentedControl
            v-if="!isPhone"
            :model-value="tf"
            :options="TF_OPTIONS"
            size="sm"
            aria-label="Timeframe"
            @update:model-value="setTf"
          />
          <Button variant="primary" size="sm" class="tc__add" @click="studioOpen = true">
            <Icon name="plus" size="sm" /> Add Indicator
          </Button>
          <IconButton
            v-if="!isPhone"
            label="Reload candles"
            size="sm"
            :disabled="!instrumentId || loading"
            @click="loadCandles"
          >
            <Icon name="refresh-cw" size="sm" />
          </IconButton>
          <Button
            v-else
            variant="secondary"
            size="sm"
            aria-haspopup="dialog"
            @click="optionsOpen = true"
          >
            {{ tf }} · Options
          </Button>
        </div>
      </template>

      <div
        v-if="!isPhone && quick.length"
        class="tc__quick"
        role="group"
        aria-label="From your watchlists"
      >
        <span class="tp-note">From your watchlists:</span>
        <Button
          v-for="w in quick"
          :key="w.id"
          size="sm"
          :variant="w.id === instrumentId ? 'tinted' : 'ghost'"
          :aria-pressed="w.id === instrumentId"
          @click="open(w.id)"
          >{{ w.symbol }}</Button
        >
      </div>

      <div
        v-if="studio.state.studies.length"
        class="tc__studies"
        aria-label="Indicators on the chart"
      >
        <button
          v-for="s in studio.state.studies"
          :key="s.id"
          type="button"
          class="tc__study ui-focus-ring"
          :class="{ 'is-off': !s.visible }"
          :aria-label="`${studyLabel(s)}, ${sources[s.id] === 'server' ? 'server values' : 'calculated in the browser'}${s.visible ? '' : ', hidden'}. Edit indicators.`"
          @click="studioOpen = true"
        >
          {{ studyLabel(s) }}
          <span class="tc__study-src">{{ sources[s.id] === 'server' ? 'server' : 'browser' }}</span>
        </button>
      </div>

      <EmptyState
        v-if="!instrumentId"
        title="Pick an instrument to chart"
        description="Search the instrument master above, or pick one from your watchlists. Charts use the candles the market-data agent stored."
      />
      <template v-else>
        <div class="tc__head">
          <h2 class="tp-title">{{ symbol }} · {{ tf }}</h2>
          <p v-if="quote && fresh" class="tp-note tp-num">
            {{ fresh.label }} {{ dec(quote.ltp) }} · {{ ago(quote.received_at) }} · {{ fresh.text }}
            <SourceTag source="broker" />
          </p>
          <p v-else class="tp-note">No live quote for this instrument yet.</p>
        </div>

        <p v-if="error && candles.length" class="tc__problem is-stale" role="status">
          <Icon name="alert-circle" size="sm" />
          <span>
            Stale: showing candles loaded at {{ loadedAtText }}; the last refresh failed.
            {{ error }}
          </span>
          <Button size="sm" variant="ghost" @click="loadCandles">Try again</Button>
        </p>
        <div v-else-if="error" class="tc__problem is-error" role="alert">
          <Icon name="alert-circle" size="sm" />
          <span><strong>Candles unavailable.</strong> {{ error }}</span>
          <Button size="sm" variant="secondary" @click="loadCandles">Try again</Button>
        </div>

        <div v-if="loading && !candles.length" class="tc__loading" aria-busy="true">
          <span class="tp-note">Loading candles…</span>
          <Skeleton height="320px" />
        </div>
        <EmptyState
          v-else-if="!candles.length && !error"
          :title="emptyTitle"
          :description="emptyText"
        />
        <template v-else-if="candles.length">
          <p v-if="stale" class="tp-note" role="status">
            Stale: the newest {{ tf }} candle ({{ staleAgo }}) closed more than 3 bars ago. The
            market may be closed, or the candle feed is behind.
          </p>
          <CandleChart
            :candles="candles"
            :overlays="overlays"
            :panes="panes"
            :markers="markers"
            :unconfirmed-last="unconfirmedLast"
            :series-key="key"
            :timeframe="tf"
            :label="`${symbol} ${tf} candles`"
          />
          <div class="tc__meta">
            <span class="tp-note">
              {{ candles.length }} candles · times in IST ·
              <SourceTag :source="lastCandle?.source ?? 'broker'" />
            </span>
            <span class="tp-note">
              <template v-if="signalsError">Signals unavailable: {{ signalsError }}.</template>
              <template v-else
                >{{ signalCount }} strategy signal{{ signalCount === 1 ? '' : 's' }} on this
                timeframe (B / S markers).</template
              >
            </span>
            <span v-if="serverRowsError" class="tp-note">
              Stored indicator values unavailable ({{ serverRowsError }}); those studies are
              calculated in the browser instead.
            </span>
          </div>
          <section v-if="crosses" class="tc__crosses" aria-label="Crossovers">
            <h3 class="tc__h">{{ crosses.label }} crossovers (calculated in the browser)</h3>
            <p v-if="!recentCrosses.length" class="tp-note">No crossovers in the loaded candles.</p>
            <ul v-else class="tp-list">
              <li v-for="c in recentCrosses" :key="c.key" class="tc__cross">
                <span class="tp-strong">{{ c.side === 'Bullish' ? '↑' : '↓' }} {{ c.side }}</span>
                <span class="tp-note">{{ c.when }}</span>
                <span class="tp-note">{{
                  c.confirmed ? 'confirmed (closed candle)' : 'unconfirmed (live candle)'
                }}</span>
              </li>
            </ul>
          </section>
        </template>
      </template>
    </Card>

    <SlideOver
      v-if="!isPhone"
      :open="studioOpen"
      title="Indicators"
      size="md"
      @close="studioOpen = false"
    >
      <IndicatorStudio :studio="studio" :sources="sources" />
    </SlideOver>
    <BottomSheet v-else :open="studioOpen" title="Indicators" @close="studioOpen = false">
      <IndicatorStudio :studio="studio" :sources="sources" />
    </BottomSheet>

    <BottomSheet
      v-if="isPhone"
      :open="optionsOpen"
      title="Chart options"
      @close="optionsOpen = false"
    >
      <div class="tc__sheet">
        <SegmentedControl
          :model-value="tf"
          :options="TF_OPTIONS"
          size="sm"
          aria-label="Timeframe"
          @update:model-value="setTf"
        />
        <Button
          size="sm"
          variant="secondary"
          :disabled="!instrumentId || loading"
          @click="loadCandles"
        >
          <Icon name="refresh-cw" size="sm" /> Reload candles
        </Button>
        <div v-if="quick.length" class="tc__quick" role="group" aria-label="From your watchlists">
          <span class="tp-note">From your watchlists:</span>
          <Button
            v-for="w in quick"
            :key="w.id"
            size="sm"
            :variant="w.id === instrumentId ? 'tinted' : 'ghost'"
            :aria-pressed="w.id === instrumentId"
            @click="pickFromSheet(w.id)"
            >{{ w.symbol }}</Button
          >
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
.tc__card {
  min-width: 0;
}
.tc__toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}
.tc__picker {
  flex: 1 1 240px;
  min-width: 0;
}
.tc__quick,
.tc__studies,
.tc__sheet {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: wrap;
  min-width: 0;
  margin-bottom: var(--sp-2);
}
.tc__sheet {
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-3);
}
.tc__study {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 2px var(--sp-2);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--text-xs);
  cursor: pointer;
}
.tc__study.is-off {
  color: var(--text-secondary);
  text-decoration: line-through;
}
.tc__study-src {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}
.tc__head,
.tc__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
  margin-bottom: var(--sp-2);
}
.tc__meta {
  margin: var(--sp-2) 0 0;
}
.tc__problem {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  margin: 0 0 var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--theme-border);
  border-left: 3px solid var(--theme-warning);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text-primary);
  min-width: 0;
  overflow-wrap: anywhere;
}
.tc__problem.is-error {
  border-left-color: var(--theme-danger);
}
.tc__problem > span {
  flex: 1 1 200px;
  min-width: 0;
}
.tc__loading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.tc__crosses {
  margin-top: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.tc__h {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.tc__cross {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
@media (pointer: coarse) {
  .tc__toolbar :deep(button),
  .tc__quick :deep(button),
  .tc__study {
    min-height: 44px;
  }
}
</style>

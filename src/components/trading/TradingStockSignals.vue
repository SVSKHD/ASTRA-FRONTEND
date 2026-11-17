<script setup lang="ts">
// Trading → Markets → Stock Signals (/trading/stock-signals).
//
// EMA 8 / 32 + session VWAP for your Dhan holdings, your watchlists and today's
// screener crosses: the market summary, the signals table (expandable rows, row
// actions), market movers, the portfolio map and the alerts centre, with one
// chart viewer (dialog on desktop, bottom drawer on a phone).
//
// Every number is the server's (candles, computed indicators, quotes, holdings,
// screener). The classification is worked out here from those numbers; alerts
// come from the backend's stock-signal monitor and say so when it is absent.
// Nothing on this page places, proposes or queues an order.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Alert from '@/components/ui/Alert.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import MarketClock from '@/components/stocks/MarketClock.vue'
import SignalsTable from './stockSignals/SignalsTable.vue'
import MarketMovers from './stockSignals/MarketMovers.vue'
import PortfolioSignalMap from './stockSignals/PortfolioSignalMap.vue'
import SignalAlerts from './stockSignals/SignalAlerts.vue'
import SignalChartHost from './stockSignals/SignalChartHost.vue'
import SignalActionDialogs, { type ActionKind } from './stockSignals/SignalActionDialogs.vue'
import { useNow } from '@/control/poll'
import { useAppStore } from '@/stores/app'
import { ago } from '@/trading/format'
import { connect } from '@/trading/stream'
import { useLiveQuotes } from '@/trading/liveQuotes'
import { marketOpen } from '@/trading/dhanHealth'
import { cachedInstrument, remember } from '@/trading/resolve'
import { searchInstruments, type Instrument } from '@/trading/instruments'
import type { Timeframe } from '@/trading/chartView'
import { DEFAULT_TF, isStaleAt, SIGNAL_TFS } from '@/trading/stockSignals/classify'
import { useStockSignals, type UniverseItem } from '@/trading/stockSignals/useStockSignals'
import { concentrated, holdingViews, type HoldingView } from '@/trading/stockSignals/portfolio'
import { useSignalNotifications } from '@/trading/stockSignals/useSignalNotifications'
import { EVENT_LABEL, type StockSignalEvent } from '@/trading/stockSignals/alertsApi'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const now = useNow(5_000)

// --- timeframe and tab, kept in the URL -----------------------------------------------------
const TF_KEY = 'aureon.stocksignals.tf.v1'
function savedTf(): Timeframe {
  const q = String(route.query.tf ?? '')
  if ((SIGNAL_TFS as string[]).includes(q)) return q as Timeframe
  try {
    const s = localStorage.getItem(TF_KEY) ?? ''
    if ((SIGNAL_TFS as string[]).includes(s)) return s as Timeframe
  } catch {
    /* default */
  }
  return DEFAULT_TF
}
const tf = ref<Timeframe>(savedTf())
const tfOptions = SIGNAL_TFS.map((t) => ({ value: t, label: t === '1d' ? '1D' : t.toUpperCase() }))
watch(tf, (t) => {
  try {
    localStorage.setItem(TF_KEY, t)
  } catch {
    /* not remembered */
  }
})

type Tab = 'live' | 'movers' | 'portfolio' | 'alerts'
const TABS: Tab[] = ['live', 'movers', 'portfolio', 'alerts']
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'live')
watch(
  tab,
  (t) => void router.replace({ query: { ...route.query, tab: t === 'live' ? undefined : t } }),
)

// --- data ---------------------------------------------------------------------------------------
const { universe, rows, status, load } = useStockSignals()
const items = computed(() => universe.value?.items ?? [])
watch(tf, (t) => void load(t), { immediate: true })
watch(
  () => items.value.map((i) => i.instrument.id).join(),
  () => connect(items.value.map((i) => i.instrument.id)),
)
const quotes = useLiveQuotes(() => items.value.map((i) => i.instrument.id))
const isOpen = computed(() => marketOpen(now.value))

// Keep intraday signals current while NSE trades, quietly, every two minutes.
let refresher: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refresher = setInterval(() => {
    if (!marketOpen(Date.now()) || status.loading) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    void load(tf.value, { quiet: true, force: true })
  }, 120_000)
})
onBeforeUnmount(() => clearInterval(refresher))

// --- holdings -------------------------------------------------------------------------------------
const held = computed(() => {
  const list = items.value.filter((i) => i.holding)
  const views = holdingViews(
    list.map((i) => {
      const q = quotes.value.get(i.instrument.id)
      const price =
        (q?.ltp && !q.stale ? Number(q.ltp) : null) ??
        rows[i.instrument.id]?.reading?.close ??
        i.holding!.lastPrice
      return {
        symbol: i.instrument.symbol,
        quantity: i.holding!.quantity,
        avgCost: i.holding!.avgCost,
        price,
      }
    }),
  )
  return views.map((view) => ({
    view,
    item: list.find((i) => i.instrument.symbol === view.symbol)!,
  }))
})
const holdingById = computed(
  () => new Map<number, HoldingView>(held.value.map((h) => [h.item.instrument.id, h.view])),
)
const candidates = computed(() =>
  items.value
    .filter((i) => i.origins.includes('screener') && !i.holding)
    .sort((a, b) => {
      const ra = rows[a.instrument.id]?.reading
      const rb = rows[b.instrument.id]?.reading
      const score = (r: typeof ra) => (r?.cls === 'bullish' ? 2 : r?.cls === 'pending' ? 1 : 0)
      return score(rb) - score(ra) || (rb?.strength ?? 0) - (ra?.strength ?? 0)
    }),
)

// --- the summary ------------------------------------------------------------------------------
const kpis = computed(() => {
  const readings = items.value.map((i) => rows[i.instrument.id]?.reading).filter((r) => !!r)
  const count = (c: string) => readings.filter((r) => r!.cls === c).length
  const heavy = new Set(concentrated(held.value.map((h) => h.view)).map((v) => v.symbol))
  const warnings = held.value.filter((h) => {
    const r = rows[h.item.instrument.id]?.reading
    return (
      heavy.has(h.view.symbol) ||
      !r ||
      r.cls === 'bearish' ||
      r.cls === 'mixed' ||
      (r.cls === 'pending' && r.cross?.direction === 'down')
    )
  }).length
  const newest = Math.max(0, ...readings.map((r) => r!.asOf ?? 0))
  return {
    bull: count('bullish'),
    bear: count('bearish'),
    pending: count('pending'),
    warnings,
    opportunities: candidates.value.filter((c) => rows[c.instrument.id]?.reading?.cls === 'bullish')
      .length,
    newest: newest || null,
    read: readings.length,
  }
})
const stale = computed(
  () =>
    isOpen.value && kpis.value.newest !== null && isStaleAt(kpis.value.newest, tf.value, now.value),
)
const ready = computed(() => !!universe.value)

// --- alerts -------------------------------------------------------------------------------------
const center = useSignalNotifications((e) =>
  app.showToastMsg(`${e.symbol ?? 'Portfolio'} · ${EVENT_LABEL[e.type] ?? e.type}`),
)
onMounted(center.start)
onBeforeUnmount(center.stop)

// --- chart and actions --------------------------------------------------------------------------
const chartFor = ref<Instrument | null>(null)
const chartTf = ref<Timeframe>(tf.value)
function openChart(i: Instrument, t: Timeframe = tf.value) {
  chartTf.value = t
  chartFor.value = i
  void router.replace({ query: { ...route.query, instrument: String(i.id), ctf: t } })
}
function closeChart() {
  chartFor.value = null
  const { instrument: _i, ctf: _t, ...rest } = route.query
  void router.replace({ query: rest })
}
async function openChartById(id: number, symbol?: string | null, t?: string | null) {
  const want = (SIGNAL_TFS as string[]).includes(t ?? '') ? (t as Timeframe) : tf.value
  const known = items.value.find((i) => i.instrument.id === id)?.instrument ?? cachedInstrument(id)
  if (known) return openChart(known, want)
  if (!symbol) return
  try {
    const page = await searchInstruments({ q: symbol, limit: 20 })
    remember(page.items)
    const hit = page.items.find((i) => i.id === id)
    if (hit) openChart(hit, want)
  } catch {
    app.showToastMsg(`${symbol}'s chart could not be opened.`)
  }
}
// Deep link (?instrument=&ctf=): opens once the stock is known.
watch(
  () => [route.query.instrument, items.value.length] as const,
  ([id]) => {
    const n = Number(id)
    if (!n || chartFor.value?.id === n) return
    const hit = items.value.find((i) => i.instrument.id === n)?.instrument ?? cachedInstrument(n)
    if (hit)
      openChart(
        hit,
        ((SIGNAL_TFS as string[]).includes(String(route.query.ctf))
          ? route.query.ctf
          : tf.value) as Timeframe,
      )
  },
  { immediate: true },
)
function openEvent(e: StockSignalEvent) {
  if (e.instrument_id) void openChartById(e.instrument_id, e.symbol, e.timeframe)
}

const action = ref<{ kind: ActionKind; item: UniverseItem } | null>(null)
function act(kind: ActionKind, item: UniverseItem) {
  action.value = { kind, item }
}
function actOn(kind: ActionKind, i: Instrument) {
  const item = items.value.find((x) => x.instrument.id === i.id) ?? {
    instrument: i,
    origins: [],
    holding: null,
    screener: null,
  }
  act(kind, item)
}
function done(msg: string) {
  action.value = null
  app.showToastMsg(msg)
}

const tabs = computed(() => [
  { value: 'live', label: 'Live Signals' },
  { value: 'movers', label: 'Market Movers' },
  { value: 'portfolio', label: 'Portfolio Map' },
  { value: 'alerts', label: center.unread.value ? `Alerts (${center.unread.value})` : 'Alerts' },
])
</script>

<template>
  <div class="ss tp-page">
    <header class="ss__head">
      <div class="ss__title">
        <h2>Stock Signals</h2>
        <span class="ss__sub"
          >EMA 8 / 32 with session VWAP confirmation · holdings, watchlists and screener
          crosses</span
        >
      </div>
      <MarketClock :now="now" />
      <div class="ss__ctl">
        <SegmentedControl
          v-model="tf"
          :options="tfOptions"
          size="sm"
          aria-label="Signal timeframe"
        />
        <Button
          size="sm"
          variant="ghost"
          :loading="status.loading"
          @click="load(tf, { force: true })"
        >
          <Icon name="refresh-cw" size="sm" />Refresh
        </Button>
        <IconButton
          :label="
            center.unread.value ? `${center.unread.value} unread signal alerts` : 'Signal alerts'
          "
          size="sm"
          class="ss__bell"
          @click="tab = 'alerts'"
        >
          <Icon :name="center.unread.value ? 'bell-ring' : 'bell'" size="sm" />
          <span v-if="center.unread.value" class="ss__badge tp-num" aria-hidden="true">{{
            center.unread.value > 99 ? '99+' : center.unread.value
          }}</span>
        </IconButton>
      </div>
    </header>

    <!-- The market summary. -->
    <section class="ss__kpis" aria-label="Market summary">
      <template v-if="!ready">
        <Skeleton v-for="n in 6" :key="n" :lines="1" height="74px" radius="var(--radius-card)" />
      </template>
      <template v-else>
        <div class="ss__kpi is-bull">
          <span class="ss__kl"><Icon name="trending-up" size="xs" />Bullish confirmed</span>
          <span class="ss__kv tp-num">{{ kpis.bull }}</span>
        </div>
        <div class="ss__kpi is-bear">
          <span class="ss__kl"><Icon name="trending-down" size="xs" />Bearish confirmed</span>
          <span class="ss__kv tp-num">{{ kpis.bear }}</span>
        </div>
        <div class="ss__kpi is-amber">
          <span class="ss__kl"><Icon name="hourglass" size="xs" />Awaiting VWAP</span>
          <span class="ss__kv tp-num">{{ tf === '1d' ? '—' : kpis.pending }}</span>
          <span v-if="tf === '1d'" class="ss__kn">No VWAP on daily bars</span>
        </div>
        <div class="ss__kpi" :class="{ 'is-amber': kpis.warnings }">
          <span class="ss__kl"><Icon name="briefcase" size="xs" />Holdings with warnings</span>
          <span class="ss__kv tp-num">{{ held.length ? kpis.warnings : '—' }}</span>
          <span class="ss__kn">{{
            held.length ? `of ${held.length} held` : 'No Dhan holdings'
          }}</span>
        </div>
        <div class="ss__kpi is-info">
          <span class="ss__kl"><Icon name="sparkles" size="xs" />New opportunities</span>
          <span class="ss__kv tp-num">{{ kpis.opportunities }}</span>
          <span class="ss__kn">bullish screener picks not held</span>
        </div>
        <div class="ss__kpi" :class="{ 'is-amber': stale }">
          <span class="ss__kl"><Icon name="clock" size="xs" />Market data</span>
          <span class="ss__kv ss__kv--sm">
            {{ kpis.newest ? ago(new Date(kpis.newest).toISOString(), now) : 'No bars yet' }}
          </span>
          <span class="ss__kn">
            {{
              stale
                ? 'Stale: newer bars expected'
                : status.updatedAt
                  ? `read ${ago(new Date(status.updatedAt).toISOString(), now)}`
                  : ''
            }}
            · {{ kpis.read }} of {{ items.length }} read
          </span>
        </div>
      </template>
    </section>

    <Alert v-if="status.error" tone="danger" title="Signals could not be loaded">
      {{ status.error }}
      <Button size="sm" variant="secondary" @click="load(tf, { force: true })">Try again</Button>
    </Alert>
    <details v-if="universe?.gaps.length" class="ss__gaps">
      <summary>
        {{ universe.gaps.length }} source{{ universe.gaps.length === 1 ? '' : 's' }} could not be
        read
      </summary>
      <ul>
        <li v-for="g in universe.gaps" :key="g">{{ g }}</li>
      </ul>
    </details>

    <Tabs v-model="tab" :tabs="tabs" aria-label="Stock signals views" size="sm" />

    <SignalsTable
      v-if="tab === 'live'"
      :items="items"
      :rows="rows"
      :holdings="holdingById"
      :quotes="quotes"
      :tf="tf"
      :now="now"
      :loading="status.loading"
      @chart="(i) => openChart(i.instrument)"
      @watchlist="(i) => act('watchlist', i)"
      @alert="(i) => act('alert', i)"
      @impact="(i) => act('impact', i)"
      @compare="(i) => act('compare', i)"
    />
    <MarketMovers
      v-else-if="tab === 'movers'"
      :bullish="universe?.bullish ?? []"
      :bearish="universe?.bearish ?? []"
      :as-of="universe?.screenerAsOf ?? null"
      :items="items"
      :rows="rows"
      :now="now"
      @chart="
        (id) => openChartById(id, items.find((i) => i.instrument.id === id)?.instrument.symbol)
      "
    />
    <PortfolioSignalMap
      v-else-if="tab === 'portfolio'"
      :held="held"
      :candidates="candidates"
      :rows="rows"
      :tf="tf"
      :now="now"
      :loading="status.loading"
      @chart="(i) => openChart(i.instrument)"
    />
    <SignalAlerts v-else :center="center" :now="now" @open="openEvent" />

    <p class="ss__foot">
      Signals are worked out from the server’s candles and indicators; nothing here places or
      proposes an order.
    </p>

    <SignalChartHost
      :instrument="chartFor"
      :tf="chartTf"
      :now="now"
      :holding="chartFor ? (holdingById.get(chartFor.id) ?? null) : null"
      @close="closeChart"
      @watchlist="(i) => actOn('watchlist', i)"
      @alert="(i) => actOn('alert', i)"
    />
    <SignalActionDialogs
      :action="action"
      :items="items"
      :rows="rows"
      :holdings="holdingById"
      :tf="tf"
      :now="now"
      @close="action = null"
      @done="done"
    />
  </div>
</template>

<style scoped>
.ss {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.ss__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-4);
}
.ss__title {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-right: auto;
}
.ss__title h2 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ss__sub {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ss__ctl {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.ss__ctl :deep(.ui-icon) {
  margin-right: 0;
}
.ss__ctl > button :deep(.ui-icon) {
  margin-right: 4px;
}
.ss__bell {
  position: relative;
}
.ss__badge {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--theme-danger);
  color: #fff;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  line-height: 17px;
  text-align: center;
}
.ss__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-2);
}
.ss__kpi {
  --k: var(--theme-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--theme-border);
  border-top: 2px solid var(--k);
  border-radius: var(--radius-card);
  background: var(--theme-card);
  min-width: 0;
}
.ss__kpi.is-bull {
  --k: var(--theme-success);
}
.ss__kpi.is-bear {
  --k: var(--theme-danger);
}
.ss__kpi.is-amber {
  --k: var(--theme-warning);
}
.ss__kpi.is-info {
  --k: var(--theme-accent);
}
.ss__kl {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-dim);
}
.ss__kv {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ss__kv--sm {
  font-size: var(--text-base);
}
.ss__kn {
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ss__gaps {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ss__gaps summary {
  cursor: pointer;
  color: var(--theme-warning);
}
.ss__gaps ul {
  margin: var(--sp-1) 0 0;
  padding-left: 1.2em;
}
.ss__foot {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
</style>

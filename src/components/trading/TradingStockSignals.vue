<script setup lang="ts">
// Trading → Markets → Stock Signals (/trading/stock-signals).
//
// The backend's EMA 8 / 32 + session VWAP signal engine (Aureon docs/37), shown
// as a trading terminal: the market summary, the signals table (expandable
// rows, row actions), market movers, the portfolio map with the rebalance
// preview, and the alerts centre with a bell and toasts; one chart viewer
// (dialog on desktop, bottom drawer on a phone).
//
// Every value is the server's: stored signal states and crossover events,
// rankings, the portfolio map, notifications; the chart draws stored candles
// and computed indicators. Nothing on this page places, proposes or queues an
// order.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tabs from '@/components/ui/Tabs.vue'
import SignalNotice from './stockSignals/SignalNotice.vue'
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
import {
  DEFAULT_TF,
  KIND_LABEL,
  SIGNAL_TFS,
  fetchSignal,
  num,
  type Notification,
  type NotificationKind,
  type PortfolioHolding,
  type SignalEvent,
  type SignalTf,
  type StateRow,
} from '@/trading/stockSignals/api'
import { targetOf, useStockSignals, type Target } from '@/trading/stockSignals/useStockSignals'
import { useSignalNotifications } from '@/trading/stockSignals/useSignalNotifications'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const now = useNow(5_000)

// --- timeframe and tab, kept in the URL ---------------------------------------------------------
const TF_KEY = 'aureon.stocksignals.tf.v1'
const isTf = (v: unknown): v is SignalTf => (SIGNAL_TFS as string[]).includes(String(v))
function savedTf(): SignalTf {
  if (isTf(route.query.tf)) return route.query.tf
  try {
    const s = localStorage.getItem(TF_KEY)
    if (isTf(s)) return s
  } catch {
    /* default */
  }
  return DEFAULT_TF
}
const tf = ref<SignalTf>(savedTf())
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
const sig = useStockSignals()
const { states, total, events, portfolio, trendingBull, movers, status } = sig
watch(tf, (t) => void sig.load(t), { immediate: true })
watch(
  [tab, tf],
  ([t, f]) => {
    if (t === 'movers') void sig.loadMovers(f)
  },
  { immediate: true },
)

// Live prices for the table's visible page (one stream per tab, its ids only).
const visible = shallowRef<number[]>([])
watch(visible, (ids) => {
  if (ids.length) connect(ids)
})
const quotes = useLiveQuotes(() => visible.value)

// The engine stores a new run after each 15-minute close: re-read every 2 minutes in market hours.
let refresher: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refresher = setInterval(() => {
    if (!marketOpen(Date.now()) || status.loading) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    void sig.load(tf.value)
  }, 120_000)
})
onBeforeUnmount(() => clearInterval(refresher))

const candidates = computed(() => (trendingBull.value?.items ?? []).filter((r) => !r.in_holdings))

// --- the summary ---------------------------------------------------------------------------------
const kpis = computed(() => {
  const count = (...s: string[]) => states.value.filter((r) => s.includes(r.state)).length
  const cc = portfolio.value?.classification_counts ?? {}
  const newest = Math.max(
    0,
    ...states.value.map((r) => (r.candle_close_at ? Date.parse(r.candle_close_at) : 0)),
  )
  return {
    bull: count('BULLISH_CONFIRMED'),
    bear: count('BEARISH_CONFIRMED'),
    pending: count('BULLISH_PENDING', 'BEARISH_PENDING'),
    review: cc.REVIEW_RISK ?? 0,
    monitor: cc.MONITOR ?? 0,
    held: portfolio.value?.holdings.length ?? null,
    opportunities: candidates.value.length,
    newest: newest || null,
    runAt: trendingBull.value?.coverage.finished_at ?? null,
  }
})
const ready = computed(() => status.updatedAt > 0 || !!status.error)

// --- alerts -------------------------------------------------------------------------------------
const center = useSignalNotifications((n) =>
  app.showToastMsg(`${n.title} · ${KIND_LABEL[n.kind as NotificationKind] ?? n.kind}`),
)
onMounted(center.start)
onBeforeUnmount(center.stop)

// --- chart --------------------------------------------------------------------------------------
const chart = shallowRef<{
  target: Target
  tf: SignalTf
  state: StateRow | null
  event: SignalEvent | null
} | null>(null)
function openChart(
  target: Target,
  opts: { tf?: SignalTf; state?: StateRow | null; event?: SignalEvent | null } = {},
) {
  const t = opts.tf ?? tf.value
  const sameTf = t === tf.value
  chart.value = {
    target,
    tf: t,
    state:
      opts.state ??
      (sameTf ? (states.value.find((r) => r.instrument_id === target.id) ?? null) : null),
    event: opts.event ?? (sameTf ? (events.value.get(target.id) ?? null) : null),
  }
  void router.replace({
    query: { ...route.query, instrument: String(target.id), ctf: t, signal: undefined },
  })
}
function openRow(r: StateRow) {
  openChart(targetOf(r), { state: r, event: events.value.get(r.instrument_id) ?? null })
}
function closeChart() {
  chart.value = null
  const { instrument: _i, ctf: _t, signal: _s, ...rest } = route.query
  void router.replace({ query: rest })
}
async function openSignal(id: number) {
  try {
    const d = await fetchSignal(id)
    openChart(
      {
        id: d.event.instrument_id,
        symbol: d.event.symbol,
        name: d.event.name,
        exchange: d.event.exchange,
      },
      {
        tf: isTf(d.event.timeframe) ? d.event.timeframe : tf.value,
        state: d.current ?? null,
        event: d.event,
      },
    )
  } catch (e) {
    app.showToastMsg(`That signal could not be opened: ${(e as Error).message}`)
  }
}
function openHolding(h: PortfolioHolding) {
  if (!h.instrument_id) return
  const r = states.value.find((x) => x.instrument_id === h.instrument_id)
  if (r) openRow(r)
  else openChart({ id: h.instrument_id, symbol: h.symbol, name: null, exchange: h.exchange })
}
function openNotification(n: Notification) {
  const sid = (n.payload as { signal_id?: unknown }).signal_id
  if (typeof sid === 'number') return void openSignal(sid)
  if (n.event_id) return void openSignal(n.event_id)
  if (n.instrument_id) {
    const inst = (n.payload as { instrument?: { symbol?: string; exchange?: string } }).instrument
    openChart(
      {
        id: n.instrument_id,
        symbol: inst?.symbol ?? n.title,
        name: null,
        exchange: inst?.exchange ?? null,
      },
      { tf: isTf(n.timeframe) ? n.timeframe : tf.value },
    )
  }
}
// Deep links: ?signal=<id> (a notification's link), or ?instrument=<id>&ctf=<tf>.
watch(
  () => [route.query.signal, route.query.instrument, states.value.length] as const,
  ([s, i]) => {
    const sid = Number(s)
    if (sid && !chart.value) return void openSignal(sid)
    const id = Number(i)
    if (!id || chart.value?.target.id === id) return
    const r = states.value.find((x) => x.instrument_id === id)
    if (r) openChart(targetOf(r), { tf: isTf(route.query.ctf) ? route.query.ctf : tf.value })
  },
  { immediate: true },
)

// --- actions -------------------------------------------------------------------------------------
const action = ref<{ kind: ActionKind; target: Target } | null>(null)
function act(kind: ActionKind, r: StateRow) {
  action.value = { kind, target: targetOf(r) }
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
          >EMA 8 / 32 with session VWAP confirmation, from the signal engine</span
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
        <Button size="sm" variant="ghost" :loading="status.loading" @click="sig.load(tf)">
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
          <span class="ss__kv tp-num">{{ kpis.pending }}</span>
        </div>
        <div
          class="ss__kpi"
          :class="{ 'is-bear': kpis.review, 'is-amber': !kpis.review && kpis.monitor }"
        >
          <span class="ss__kl"><Icon name="briefcase" size="xs" />Holdings with warnings</span>
          <span class="ss__kv tp-num">{{ kpis.held === null ? '—' : kpis.review }}</span>
          <span class="ss__kn">{{
            kpis.held === null
              ? status.portfolioError || 'Portfolio map unavailable'
              : `review risk · ${kpis.monitor} to monitor · ${kpis.held} held`
          }}</span>
        </div>
        <div class="ss__kpi is-info">
          <span class="ss__kl"><Icon name="sparkles" size="xs" />New opportunities</span>
          <span class="ss__kv tp-num">{{ kpis.opportunities }}</span>
          <span class="ss__kn">trending bullish, not held</span>
        </div>
        <div class="ss__kpi">
          <span class="ss__kl"><Icon name="clock" size="xs" />Market data</span>
          <span class="ss__kv ss__kv--sm">{{
            kpis.newest ? ago(new Date(kpis.newest).toISOString(), now) : 'No run yet'
          }}</span>
          <span class="ss__kn">
            newest closed candle<template v-if="kpis.runAt">
              · run {{ ago(kpis.runAt, now) }}</template
            >
          </span>
        </div>
      </template>
    </section>

    <SignalNotice v-if="status.error" tone="danger" title="Signals could not be loaded">
      {{ status.error }}

      <template #action>
        <Button size="sm" variant="secondary" @click="sig.load(tf)">Try again</Button>
      </template></SignalNotice
    >

    <Tabs v-model="tab" :tabs="tabs" aria-label="Stock signals views" size="sm" />

    <SignalsTable
      v-if="tab === 'live'"
      :rows="states"
      :total="total"
      :events="events"
      :holding-of="sig.holdingOf"
      :quotes="quotes"
      :now="now"
      :loading="status.loading"
      @visible="(ids) => (visible = ids)"
      @expand="(r) => sig.eventFor(r).catch(() => null)"
      @chart="openRow"
      @watchlist="(r) => act('watchlist', r)"
      @alert="(r) => act('alert', r)"
      @impact="(r) => act('impact', r)"
      @compare="(r) => act('compare', r)"
    />
    <MarketMovers
      v-else-if="tab === 'movers'"
      :movers="movers"
      :loading="status.moversLoading"
      :error="status.moversError"
      :now="now"
      @chart="openRow"
      @retry="sig.loadMovers(tf, true)"
    />
    <PortfolioSignalMap
      v-else-if="tab === 'portfolio'"
      :map="portfolio"
      :candidates="candidates"
      :tf="tf"
      :now="now"
      :loading="status.loading"
      :error="status.portfolioError"
      @chart="openHolding"
      @candidate="openRow"
    />
    <SignalAlerts v-else :center="center" :now="now" @open="openNotification" />

    <p class="ss__foot">
      Signals, rankings and the portfolio map are the server’s signal engine’s; the trend score is a
      0–100 ranking, not a probability. Nothing here places or proposes an order.
      <template v-if="num(total) && total > states.length">
        The table reads the first {{ states.length }} of {{ total }} evaluated stocks.</template
      >
    </p>

    <SignalChartHost
      :target="chart?.target ?? null"
      :tf="chart?.tf ?? tf"
      :state="chart?.state"
      :event="chart?.event"
      :holding="chart ? sig.holdingOf(chart.target.id) : null"
      :now="now"
      @close="closeChart"
      @watchlist="(t) => (action = { kind: 'watchlist', target: t })"
      @alert="(t) => (action = { kind: 'alert', target: t })"
    />
    <SignalActionDialogs
      :action="action"
      :rows="states"
      :events="events"
      :holding-of="sig.holdingOf"
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
.ss__foot {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
</style>

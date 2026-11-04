<script setup lang="ts">
// /trading/mt5 — the Aureon MT5 bot, from its pushes (aureon.mt5.push/v1,
// backend docs/12-mt5-adapter.md §3): status + heartbeat, market + charts,
// positions with the guardian's phase, the signal timeline, classified failures
// with the "why", the strategy config and P&L. Live: GET /api/trading/stream
// announces each push (`mt5` event) and the panels refetch.
//
// Read-only. Nothing on this page can place, change or close an order or change
// a trading mode; the bot runs on its own machine and is never controlled here.
// While the bot has never pushed, the older pull view (status export) is shown.
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import Mt5MarketPanel from './Mt5MarketPanel.vue'
import Mt5Timeline from './Mt5Timeline.vue'
import SourceTag from './SourceTag.vue'
import NewsWidget from '@/components/news/NewsWidget.vue'
import { aureon } from '@/api/client'
import { ago, dec, pct, signed, toneOf, when } from '@/trading/format'
import {
  FAILURE_LABEL,
  STATE_TONE,
  phaseTone,
  sessionLabel,
  useMt5Live,
  type Mt5Guardian,
} from '@/trading/mt5'
import { must, useLoad } from '@/trading/useLoad'

const Mt5Export = defineAsyncComponent(() => import('./TradingMt5Export.vue'))

type Obj = Record<string, unknown>
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

const timeframe = ref('')
const kind = ref('')
const days = ref('7')

const status = useLoad(async () => must(await aureon.GET('/api/trading/mt5/bot-status')))
const market = useLoad(async () =>
  must(
    await aureon.GET('/api/trading/mt5/market', {
      params: { query: { limit: 150, ...(timeframe.value ? { timeframe: timeframe.value } : {}) } },
    }),
  ),
)
const positions = useLoad(async () => must(await aureon.GET('/api/trading/mt5/positions')))
const signals = useLoad(async () =>
  must(
    await aureon.GET('/api/trading/mt5/signals', {
      params: { query: { limit: 60, ...(kind.value ? { kind: [kind.value] } : {}) } },
    }),
  ),
)
const failures = useLoad(async () =>
  must(await aureon.GET('/api/trading/mt5/failures', { params: { query: { limit: 50 } } })),
)
const strategy = useLoad(async () => must(await aureon.GET('/api/trading/mt5/strategy')))
const report = useLoad(async () =>
  must(
    await aureon.GET('/api/trading/mt5/report', {
      params: { query: { days: Number(days.value) } },
    }),
  ),
)

const all = [status, market, positions, signals, failures, strategy, report]
function refresh() {
  for (const l of all) void l.reload()
}
useMt5Live(refresh)
watch(timeframe, () => void market.reload())
watch(kind, () => void signals.reload())
watch(days, () => void report.reload())

// Relative heartbeat time, ticking.
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 5000)
onBeforeUnmount(() => clearInterval(tick))

const st = computed(() => status.data.value)
const neverPushed = computed(() => !!st.value && !st.value.last_heartbeat_at)
const anyLoading = computed(() => all.some((l) => l.loading.value))

const statusStats = computed(() => {
  const s = st.value
  if (!s) return []
  const bot = s.bot as Obj
  const health = s.health as Obj
  const mt5 = (health.mt5 ?? {}) as Obj
  return [
    {
      label: 'Last heartbeat',
      value: ago(s.last_heartbeat_at, now.value),
      note: when(s.last_heartbeat_at),
    },
    { label: 'Bot version', value: str(bot.version) },
    { label: 'MT5 terminal', value: str(mt5.terminal ?? (mt5.connected ? 'CONNECTED' : null)) },
    { label: 'Health', value: str(health.status) },
    { label: 'Push seq', value: str(s.seq) },
    { label: 'Open failures', value: String(s.open_failures) },
  ]
})

const timeframes = computed(() => {
  const st = strategy.data.value
  const list = [...(st?.timeframes ?? [])]
  if (st?.exec_tf && !list.includes(st.exec_tf)) list.unshift(st.exec_tf)
  return list
})
watch(
  () => market.data.value?.symbols[0]?.timeframe,
  (tf) => {
    if (tf && !timeframe.value) timeframe.value = tf
  },
)

function guardText(g: Mt5Guardian | null | undefined): string {
  if (!g) return ''
  const bits = [
    g.leg_phase ? `leg ${g.leg_phase}` : '',
    g.profile ? `profile ${g.profile}` : '',
    g.frozen ? 'frozen' : '',
    g.bars !== null && g.bars !== undefined ? `${g.bars} bars` : '',
  ]
  return bits.filter(Boolean).join(' · ')
}

// The bot trades gold: XAUUSD news always, plus whatever else it holds.
const newsSymbols = computed(() => [
  ...new Set(['XAUUSD', ...(positions.data.value?.items ?? []).map((p) => p.symbol)]),
])

const orphanList = computed(() =>
  Object.entries(positions.data.value?.guardian_orphans ?? {}).flatMap(([sym, gs]) =>
    gs.map((g) => ({ sym, g })),
  ),
)

const strategyStats = computed(() => {
  const s = strategy.data.value
  if (!s) return []
  return [
    { label: 'Mode', value: str(s.mode) },
    { label: 'Exec TF', value: str(s.exec_tf) },
    { label: 'Timeframes', value: s.timeframes.join(', ') || '—' },
    { label: 'Symbols', value: s.symbols.join(', ') || '—' },
  ]
})
const kv = (o: Record<string, unknown>) =>
  Object.entries(o).map(([k, v]) => ({
    id: k,
    key: k,
    value: typeof v === 'object' && v !== null ? JSON.stringify(v) : str(v),
  }))

const perfRows = computed(() => {
  const by = ((report.data.value?.performance as Obj | undefined)?.exits_by_symbol ?? {}) as Record<
    string,
    Obj
  >
  return Object.entries(by).map(([sym, v]) => ({
    id: sym,
    symbol: sym,
    exits: str(v.exits),
    wins: str(v.wins),
    losses: str(v.losses),
    winRate: pct(v.win_rate as string),
    net: signed(v.net_points as string),
  }))
})
const dailyRows = computed(() =>
  (report.data.value?.daily ?? []).map((d) => ({
    id: d.date,
    date: d.date,
    exits: String(d.exits),
    wl: `${d.wins} / ${d.losses}`,
    net: signed(d.net_points),
  })),
)
const ema921e = computed(() => {
  const e = (report.data.value?.performance as Obj | undefined)?.ema921e as Obj | null | undefined
  return e ? { trades: str(e.trades), net: String(e.net_usd ?? '') } : null
})
const tradeRows = computed(() =>
  (report.data.value?.ema921e_trades ?? [])
    .slice(-20)
    .reverse()
    .map((t, i) => {
      const x = t as Obj
      return {
        id: String(i),
        symbol: str(x.symbol),
        dir: str(x.dir ?? x.direction),
        entry: dec(x.entry as string),
        pnl: signed(x.pnl_usd as string, 2),
      }
    }),
)
const backtestRows = computed(() =>
  (report.data.value?.backtests ?? []).map((b, i) => {
    const sum = ((b as Obj).summary ?? {}) as Obj
    return {
      id: String(i),
      file: str((b as Obj).file),
      trades: str(sum.trades),
      winRate: pct(sum.win_rate as string),
      net: signed(sum.net as string),
    }
  }),
)
</script>

<template>
  <div class="tp-page">
    <p v-if="status.loading.value && !st" class="tp-note">Reading the bot's latest push…</p>
    <Card v-else-if="status.error.value && !st" title="Could not read the MT5 bot">
      <p class="tp-note">{{ status.error.value }}</p>
      <Button size="sm" @click="refresh()">Try again</Button>
    </Card>

    <template v-if="st">
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">MT5 bot</span>
            <div class="tp-row">
              <Badge
                :tone="STATE_TONE[st.state] ?? 'neutral'"
                :label="String(st.state ?? 'unknown').toUpperCase()"
              />
              <Badge v-if="st.halt" tone="danger" label="Halted" />
              <Button variant="ghost" size="sm" :loading="anyLoading" @click="refresh()">
                Refresh
              </Button>
            </div>
          </div>
        </template>
        <p class="tp-note" role="status">
          <template v-if="neverPushed">No push received from the bot yet.</template>
          <template v-else>
            Last heartbeat {{ ago(st.last_heartbeat_at, now) }} (stale after
            {{ st.stale_after_s }} s).
          </template>
          <template v-if="st.reasons.length"> {{ st.reasons.join(' · ') }}</template>
        </p>
        <StatRow v-if="!neverPushed" :stats="statusStats" />
        <p class="tp-note">Read-only: the bot is never controlled from Aureon. LIVE stays off.</p>
      </Card>

      <Mt5Export v-if="neverPushed" />

      <template v-else>
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Failures</span>
              <Badge
                :tone="failures.data.value?.open_count ? 'danger' : 'success'"
                :label="`${failures.data.value?.open_count ?? 0} open`"
              />
            </div>
          </template>
          <p v-if="!failures.data.value?.items.length" class="tp-note">
            Nothing has gone wrong recently.
          </p>
          <ul v-else class="tp-list" aria-label="Failures">
            <li v-for="(f, i) in failures.data.value.items" :key="f.id ?? `x${i}`" class="tp-item">
              <div class="tp-main">
                <div class="tp-row">
                  <Badge
                    :tone="f.open ? 'danger' : 'neutral'"
                    :label="FAILURE_LABEL[f.kind] ?? f.kind"
                  />
                  <span v-if="f.symbol" class="tp-strong">{{ f.symbol }}</span>
                  <span class="tp-note">{{
                    f.open ? 'open' : `resolved ${when(f.resolved_at)}`
                  }}</span>
                </div>
                <span class="tp-note">Why: {{ f.reason }}</span>
                <span class="tp-note tp-num"
                  >First {{ when(f.first_seen) }} · last {{ when(f.last_seen) }} · ×{{
                    f.count
                  }}</span
                >
              </div>
            </li>
          </ul>
        </Card>

        <Mt5MarketPanel
          v-if="market.data.value"
          v-model:timeframe="timeframe"
          :market="market.data.value"
          :timeframes="timeframes"
        />

        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Positions &amp; guardian</span>
              <div class="tp-row">
                <Badge v-if="positions.data.value?.stale" tone="warning" label="Stale" />
                <SourceTag source="broker" />
              </div>
            </div>
          </template>
          <p v-if="!positions.data.value?.items.length" class="tp-note">
            The bot holds no open position.
          </p>
          <ul v-else class="tp-list" aria-label="Open positions">
            <li v-for="p in positions.data.value.items" :key="p.ticket" class="tp-item">
              <div class="tp-main">
                <div class="tp-row">
                  <span class="tp-strong">{{ p.symbol }}</span>
                  <Badge
                    :tone="p.direction === 'long' ? 'info' : 'neutral'"
                    :label="p.direction || '?'"
                  />
                  <span class="tp-note tp-num">#{{ p.ticket }} · {{ dec(p.volume) }} lots</span>
                  <Badge
                    v-if="p.guardian"
                    :tone="phaseTone(p.guardian.phase)"
                    :label="`Guardian: ${p.guardian.phase ?? '?'}`"
                  />
                </div>
                <span class="tp-note tp-num">
                  Entry {{ dec(p.price_open) }} · now {{ dec(p.current) }} · SL {{ dec(p.sl) }}
                  <template v-if="p.guardian">
                    · secured {{ dec(p.guardian.secured_level) }} · peak
                    {{ dec(p.guardian.peak) }}</template
                  >
                </span>
                <span v-if="guardText(p.guardian)" class="tp-note">{{
                  guardText(p.guardian)
                }}</span>
                <span class="tp-note">Opened {{ when(p.opened_at) }}</span>
              </div>
              <span class="tp-strong tp-num" :class="`mt5__${toneOf(p.points)}`">{{
                signed(p.points)
              }}</span>
            </li>
          </ul>
          <p v-for="o in orphanList" :key="`${o.sym}-${o.g.phase}-${o.g.sl}`" class="tp-note">
            Guardian still tracks a {{ o.sym }} ticket that is not open ({{ o.g.phase ?? '?' }}).
          </p>
        </Card>

        <NewsWidget title="XAUUSD &amp; USD news" :symbols="newsSymbols" />

        <Mt5Timeline
          v-model:kind="kind"
          :signals="signals.data.value"
          :loading="signals.loading.value"
        />

        <div class="tp-grid">
          <Card>
            <template #header>
              <div class="tp-head">
                <span class="tp-title">Strategy</span>
                <span class="tp-note">as of {{ when(strategy.data.value?.as_of) }}</span>
              </div>
            </template>
            <StatRow :stats="strategyStats" />
            <Table
              v-if="strategy.data.value && Object.keys(strategy.data.value.ema).length"
              :columns="[
                { key: 'key', label: 'EMA' },
                { key: 'value', label: 'Period', align: 'right' },
              ]"
              :rows="kv(strategy.data.value.ema)"
              caption="EMA periods"
            />
            <Table
              v-if="strategy.data.value && Object.keys(strategy.data.value.params).length"
              :columns="[
                { key: 'key', label: 'Parameter' },
                { key: 'value', label: 'Value' },
              ]"
              :rows="kv(strategy.data.value.params)"
              caption="Strategy parameters"
            />
          </Card>

          <Card>
            <template #header>
              <div class="tp-head">
                <span class="tp-title">P&amp;L report</span>
                <div class="tp-row">
                  <SegmentedControl
                    v-model="days"
                    :options="[
                      { value: '1', label: '1d' },
                      { value: '7', label: '7d' },
                      { value: '30', label: '30d' },
                    ]"
                    size="sm"
                    aria-label="Report window"
                  />
                  <SourceTag source="calculated" />
                </div>
              </div>
            </template>
            <Table
              v-if="perfRows.length"
              :columns="[
                { key: 'symbol', label: 'Symbol' },
                { key: 'exits', label: 'Exits', align: 'right' },
                { key: 'winRate', label: 'Win rate', align: 'right' },
                { key: 'net', label: 'Net points', align: 'right' },
              ]"
              :rows="perfRows"
              caption="Exits by symbol"
            />
            <p v-else class="tp-note">No exits in this window.</p>
            <Table
              v-if="dailyRows.length"
              :columns="[
                { key: 'date', label: 'Day (UTC)' },
                { key: 'exits', label: 'Exits', align: 'right' },
                { key: 'wl', label: 'W / L', align: 'right' },
                { key: 'net', label: 'Net points', align: 'right' },
              ]"
              :rows="dailyRows"
              caption="Daily net points"
            />
            <StatRow
              v-if="ema921e"
              :stats="[
                { label: 'ema921e trades', value: ema921e.trades },
                {
                  label: 'ema921e net (USD)',
                  value: signed(ema921e.net, 2),
                  tone: toneOf(ema921e.net),
                },
              ]"
            />
            <p class="tp-note">
              Points as the bot reports them; no MT5 deal history or account balance is read.
            </p>
          </Card>
        </div>

        <div class="tp-grid">
          <Card v-if="tradeRows.length" title="ema921e trades (latest 20)">
            <Table
              :columns="[
                { key: 'symbol', label: 'Symbol' },
                { key: 'dir', label: 'Dir' },
                { key: 'entry', label: 'Entry', align: 'right' },
                { key: 'pnl', label: 'P&L (USD)', align: 'right' },
              ]"
              :rows="tradeRows"
              caption="ema921e trades"
            />
          </Card>
          <Card v-if="backtestRows.length">
            <template #header>
              <div class="tp-head">
                <span class="tp-title">Bot backtests</span>
                <SourceTag source="simulated" />
              </div>
            </template>
            <Table
              :columns="[
                { key: 'file', label: 'Run' },
                { key: 'trades', label: 'Trades', align: 'right' },
                { key: 'winRate', label: 'Win rate', align: 'right' },
                { key: 'net', label: 'Net', align: 'right' },
              ]"
              :rows="backtestRows"
              caption="Bot backtest summaries"
            />
          </Card>
        </div>
        <p class="tp-note">
          Market session now: {{ sessionLabel(market.data.value?.session) }} (UTC: Asia 22–07,
          London 07–13, NY 13–22).
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.mt5__positive {
  color: var(--theme-success);
}
.mt5__negative {
  color: var(--theme-danger);
}
</style>

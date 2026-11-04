<script setup lang="ts">
// /trading/origins — my trades vs the bot's on the MT5 account. Every MT5 deal
// is classified by the backend from MT5's own fields (magic + deal reason):
// "My trade" (opened by hand), "Bot" (opened by the Aureon bot), and
// "Guardian-managed" (opened by hand, then protected/closed by the guardian).
// The chip, the period and the bucket live in the URL query.
//
// Read-only. Nothing here places, modifies or closes anything, and there are
// no approvals.
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import OriginBadge from './OriginBadge.vue'
import OriginsCompare from './OriginsCompare.vue'
import SourceTag from './SourceTag.vue'
import { dec, pct, signed, toneOf, when } from '@/trading/format'
import { useMt5Live } from '@/trading/mt5'
import {
  BUCKETS,
  ORIGIN_FILTERS,
  PERIODS,
  SESSIONS,
  bucketFromQuery,
  closeReasonLabel,
  duration,
  matchesOrigin,
  originFromQuery,
  originsApi,
  periodFromQuery,
  periodRange,
  queryForOrigin,
  type OriginFilter,
  type OriginStats,
} from '@/trading/origins'
import { useLoad } from '@/trading/useLoad'

const route = useRoute()
const router = useRouter()

const origin = computed(() => originFromQuery(route.query))
const period = computed(() => periodFromQuery(route.query))
const bucket = computed(() => bucketFromQuery(route.query))
const periodLabel = computed(() => PERIODS.find((p) => p.value === period.value)?.label ?? '')

function setOrigin(v: string) {
  void router.replace({ query: queryForOrigin(route.query, v as OriginFilter) })
}
function setQuery(key: 'period' | 'bucket', v: string) {
  void router.replace({ query: { ...route.query, [key]: v } })
}

const range = () => periodRange(period.value)

const stats = useLoad(() => originsApi.stats({ ...range(), bucket: bucket.value }))
const trades = useLoad(() => originsApi.trades({ ...range(), origin: origin.value }))
const open = useLoad(() => originsApi.openPositions())
const gaps = useLoad(() => originsApi.gaps())
const dhan = useLoad(() => originsApi.dhanOrders({ ...range(), origin: origin.value }))

const all = [stats, trades, open, gaps, dhan]
function refresh() {
  for (const l of all) void l.reload()
}
useMt5Live(refresh)
watch(origin, () => {
  void trades.reload()
  void dhan.reload()
})
watch(period, refresh)
watch(bucket, () => void stats.reload())

const cur = computed(() => stats.data.value?.currency || '')

// ---- stats ----------------------------------------------------------------

const ROW_LABEL: Record<string, string> = {
  all: 'All',
  manual: 'My trades',
  bot: 'Bot trades',
  managed: 'Guardian-managed',
  unknown: 'Unknown',
}
const originRows = computed(() => {
  const o = stats.data.value?.origins ?? {}
  return (['all', 'manual', 'bot', 'managed', 'unknown'] as const)
    .filter((k) => o[k] && (k !== 'unknown' || o[k]!.trades))
    .map((k) => ({ id: k, origin: ROW_LABEL[k], ...cells(o[k]!) }))
})
function cells(s: OriginStats | undefined) {
  if (!s) return { trades: '0', winRate: '—', net: '—', avgR: '—', dd: '—' }
  return {
    trades: String(s.trades),
    winRate: pct(s.win_rate),
    net: signed(s.net, 2),
    avgR: dec(s.avg_r, 2),
    dd: dec(s.max_drawdown, 2),
  }
}
const selected = computed<OriginStats | undefined>(
  () => stats.data.value?.origins?.[origin.value] ?? undefined,
)
const headline = computed(() => {
  const s = selected.value
  if (!s) return []
  return [
    { label: 'Net P&L', value: signed(s.net, 2), tone: toneOf(s.net), note: cur.value },
    { label: 'Win rate', value: pct(s.win_rate), note: `${s.wins} W / ${s.losses} L` },
    { label: 'Avg R', value: dec(s.avg_r, 2) },
    { label: 'Trades', value: String(s.trades) },
    { label: 'Max drawdown', value: dec(s.max_drawdown, 2) },
  ]
})

const bucketRows = computed(() =>
  (stats.data.value?.buckets ?? []).map((b) => ({
    id: b.start,
    start: bucket.value === 'month' ? b.start.slice(0, 7) : b.start.slice(0, 10),
    manual: b.manual ? `${signed(b.manual.net, 2)} (${b.manual.trades})` : '—',
    bot: b.bot ? `${signed(b.bot.net, 2)} (${b.bot.trades})` : '—',
    all: b.all ? `${signed(b.all.net, 2)} (${b.all.trades})` : '—',
  })),
)

const sessionRows = computed(() => {
  const by = stats.data.value?.by_session ?? {}
  const f = (s: OriginStats | undefined) =>
    s && s.trades ? `${signed(s.net, 2)} · ${pct(s.win_rate)} · ${s.trades}` : '—'
  return SESSIONS.map((s) => ({
    id: s.value,
    session: s.label,
    manual: f(by.manual?.[s.value]),
    bot: f(by.bot?.[s.value]),
    all: f(by.all?.[s.value]),
  }))
})

// ---- open positions ------------------------------------------------------

const openRows = computed(() =>
  (open.data.value?.items ?? [])
    .filter((p) => matchesOrigin(p, origin.value))
    .map((p) => ({
      id: String(p.ticket),
      origin: p.origin,
      guardian: p.guardian_touched,
      symbol: p.symbol,
      side: String(p.side).toUpperCase(),
      volume: dec(p.volume),
      open: dec(p.price_open),
      now: dec(p.price_current),
      sl: dec(p.sl),
      tp: dec(p.tp),
      pnl: signed(p.profit, 2),
    })),
)

// ---- journal ----------------------------------------------------------------

const journalRows = computed(() =>
  (trades.data.value?.items ?? []).map((t) => ({
    id: `${t.acct}-${t.position_id}`,
    origin: t.origin,
    guardian: t.guardian_touched,
    symbol: t.symbol,
    side: String(t.side).toUpperCase(),
    entry: `${when(t.entry_time)} @ ${dec(t.entry_price)}`,
    exit: t.exit_time ? `${when(t.exit_time)} @ ${dec(t.exit_price)}` : 'open',
    reason: t.status === 'open' ? '—' : closeReasonLabel(t.close_reason),
    duration: duration(t.duration_s),
    net: signed(t.net, 2),
    r: t.r_multiple === null || t.r_multiple === undefined ? '—' : `${dec(t.r_multiple, 2)}R`,
  })),
)

// ---- gaps -------------------------------------------------------------------

const RECENT_GAP_MS = 7 * 86_400_000
const recentGaps = computed(() =>
  (gaps.data.value?.items ?? []).filter(
    (g) => Date.now() - new Date(g.detected_at).getTime() < RECENT_GAP_MS,
  ),
)
const missingDeals = computed(() => recentGaps.value.reduce((n, g) => n + (g.missing || 0), 0))

// ---- dhan -------------------------------------------------------------------

const dhanRows = computed(() =>
  (dhan.data.value?.items ?? []).map((o) => ({
    id: o.order_id,
    origin: o.origin,
    symbol: o.symbol,
    side: o.side,
    qty: dec(o.qty),
    price: dec(o.price),
    status: o.status,
    placed: when(o.placed_at),
  })),
)
const ORIGIN_COL = { key: 'origin', label: 'Origin' }
</script>

<template>
  <div class="tp-page">
    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Trade origins · MT5</span>
          <Button
            variant="ghost"
            size="sm"
            :loading="all.some((l) => l.loading.value)"
            @click="refresh()"
          >
            Refresh
          </Button>
        </div>
      </template>
      <div class="tp-row">
        <SegmentedControl
          :model-value="origin"
          :options="ORIGIN_FILTERS"
          size="sm"
          aria-label="Trade origin"
          @update:model-value="setOrigin"
        />
        <SegmentedControl
          :model-value="period"
          :options="[...PERIODS]"
          size="sm"
          aria-label="Period"
          @update:model-value="(v: string) => setQuery('period', v)"
        />
      </div>
      <p class="tp-note">
        My trades = opened by hand (including guardian-managed) · Bot trades = opened by the Aureon
        bot · Guardian-managed = opened by hand, then protected or closed by the guardian.
        Read-only.
      </p>
      <p v-if="recentGaps.length" class="tp-row tp-note" data-test="gaps" role="status">
        <Badge tone="warning" label="Gaps" />
        <span
          >{{ recentGaps.length }} gap(s) in the pushed deal history in the last 7 days ({{
            missingDeals
          }}
          deal(s) missing): numbers may be incomplete until the bot re-sends them.</span
        >
      </p>
    </Card>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Stats · {{ periodLabel }}</span>
          <SourceTag source="calculated" />
        </div>
      </template>
      <p v-if="stats.loading.value && !stats.data.value" class="tp-note">Loading stats…</p>
      <template v-else-if="stats.error.value && !stats.data.value">
        <p class="tp-note" role="alert">Could not load the stats: {{ stats.error.value }}</p>
        <Button size="sm" @click="stats.reload()">Try again</Button>
      </template>
      <p v-else-if="!originRows.length" class="tp-note">No trades in this period.</p>
      <template v-else>
        <StatRow v-if="headline.length" :stats="headline" />
        <Table
          :columns="[
            ORIGIN_COL,
            { key: 'trades', label: 'Trades', align: 'right' },
            { key: 'winRate', label: 'Win rate', align: 'right' },
            { key: 'net', label: `Net P&L ${cur}`, align: 'right' },
            { key: 'avgR', label: 'Avg R', align: 'right' },
            { key: 'dd', label: 'Max DD', align: 'right' },
          ]"
          :rows="originRows"
          caption="Stats per origin"
        />
      </template>
    </Card>

    <OriginsCompare
      :stats="stats.data.value"
      :loading="stats.loading.value"
      :error="stats.error.value"
      :period-label="periodLabel"
      @retry="stats.reload()"
    />

    <div v-if="stats.data.value" class="tp-grid">
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Net per {{ bucket }}</span>
            <SegmentedControl
              :model-value="bucket"
              :options="BUCKETS"
              size="sm"
              aria-label="Bucket"
              @update:model-value="(v: string) => setQuery('bucket', v)"
            />
          </div>
        </template>
        <Table
          v-if="bucketRows.length"
          :columns="[
            { key: 'start', label: 'From (UTC)' },
            { key: 'manual', label: 'Mine (trades)', align: 'right' },
            { key: 'bot', label: 'Bot (trades)', align: 'right' },
            { key: 'all', label: 'All (trades)', align: 'right' },
          ]"
          :rows="bucketRows"
          caption="Net P&L per bucket"
        />
        <p v-else class="tp-note">No closed trades to bucket.</p>
      </Card>
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Per session</span>
            <span class="tp-note">net · win rate · trades</span>
          </div>
        </template>
        <Table
          :columns="[
            { key: 'session', label: 'Session' },
            { key: 'manual', label: 'Mine', align: 'right' },
            { key: 'bot', label: 'Bot', align: 'right' },
            { key: 'all', label: 'All', align: 'right' },
          ]"
          :rows="sessionRows"
          caption="Stats per session"
        />
        <p class="tp-note">By entry time, UTC: Asia 00–07, London 07–12, NY 12–21, off 21–24.</p>
      </Card>
    </div>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Open positions</span>
          <SourceTag source="broker" />
        </div>
      </template>
      <p v-if="open.loading.value && !open.data.value" class="tp-note">Loading positions…</p>
      <p v-else-if="open.error.value && !open.data.value" class="tp-note" role="alert">
        Could not load open positions: {{ open.error.value }}
      </p>
      <p v-else-if="!openRows.length" class="tp-note">No open position for this filter.</p>
      <Table
        v-else
        :columns="[
          ORIGIN_COL,
          { key: 'symbol', label: 'Symbol' },
          { key: 'side', label: 'Side' },
          { key: 'volume', label: 'Lots', align: 'right' },
          { key: 'open', label: 'Open', align: 'right' },
          { key: 'now', label: 'Now', align: 'right' },
          { key: 'sl', label: 'SL', align: 'right' },
          { key: 'tp', label: 'TP', align: 'right' },
          { key: 'pnl', label: 'P&L', align: 'right' },
        ]"
        :rows="openRows"
        caption="Open positions with origin"
      >
        <template #cell-origin="{ row }">
          <OriginBadge :origin="String(row.origin)" :guardian-touched="!!row.guardian" />
        </template>
      </Table>
      <p v-if="open.data.value?.as_of" class="tp-note">As of {{ when(open.data.value.as_of) }}</p>
    </Card>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Trade journal · {{ periodLabel }}</span>
          <span class="tp-note tp-num">{{ trades.data.value?.total ?? 0 }} trade(s)</span>
        </div>
      </template>
      <p v-if="trades.loading.value && !trades.data.value" class="tp-note">Loading trades…</p>
      <template v-else-if="trades.error.value && !trades.data.value">
        <p class="tp-note" role="alert">Could not load the journal: {{ trades.error.value }}</p>
        <Button size="sm" @click="trades.reload()">Try again</Button>
      </template>
      <p v-else-if="!journalRows.length" class="tp-note">No trades for this filter and period.</p>
      <Table
        v-else
        :columns="[
          ORIGIN_COL,
          { key: 'symbol', label: 'Symbol' },
          { key: 'side', label: 'Side' },
          { key: 'entry', label: 'Entry' },
          { key: 'exit', label: 'Exit' },
          { key: 'reason', label: 'Close reason' },
          { key: 'duration', label: 'Duration', align: 'right' },
          { key: 'net', label: `Net ${cur}`, align: 'right' },
          { key: 'r', label: 'R', align: 'right' },
        ]"
        :rows="journalRows"
        caption="Trade journal"
      >
        <template #cell-origin="{ row }">
          <OriginBadge :origin="String(row.origin)" :guardian-touched="!!row.guardian" />
        </template>
      </Table>
    </Card>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Dhan orders · {{ periodLabel }}</span>
          <SourceTag source="broker" />
        </div>
      </template>
      <p v-if="dhan.loading.value && !dhan.data.value" class="tp-note">Loading Dhan orders…</p>
      <p v-else-if="dhan.error.value && !dhan.data.value" class="tp-note">
        Dhan order origins are not available: {{ dhan.error.value }}
      </p>
      <p v-else-if="!dhanRows.length" class="tp-note">No Dhan orders for this filter and period.</p>
      <Table
        v-else
        :columns="[
          ORIGIN_COL,
          { key: 'symbol', label: 'Symbol' },
          { key: 'side', label: 'Side' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'price', label: 'Price', align: 'right' },
          { key: 'status', label: 'Status' },
          { key: 'placed', label: 'Placed' },
        ]"
        :rows="dhanRows"
        caption="Dhan orders with origin"
      >
        <template #cell-origin="{ row }">
          <OriginBadge broker="dhan" :origin="String(row.origin)" />
        </template>
      </Table>
      <p class="tp-note">
        Aureon = placed through an Aureon order intent; anything else is manual.
      </p>
    </Card>
  </div>
</template>

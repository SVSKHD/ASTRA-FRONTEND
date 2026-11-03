<script setup lang="ts">
// MT5 pull mode: the bot's status export as Aureon reads it (GET /api/trading/mt5/status).
// Shown under /trading/mt5 only while the bot has never pushed (push mode is the
// dashboard in TradingMt5.vue). The bot is never controlled from here.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, pct, signed, toneOf, when } from '@/trading/format'
import { must, useLoad } from '@/trading/useLoad'

const st = useLoad(async () => must(await aureon.GET('/api/trading/mt5/status')))

type Obj = Record<string, unknown>
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))

const agents = computed(() =>
  Object.entries(st.data.value?.agents ?? {}).map(([sym, a]) => {
    const x = a as Obj
    return {
      id: sym,
      symbol: sym,
      strategy: s(x.strategy),
      tf: s(x.exec_tf),
      mt5: s(x.mt5),
      market: x.market_open ? 'open' : 'closed',
      positions: String(((x.positions as unknown[]) ?? []).length),
      signal: x.latest_signal ? s((x.latest_signal as Obj).direction) : '—',
    }
  }),
)
const positions = computed(() =>
  Object.values(st.data.value?.agents ?? {}).flatMap((a) =>
    (((a as Obj).positions as Obj[]) ?? []).map((p) => ({
      id: s(p.ticket),
      symbol: s(p.symbol),
      side: s(p.direction),
      lots: dec(s(p.volume)),
      entry: dec(s(p.price_open)),
      now: dec(s(p.current)),
      points: signed(s(p.points)),
      sl: dec(s(p.sl)),
    })),
  ),
)
const perf = computed(() => {
  const by = ((st.data.value?.performance as Obj | undefined)?.exits_by_symbol ?? {}) as Record<
    string,
    Obj
  >
  return Object.entries(by).map(([sym, v]) => ({
    id: sym,
    symbol: sym,
    exits: s(v.exits),
    winRate: pct(s(v.win_rate)),
    net: signed(s(v.net_points)),
  }))
})
const backtests = computed(() =>
  (st.data.value?.backtests ?? []).map((b, i) => {
    const sum = ((b as Obj).summary ?? {}) as Obj
    return {
      id: String(i),
      file: s((b as Obj).file),
      trades: s(sum.trades),
      winRate: pct(s(sum.win_rate)),
      net: signed(s(sum.net)),
      avg: signed(s(sum.avg)),
    }
  }),
)
const botStats = computed(() => {
  const d = st.data.value
  if (!d) return []
  const bot = d.bot as Obj
  return [
    { label: 'Version', value: s(bot.version) || '—' },
    { label: 'Mode', value: s(bot.mode) || '—' },
    { label: 'Export age', value: `${d.age_s} s` },
    { label: 'Source', value: d.source === 'http' ? 'HTTP (Tailscale)' : 'File' },
  ]
})
const ema921e = computed(() => {
  const e = ((st.data.value?.performance as Obj | undefined)?.ema921e ?? null) as Obj | null
  return e ? { trades: s(e.trades), net: s(e.net_usd) } : null
})
</script>

<template>
  <div class="tp-page">
    <p v-if="st.loading.value && !st.data.value" class="tp-note">Reading the bot's export…</p>
    <EmptyState
      v-else-if="st.unsupported.value"
      title="The MT5 bot is not connected to Aureon"
      description="Turn on the bot's status export (AUREON_STATUS_EXPORT=1) and set MT5_STATUS_URL or MT5_STATUS_FILE on the server."
    />
    <EmptyState
      v-else-if="st.error.value"
      title="Could not read the bot"
      :description="st.error.value"
    >
      <template #action><Button size="sm" @click="st.reload()">Try again</Button></template>
    </EmptyState>
    <template v-else-if="st.data.value">
      <div class="tp-grid">
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Bot</span>
              <div class="tp-row">
                <Badge
                  :tone="st.data.value.ok ? 'success' : 'warning'"
                  :label="st.data.value.ok ? 'Healthy' : 'Needs attention'"
                />
                <Badge v-if="st.data.value.halt" tone="danger" label="Halted" />
              </div>
            </div>
          </template>
          <p class="tp-note">
            {{ st.data.value.detail || 'Export fresh and every symbol connected to MT5.' }} Last
            export {{ when(st.data.value.generated_at) }}.
          </p>
          <StatRow :stats="botStats" />
          <Button variant="ghost" size="sm" :loading="st.loading.value" @click="st.reload()">
            Refresh
          </Button>
        </Card>
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Performance (journal exits)</span>
              <SourceTag source="calculated" />
            </div>
          </template>
          <Table
            v-if="perf.length"
            :columns="[
              { key: 'symbol', label: 'Symbol' },
              { key: 'exits', label: 'Exits', align: 'right' },
              { key: 'winRate', label: 'Win rate', align: 'right' },
              { key: 'net', label: 'Net points', align: 'right' },
            ]"
            :rows="perf"
            caption="Performance by symbol"
          />
          <p v-else class="tp-note">No exits in the export window yet.</p>
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
            Price points as the bot reports them. No MT5 deal history is read, so there is no
            account-currency P&amp;L here.
          </p>
        </Card>
      </div>
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Symbols</span>
            <SourceTag source="broker" />
          </div>
        </template>
        <Table
          :columns="[
            { key: 'symbol', label: 'Symbol' },
            { key: 'strategy', label: 'Strategy' },
            { key: 'tf', label: 'TF' },
            { key: 'mt5', label: 'MT5 link' },
            { key: 'market', label: 'Market' },
            { key: 'positions', label: 'Positions', align: 'right' },
            { key: 'signal', label: 'Latest signal' },
          ]"
          :rows="agents"
          caption="Bot symbols"
        />
      </Card>
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Open positions</span>
            <SourceTag source="broker" />
          </div>
        </template>
        <Table
          v-if="positions.length"
          :columns="[
            { key: 'symbol', label: 'Symbol' },
            { key: 'side', label: 'Side' },
            { key: 'lots', label: 'Lots', align: 'right' },
            { key: 'entry', label: 'Entry', align: 'right' },
            { key: 'now', label: 'Now', align: 'right' },
            { key: 'points', label: 'Points', align: 'right' },
            { key: 'sl', label: 'Stop', align: 'right' },
          ]"
          :rows="positions"
          caption="MT5 positions"
        />
        <p v-else class="tp-note">The bot holds no open position.</p>
      </Card>
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Bot backtests</span>
            <SourceTag source="simulated" />
          </div>
        </template>
        <Table
          v-if="backtests.length"
          :columns="[
            { key: 'file', label: 'Run' },
            { key: 'trades', label: 'Trades', align: 'right' },
            { key: 'winRate', label: 'Win rate', align: 'right' },
            { key: 'net', label: 'Net', align: 'right' },
            { key: 'avg', label: 'Avg', align: 'right' },
          ]"
          :rows="backtests"
          caption="Bot backtest summaries"
        />
        <p v-else class="tp-note">No backtest summaries in the bot's out/ folder.</p>
      </Card>
    </template>
  </div>
</template>

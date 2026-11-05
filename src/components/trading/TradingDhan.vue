<script setup lang="ts">
// Dhan: credentials health, funds, positions, orders, holdings and trades, as
// the broker reports them (every value is broker-reported). The status card on
// top keeps credentials, session, account freshness, the feed worker, ticks and
// reconciliation apart (backend docs/27), so a healthy API never reads as a
// healthy feed. Read-only: no order is placed, changed or cancelled here.
import { computed, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import Tabs from '@/components/ui/Tabs.vue'
import AccountPicker from './AccountPicker.vue'
import DhanStatusCard from './DhanStatusCard.vue'
import SourceTag from './SourceTag.vue'
import NewsWidget from '@/components/news/NewsWidget.vue'
import { aureon } from '@/api/client'
import { dec, signed, toneOf, when } from '@/trading/format'
import { must, useLoad } from '@/trading/useLoad'
import type { Account } from './types'

const props = defineProps<{ accounts: Account[] }>()
const accountId = ref('')
const tab = ref('positions')
const dhan = computed(() => props.accounts.filter((a) => a.broker === 'dhan'))

const path = { params: { path: { account_id: '' } } }
function p() {
  return { ...path, params: { path: { account_id: accountId.value } } }
}

const health = useLoad(
  async () => must(await aureon.GET('/api/trading/accounts/{account_id}/health', p())),
  false,
)
const funds = useLoad(
  async () => must(await aureon.GET('/api/trading/accounts/{account_id}/funds', p())),
  false,
)
const rows = useLoad(async () => {
  const opts = p()
  if (tab.value === 'orders')
    return must(await aureon.GET('/api/trading/accounts/{account_id}/orders', opts)).items.map(
      (o) => ({
        id: o.order_id,
        symbol: o.symbol,
        side: o.side,
        type: o.order_type,
        qty: `${dec(o.filled_quantity)} / ${dec(o.quantity)}`,
        price: dec(o.price),
        status: `${o.status} (${o.raw_status})`,
        placed: when(o.placed_at),
      }),
    )
  if (tab.value === 'holdings')
    return must(await aureon.GET('/api/trading/accounts/{account_id}/holdings', opts)).items.map(
      (h) => ({
        id: h.isin ?? h.symbol,
        symbol: h.symbol,
        qty: dec(h.quantity),
        avg: dec(h.avg_cost),
        last: dec(h.last_price),
      }),
    )
  if (tab.value === 'trades')
    return must(await aureon.GET('/api/trading/accounts/{account_id}/trades', opts)).items.map(
      (t) => ({
        id: t.trade_id,
        symbol: t.symbol,
        side: t.side,
        qty: dec(t.quantity),
        price: dec(t.price),
        at: when(t.executed_at),
      }),
    )
  return must(await aureon.GET('/api/trading/accounts/{account_id}/positions', opts)).items.map(
    (x) => ({
      id: x.broker_instrument_id ?? x.symbol,
      symbol: x.symbol,
      qty: signed(x.quantity),
      avg: dec(x.avg_price),
      last: dec(x.last_price),
      upnl: signed(x.unrealized_pnl, 2),
      rpnl: signed(x.realized_pnl, 2),
    }),
  )
}, false)

const COLUMNS: Record<string, { key: string; label: string; align?: 'left' | 'right' }[]> = {
  positions: [
    { key: 'symbol', label: 'Symbol' },
    { key: 'qty', label: 'Qty (signed)', align: 'right' },
    { key: 'avg', label: 'Avg', align: 'right' },
    { key: 'last', label: 'Last', align: 'right' },
    { key: 'upnl', label: 'Unrealised', align: 'right' },
    { key: 'rpnl', label: 'Realised', align: 'right' },
  ],
  orders: [
    { key: 'symbol', label: 'Symbol' },
    { key: 'side', label: 'Side' },
    { key: 'type', label: 'Type' },
    { key: 'qty', label: 'Filled / qty', align: 'right' },
    { key: 'price', label: 'Price', align: 'right' },
    { key: 'status', label: 'Status' },
    { key: 'placed', label: 'Placed' },
  ],
  holdings: [
    { key: 'symbol', label: 'Symbol' },
    { key: 'qty', label: 'Qty', align: 'right' },
    { key: 'avg', label: 'Avg cost', align: 'right' },
    { key: 'last', label: 'Last', align: 'right' },
  ],
  trades: [
    { key: 'symbol', label: 'Symbol' },
    { key: 'side', label: 'Side' },
    { key: 'qty', label: 'Qty', align: 'right' },
    { key: 'price', label: 'Price', align: 'right' },
    { key: 'at', label: 'Executed' },
  ],
}

watch(accountId, (id) => {
  if (!id) return
  void health.reload()
  void funds.reload()
  void rows.reload()
})
watch(tab, () => accountId.value && void rows.reload())

// "News for my positions": the symbols last seen on the Positions or Holdings
// tab, kept while another tab is open — no extra broker call for the widget.
const heldSymbols = ref<string[]>([])
watch(
  () => rows.data.value,
  (list) => {
    if (list && (tab.value === 'positions' || tab.value === 'holdings')) {
      heldSymbols.value = [...new Set(list.map((r) => String(r.symbol)).filter(Boolean))]
    }
  },
)

const fundStats = computed(() => {
  const f = funds.data.value
  if (!f) return []
  return [
    { label: `Available (${f.currency})`, value: dec(f.available, 2) },
    { label: 'Used margin', value: dec(f.used_margin, 2) },
    { label: 'Equity', value: dec(f.equity, 2), tone: toneOf(f.equity) },
  ]
})
</script>

<template>
  <div class="tp-page">
    <DhanStatusCard
      :has-account="!!accountId"
      :health="health.data.value ?? null"
      :funds-as-of="funds.data.value?.as_of ?? null"
      :funds-error="funds.error.value"
    />
    <EmptyState
      v-if="!dhan.length"
      title="No Dhan account is registered"
      description="An admin adds it on the server with the Dhan client id (POST /api/trading/accounts, broker dhan). The credentials stay in the server's .env."
    />
    <template v-else>
      <AccountPicker v-model="accountId" :accounts="dhan" broker="dhan" />
      <div class="tp-grid">
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Connection</span>
              <SourceTag source="broker" />
            </div>
          </template>
          <p v-if="health.error.value" class="tp-note" role="alert">{{ health.error.value }}</p>
          <template v-else-if="health.data.value">
            <Badge
              :tone="health.data.value.ok ? 'success' : 'danger'"
              :label="health.data.value.ok ? 'Token valid' : 'Token not usable'"
            />
            <p class="tp-note">
              {{ health.data.value.detail || 'Dhan answered.' }}
              <template v-if="health.data.value.credentials_expire_at">
                Token expires {{ when(health.data.value.credentials_expire_at) }}.
              </template>
            </p>
          </template>
        </Card>
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Funds</span>
              <SourceTag source="broker" />
            </div>
          </template>
          <p v-if="funds.error.value" class="tp-note" role="alert">{{ funds.error.value }}</p>
          <StatRow v-else-if="fundStats.length" :stats="fundStats" />
          <p v-if="funds.data.value" class="tp-note">As of {{ when(funds.data.value.as_of) }}</p>
        </Card>
      </div>
      <Card>
        <template #header>
          <div class="tp-head">
            <Tabs
              v-model="tab"
              size="sm"
              :tabs="[
                { value: 'positions', label: 'Positions' },
                { value: 'orders', label: 'Orders' },
                { value: 'holdings', label: 'Holdings' },
                { value: 'trades', label: 'Trades' },
              ]"
              aria-label="Dhan data"
            />
            <SourceTag source="broker" />
          </div>
        </template>
        <Alert v-if="rows.error.value" tone="warning">{{ rows.error.value }}</Alert>
        <p v-else-if="rows.loading.value" class="tp-note">Asking Dhan…</p>
        <Table
          v-else-if="rows.data.value?.length"
          :columns="COLUMNS[tab]"
          :rows="rows.data.value"
          :caption="`Dhan ${tab}`"
        />
        <EmptyState v-else :title="`No ${tab} today`" description="Dhan returned an empty list." />
      </Card>
      <NewsWidget title="News for my positions" :symbols="heldSymbols" />
    </template>
  </div>
</template>

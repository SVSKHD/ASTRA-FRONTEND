<script setup lang="ts">
// Orders, executions and positions per account, plus the P&L the broker
// reports on the open positions. Executions say whether they were real
// (broker) or simulated (paper, from Phase F).
import { computed, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import AccountPicker from './AccountPicker.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, signed, sumDec, toneOf, when } from '@/trading/format'
import { must, useLoad } from '@/trading/useLoad'
import type { Account } from './types'

const props = defineProps<{ accounts: Account[] }>()
const accountId = ref('')
const account = computed(() => props.accounts.find((a) => a.id === accountId.value))
const path = () => ({ params: { path: { account_id: accountId.value } } })

const positions = useLoad(
  async () => must(await aureon.GET('/api/trading/accounts/{account_id}/positions', path())).items,
  false,
)
const orders = useLoad(
  async () => must(await aureon.GET('/api/trading/accounts/{account_id}/orders', path())).items,
  false,
)
const executions = useLoad(
  async () =>
    must(
      await aureon.GET('/api/trading/executions', {
        params: { query: { account_id: accountId.value, limit: 100 } },
      }),
    ).items,
  false,
)
watch(accountId, (id) => {
  if (!id) return
  void positions.reload()
  void orders.reload()
  void executions.reload()
})

const posRows = computed(() =>
  (positions.data.value ?? []).map((p) => ({
    id: p.broker_instrument_id ?? p.symbol,
    symbol: p.symbol,
    qty: signed(p.quantity),
    avg: dec(p.avg_price),
    last: dec(p.last_price),
    upnl: signed(p.unrealized_pnl, 2),
    rpnl: signed(p.realized_pnl, 2),
    source: p.source,
  })),
)
const pnl = computed(() => {
  const rows = positions.data.value ?? []
  const cur = account.value?.base_currency ?? ''
  const u = sumDec(rows.map((r) => r.unrealized_pnl))
  const r = sumDec(rows.map((x) => x.realized_pnl))
  return [
    {
      label: `Unrealised (${cur})`,
      value: u === null ? 'not reported' : signed(u, 2),
      tone: toneOf(u),
    },
    {
      label: `Realised (${cur})`,
      value: r === null ? 'not reported' : signed(r, 2),
      tone: toneOf(r),
    },
    { label: 'Open positions', value: String(rows.length) },
  ]
})
const orderRows = computed(() =>
  (orders.data.value ?? []).map((o) => ({
    id: o.order_id,
    symbol: o.symbol,
    side: o.side,
    type: o.order_type,
    qty: `${dec(o.filled_quantity)} / ${dec(o.quantity)}`,
    price: dec(o.price),
    status: o.status,
    placed: when(o.placed_at),
    source: o.source,
  })),
)
const execRows = computed(() =>
  (executions.data.value ?? []).map((e) => ({
    id: e.id,
    instrument: String(e.instrument_id),
    side: e.side,
    qty: dec(e.quantity),
    price: dec(e.price),
    fees: dec(e.fees, 2),
    at: when(e.executed_at),
    source: e.source === 'simulated' ? 'Simulated' : 'Broker-reported',
  })),
)
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="!accounts.length"
      title="No broker accounts yet"
      description="Orders, executions and positions appear once an admin registers a Dhan or MT5 account on the server."
    />
    <template v-else>
      <AccountPicker v-model="accountId" :accounts="accounts" />
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">P&amp;L on open positions</span>
            <SourceTag source="broker" />
          </div>
        </template>
        <StatRow :stats="pnl" />
        <p class="tp-note">
          Totals are exact sums of the broker's figures. The paper book's equity and drawdown are
          under Paper; simulated backtest drawdowns are under Strategies &amp; backtests.
        </p>
      </Card>
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Positions</span>
            <SourceTag source="broker" />
          </div>
        </template>
        <Alert v-if="positions.error.value" tone="warning">{{ positions.error.value }}</Alert>
        <Table
          v-else-if="posRows.length"
          :columns="[
            { key: 'symbol', label: 'Symbol' },
            { key: 'qty', label: 'Qty (signed)', align: 'right' },
            { key: 'avg', label: 'Avg', align: 'right' },
            { key: 'last', label: 'Last', align: 'right' },
            { key: 'upnl', label: 'Unrealised', align: 'right' },
            { key: 'rpnl', label: 'Realised', align: 'right' },
          ]"
          :rows="posRows"
          caption="Positions"
        />
        <p v-else-if="!positions.loading.value" class="tp-note">No open positions.</p>
      </Card>
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Orders</span>
            <SourceTag source="broker" />
          </div>
        </template>
        <Alert v-if="orders.error.value" tone="warning">{{ orders.error.value }}</Alert>
        <Table
          v-else-if="orderRows.length"
          :columns="[
            { key: 'symbol', label: 'Symbol' },
            { key: 'side', label: 'Side' },
            { key: 'type', label: 'Type' },
            { key: 'qty', label: 'Filled / qty', align: 'right' },
            { key: 'price', label: 'Price', align: 'right' },
            { key: 'status', label: 'Status' },
            { key: 'placed', label: 'Placed' },
          ]"
          :rows="orderRows"
          caption="Orders"
        />
        <p v-else-if="!orders.loading.value" class="tp-note">No orders today.</p>
        <p class="tp-note">
          These are the broker's own orders (read-only). Paper orders and their simulated fills are
          under Paper.
        </p>
      </Card>
      <Card title="Executions">
        <Alert v-if="executions.error.value" tone="warning">{{ executions.error.value }}</Alert>
        <Table
          v-else-if="execRows.length"
          :columns="[
            { key: 'instrument', label: 'Instrument' },
            { key: 'side', label: 'Side' },
            { key: 'qty', label: 'Qty', align: 'right' },
            { key: 'price', label: 'Price', align: 'right' },
            { key: 'fees', label: 'Fees', align: 'right' },
            { key: 'at', label: 'Executed' },
            { key: 'source', label: 'Source' },
          ]"
          :rows="execRows"
          caption="Executions"
        />
        <p v-else-if="!executions.loading.value" class="tp-note">
          No executions recorded for this account yet.
        </p>
      </Card>
    </template>
  </div>
</template>

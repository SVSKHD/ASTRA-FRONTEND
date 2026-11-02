<script setup lang="ts">
// Paper trading (Trading Phase F): the paper book of one PAPER account, its
// order intents with their lifecycle, and the admin's approve / cancel. Every
// fill here is SIMULATED on the server from the current price plus configured
// spread, slippage and charges. Nothing can reach a broker's order API.
import { computed, reactive, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormField from '@/components/ui/FormField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import TextInput from '@/components/ui/TextInput.vue'
import AccountPicker from './AccountPicker.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, signed, toneOf, when } from '@/trading/format'
import {
  DECIMAL,
  OPEN,
  STATUS_TEXT,
  STATUS_TONE,
  approveIntent,
  cancelIntent,
  createIntent,
  paperAccounts,
  validQuantity,
  type IntentDetail,
} from '@/trading/paper'
import { inbox, loadInbox, useLiveRefresh } from '@/trading/inbox'
import { isAdmin, tradingSession } from '@/trading/session'
import { must, useLoad } from '@/trading/useLoad'
import type { Account } from './types'

const props = defineProps<{ accounts: Account[] }>()
const paper = computed(() => paperAccounts(props.accounts))
const accountId = ref('')
const account = computed(() => paper.value.find((a) => a.id === accountId.value))
const path = () => ({ params: { path: { account_id: accountId.value } } })

const summary = useLoad(
  async () => must(await aureon.GET('/api/trading/accounts/{account_id}/paper', path())),
  false,
)
const FILTERS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ALL', label: 'All' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'REJECTED', label: 'Rejected' },
]
const filter = ref('OPEN')
const intents = useLoad(async () => {
  const items = must(
    await aureon.GET('/api/trading/order-intents', {
      params: {
        query: {
          account_id: accountId.value,
          limit: 100,
          ...(filter.value !== 'ALL' && filter.value !== 'OPEN' ? { status: filter.value } : {}),
        },
      },
    }),
  ).items
  return filter.value === 'OPEN' ? items.filter((i) => OPEN.has(i.status)) : items
}, false)

// Simulated fills only: the executions endpoint also carries broker fills.
const executions = useLoad(async () => {
  const items = must(
    await aureon.GET('/api/trading/executions', {
      params: { query: { account_id: accountId.value, limit: 100 } },
    }),
  ).items
  return items.filter((e) => e.source === 'simulated')
}, false)
const execRows = computed(() =>
  (executions.data.value ?? []).map((e) => ({
    id: e.id,
    when: when(e.executed_at),
    side: e.side,
    instrument: String(e.instrument_id),
    qty: dec(e.quantity),
    price: dec(e.price),
    fees: `${dec(e.fees, 2)} ${e.currency}`,
  })),
)

const reconciliations = useLoad(
  async () =>
    must(
      await aureon.GET('/api/trading/accounts/{account_id}/paper/reconciliations', {
        params: { path: { account_id: accountId.value }, query: { limit: 20 } },
      }),
    ).items,
  false,
)

function reloadAll() {
  if (!accountId.value) return
  void summary.reload()
  void intents.reload()
  void executions.reload()
  void reconciliations.reload()
}
watch(accountId, reloadAll)
// New risk decisions or signals on the live stream, or every 15 s while visible.
// (The inbox itself is refreshed by the panel, which shows its count on the tab.)
useLiveRefresh(reloadAll)

function accountName(id: string): string {
  const a = props.accounts.find((x) => x.id === id)
  return a ? `${a.broker.toUpperCase()} ${a.label || a.account_id}` : 'unknown account'
}
watch(filter, () => void intents.reload())

const stats = computed(() => {
  const s = summary.data.value
  if (!s) return []
  const cur = s.currency
  return [
    { label: `Equity (${cur})`, value: dec(s.equity, 2) },
    { label: `Realised (${cur})`, value: signed(s.realized_pnl, 2), tone: toneOf(s.realized_pnl) },
    {
      label: `Unrealised (${cur})`,
      value: signed(s.unrealized_pnl, 2),
      tone: toneOf(s.unrealized_pnl),
    },
    { label: `Charges paid (${cur})`, value: dec(s.fees, 2) },
    { label: 'Max drawdown', value: `${dec(s.max_drawdown_pct, 3)}%` },
    { label: `Starting capital (${cur})`, value: dec(s.starting_capital, 2) },
  ]
})
const posRows = computed(() =>
  (summary.data.value?.positions ?? []).map((p) => ({
    id: String(p.instrument_id ?? p.symbol),
    symbol: p.symbol,
    qty: signed(p.quantity),
    avg: dec(p.avg_price),
    last: dec(p.last_price),
    upnl: signed(p.unrealized_pnl, 2),
    rpnl: signed(p.realized_pnl, 2),
  })),
)

// --- one intent's detail + actions -------------------------------------------
const details = reactive<Record<string, IntentDetail | 'loading' | string>>({})
const busy = reactive<Record<string, boolean>>({})
const actionMsg = reactive<Record<string, string>>({})

async function toggle(id: string) {
  if (details[id]) {
    delete details[id]
    return
  }
  details[id] = 'loading'
  try {
    details[id] = must(
      await aureon.GET('/api/trading/order-intents/{intent_id}', {
        params: { path: { intent_id: id } },
      }),
    )
  } catch (e) {
    details[id] = (e as Error).message
  }
}
function detailOf(id: string): IntentDetail | null {
  const d = details[id]
  return d && typeof d === 'object' ? d : null
}
async function act(id: string, fn: (id: string) => Promise<IntentDetail>) {
  busy[id] = true
  actionMsg[id] = ''
  try {
    const d = await fn(id)
    details[id] = d
    actionMsg[id] = STATUS_TEXT[d.status] ?? d.status
    reloadAll()
    void loadInbox()
  } catch (e) {
    actionMsg[id] = (e as Error).message
  } finally {
    busy[id] = false
  }
}
function canCancel(i: { status: string; created_by: string | null }): boolean {
  return OPEN.has(i.status) && (isAdmin() || i.created_by === tradingSession.user?.uid)
}

// --- a manual paper order -------------------------------------------------------
const form = reactive({
  instrument: '',
  side: 'BUY' as 'BUY' | 'SELL',
  type: 'MARKET' as 'MARKET' | 'LIMIT',
  quantity: '1',
  limit: '',
  product: '',
})
const formValid = computed(
  () =>
    /^\d+$/.test(form.instrument.trim()) &&
    validQuantity(form.quantity) &&
    (form.type === 'MARKET' || (DECIMAL.test(form.limit.trim()) && Number(form.limit) > 0)),
)
const sending = ref(false)
const sendMsg = ref('')
async function send() {
  if (!account.value || !formValid.value) return
  sending.value = true
  sendMsg.value = ''
  try {
    const d = await createIntent({
      account_id: account.value.id,
      instrument_id: Number(form.instrument.trim()),
      side: form.side,
      order_type: form.type,
      quantity: form.quantity.trim(),
      ...(form.type === 'LIMIT' ? { limit_price: form.limit.trim() } : {}),
      ...(form.product.trim() ? { product: form.product.trim().toUpperCase() } : {}),
    })
    sendMsg.value = `${d.status}: ${STATUS_TEXT[d.status] ?? ''}`
    filter.value = 'ALL'
    reloadAll()
  } catch (e) {
    sendMsg.value = (e as Error).message
  } finally {
    sending.value = false
  }
}

const reconciling = ref(false)
const reconcileMsg = ref('')
async function reconcile() {
  reconciling.value = true
  reconcileMsg.value = ''
  try {
    const r = must(await aureon.POST('/api/trading/accounts/{account_id}/paper/reconcile', path()))
    reconcileMsg.value = r.ok
      ? 'Reconciled: positions and ledger agree.'
      : `Drift found in ${r.drift.length} item(s). Check the rows changed outside the engine.`
    void summary.reload()
    void reconciliations.reload()
  } catch (e) {
    reconcileMsg.value = (e as Error).message
  } finally {
    reconciling.value = false
  }
}
</script>

<template>
  <div class="tp-page">
    <Card v-if="isAdmin()">
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Approval inbox</span>
          <Badge
            :tone="inbox.items.length ? 'warning' : 'neutral'"
            :label="`${inbox.items.length} waiting`"
          />
        </div>
      </template>
      <Alert v-if="inbox.error" tone="warning">{{ inbox.error }}</Alert>
      <ul v-if="inbox.items.length" class="tp-list">
        <li v-for="i in inbox.items" :key="i.id" class="tp-item pp__intent">
          <div class="tp-main">
            <span class="tp-strong">
              {{ i.side }} {{ dec(i.quantity) }} · instrument {{ i.instrument_id }} ·
              {{ i.order_type
              }}<template v-if="i.limit_price"> @ {{ dec(i.limit_price) }}</template>
            </span>
            <span class="tp-note">
              {{ accountName(i.broker_account_id) }} · {{ i.source }} · {{ when(i.created_at) }}
            </span>
            <span v-if="actionMsg[i.id]" class="tp-note" role="status">{{ actionMsg[i.id] }}</span>
          </div>
          <div class="tp-row">
            <Button
              size="sm"
              variant="primary"
              :loading="busy[i.id]"
              @click="act(i.id, approveIntent)"
            >
              Approve paper fill
            </Button>
            <Button
              size="sm"
              variant="secondary"
              :loading="busy[i.id]"
              @click="act(i.id, cancelIntent)"
            >
              Cancel
            </Button>
            <Button size="sm" variant="ghost" disabled title="Live trading stays off">
              Approve live
            </Button>
          </div>
        </li>
      </ul>
      <p v-else-if="!inbox.loading" class="tp-note">
        Nothing is waiting for approval on any account.
      </p>
    </Card>

    <EmptyState
      v-if="!paper.length"
      title="No account is in PAPER mode"
      description="An admin switches an account to PAPER under Risk (it needs a risk policy too). Paper fills are simulated on the server; no broker order is ever sent."
    />
    <template v-else>
      <AccountPicker v-model="accountId" :accounts="paper" />
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Paper book</span>
            <SourceTag source="simulated" />
          </div>
        </template>
        <Alert v-if="summary.error.value" tone="warning">{{ summary.error.value }}</Alert>
        <template v-else-if="summary.data.value">
          <StatRow :stats="stats" />
          <Alert v-if="summary.data.value.reconciliation?.ok === false" tone="danger">
            Reconciliation found drift at {{ when(summary.data.value.reconciliation.at) }}:
            positions or the ledger were changed outside the paper engine.
          </Alert>
          <p class="tp-note">
            <template v-if="summary.data.value.reconciliation">
              Last reconciled {{ when(summary.data.value.reconciliation.at) }} ({{
                summary.data.value.reconciliation.ok ? 'no drift' : 'drift'
              }}).
            </template>
            <template v-else>Not reconciled yet (the server runs it every 15 minutes).</template>
            Positions as of {{ when(summary.data.value.positions_as_of) }}.
          </p>
          <div v-if="isAdmin()" class="tp-row">
            <Button size="sm" variant="secondary" :loading="reconciling" @click="reconcile">
              Reconcile now
            </Button>
            <span v-if="reconcileMsg" class="tp-note" role="status">{{ reconcileMsg }}</span>
          </div>
        </template>
      </Card>

      <Card title="Paper positions">
        <Table
          v-if="posRows.length"
          :columns="[
            { key: 'symbol', label: 'Symbol' },
            { key: 'qty', label: 'Qty (signed)', align: 'right' },
            { key: 'avg', label: 'Avg cost', align: 'right' },
            { key: 'last', label: 'Last', align: 'right' },
            { key: 'upnl', label: 'Unrealised', align: 'right' },
            { key: 'rpnl', label: 'Realised', align: 'right' },
          ]"
          :rows="posRows"
          caption="Paper positions"
        />
        <p v-else-if="!summary.loading.value" class="tp-note">No open paper positions.</p>
      </Card>

      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Order intents</span>
            <SegmentedControl v-model="filter" :options="FILTERS" size="sm" aria-label="Status" />
          </div>
        </template>
        <Alert v-if="intents.error.value" tone="warning">{{ intents.error.value }}</Alert>
        <ul v-if="intents.data.value?.length" class="tp-list">
          <li v-for="i in intents.data.value" :key="i.id" class="tp-item pp__intent">
            <div class="tp-main">
              <span class="tp-strong">
                {{ i.side }} {{ dec(i.quantity) }} · instrument {{ i.instrument_id }} ·
                {{ i.order_type
                }}<template v-if="i.limit_price"> @ {{ dec(i.limit_price) }}</template>
              </span>
              <span class="tp-note">
                {{ STATUS_TEXT[i.status] ?? i.status }} · {{ i.source }} ·
                {{ when(i.created_at) }}
              </span>
              <span v-if="actionMsg[i.id]" class="tp-note" role="status">{{
                actionMsg[i.id]
              }}</span>
              <div v-if="details[i.id]" class="pp__detail">
                <p v-if="details[i.id] === 'loading'" class="tp-note">Loading…</p>
                <p v-else-if="typeof details[i.id] === 'string'" class="tp-note" role="alert">
                  {{ details[i.id] }}
                </p>
                <template v-else-if="detailOf(i.id)">
                  <span v-for="d in detailOf(i.id)!.risk_decisions" :key="d.id" class="tp-note">
                    Risk {{ when(d.created_at) }}: {{ d.reason }}
                  </span>
                  <span v-for="e in detailOf(i.id)!.executions" :key="e.id" class="tp-note">
                    Simulated fill {{ dec(e.quantity) }} @ {{ dec(e.price) }} · charges
                    {{ dec(e.fees, 2) }} {{ e.currency }} · {{ when(e.executed_at) }}
                  </span>
                  <ol class="pp__events">
                    <li v-for="ev in detailOf(i.id)!.events" :key="ev.id" class="tp-note">
                      {{ when(ev.occurred_at) }} · {{ ev.event_type }}
                    </li>
                  </ol>
                  <span class="tp-note">Correlation id {{ detailOf(i.id)!.correlation_id }}</span>
                </template>
              </div>
            </div>
            <div class="pp__actions">
              <Badge :tone="STATUS_TONE[i.status] ?? 'neutral'" :label="i.status" />
              <div class="tp-row">
                <Button size="sm" variant="ghost" @click="toggle(i.id)">
                  {{ details[i.id] ? 'Hide' : 'Details' }}
                </Button>
                <Button
                  v-if="i.status === 'PENDING_RISK' && isAdmin()"
                  size="sm"
                  variant="primary"
                  :loading="busy[i.id]"
                  @click="act(i.id, approveIntent)"
                >
                  Approve paper fill
                </Button>
                <Button
                  v-if="canCancel(i)"
                  size="sm"
                  variant="secondary"
                  :loading="busy[i.id]"
                  @click="act(i.id, cancelIntent)"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </li>
        </ul>
        <p v-else-if="!intents.loading.value" class="tp-note">
          No intents here. Send one from a signal, or create one below.
        </p>
      </Card>

      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Simulated executions</span>
            <SourceTag source="simulated" />
          </div>
        </template>
        <Alert v-if="executions.error.value" tone="warning">{{ executions.error.value }}</Alert>
        <Table
          v-else-if="execRows.length"
          :columns="[
            { key: 'when', label: 'Filled' },
            { key: 'side', label: 'Side' },
            { key: 'instrument', label: 'Instrument' },
            { key: 'qty', label: 'Qty', align: 'right' },
            { key: 'price', label: 'Price', align: 'right' },
            { key: 'fees', label: 'Charges', align: 'right' },
          ]"
          :rows="execRows"
          caption="Simulated executions"
        />
        <p v-else-if="!executions.loading.value" class="tp-note">
          No simulated fills on this account yet.
        </p>
      </Card>

      <Card title="Reconciliation history">
        <Alert v-if="reconciliations.error.value" tone="warning">{{
          reconciliations.error.value
        }}</Alert>
        <ul v-else-if="reconciliations.data.value?.length" class="tp-list">
          <li v-for="r in reconciliations.data.value" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ when(r.created_at) }}</span>
              <span class="tp-note">{{
                r.ok
                  ? 'No drift: positions and the ledger agree.'
                  : `Drift in ${r.drift.length} item(s).`
              }}</span>
            </div>
            <Badge :tone="r.ok ? 'success' : 'danger'" :label="r.ok ? 'OK' : 'Drift'" />
          </li>
        </ul>
        <p v-else-if="!reconciliations.loading.value" class="tp-note">
          Not reconciled yet. The server runs it every 15 minutes.
        </p>
      </Card>

      <Card title="New paper order">
        <form class="pp__form" @submit.prevent="send">
          <div class="tp-row">
            <FormField label="Instrument id">
              <TextInput v-model="form.instrument" size="sm" placeholder="42" />
            </FormField>
            <FormField label="Quantity (units or lots)">
              <TextInput v-model="form.quantity" size="sm" placeholder="1" />
            </FormField>
          </div>
          <div class="tp-row">
            <SegmentedControl
              v-model="form.side"
              :options="[
                { value: 'BUY', label: 'Buy' },
                { value: 'SELL', label: 'Sell' },
              ]"
              size="sm"
              aria-label="Side"
            />
            <SegmentedControl
              v-model="form.type"
              :options="[
                { value: 'MARKET', label: 'Market' },
                { value: 'LIMIT', label: 'Limit' },
              ]"
              size="sm"
              aria-label="Order type"
            />
          </div>
          <div class="tp-row">
            <FormField v-if="form.type === 'LIMIT'" label="Limit price">
              <TextInput v-model="form.limit" size="sm" placeholder="990.50" />
            </FormField>
            <FormField label="Product (Dhan, optional)">
              <TextInput v-model="form.product" size="sm" placeholder="INTRADAY or CNC" />
            </FormField>
          </div>
          <p class="tp-note">
            Simulated only. The server checks lot size, risk and price freshness now, and again when
            an admin approves it. Quantity: units for Dhan (a lot multiple), lots for MT5.
          </p>
          <div class="tp-row">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              :loading="sending"
              :disabled="!formValid"
            >
              Create paper intent
            </Button>
            <span v-if="sendMsg" class="tp-note" role="status">{{ sendMsg }}</span>
          </div>
        </form>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.pp__intent {
  align-items: flex-start;
}
.pp__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-1);
  min-width: 0;
}
.pp__detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: var(--sp-1);
  min-width: 0;
}
.pp__events {
  margin: 0;
  padding-left: var(--sp-4);
}
.pp__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
</style>

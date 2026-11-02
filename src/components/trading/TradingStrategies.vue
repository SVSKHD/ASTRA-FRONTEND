<script setup lang="ts">
// Strategies and backtests. Versions are immutable: a change is a new version.
// Backtests run on the server's research worker (strict no-lookahead: a
// decision on bar i fills at bar i+1's open) and every result is SIMULATED.
import { computed, reactive, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormField from '@/components/ui/FormField.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import TextInput from '@/components/ui/TextInput.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, pct, signed, toneOf, when } from '@/trading/format'
import { isAdmin } from '@/trading/session'
import { live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import type { components } from '@/api/client'

type Run = components['schemas']['BacktestRunOut']
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((v) => ({ value: v, label: v }))
const CODE_REFS = [
  { value: 'ema_cross', label: 'EMA cross' },
  { value: 'ema_pullback', label: 'EMA pullback' },
]

const strategies = useLoad(async () => must(await aureon.GET('/api/trading/strategies')))
const runs = useLoad(async () =>
  must(await aureon.GET('/api/trading/backtests', { params: { query: { limit: 30 } } })),
)

const versions = computed(() =>
  (strategies.data.value ?? []).flatMap((s) =>
    s.versions.map((v) => ({
      value: v.id,
      label: `${s.name} v${v.version} · ${v.code_ref}`,
      code_ref: v.code_ref,
      params: v.params,
    })),
  ),
)
const runnable = computed(() => versions.value.filter((v) => v.code_ref.startsWith('ema_')))

// --- new version (admin) ---------------------------------------------------------------
const draft = reactive({
  name: '',
  code_ref: 'ema_cross',
  fast: 9 as number | null,
  slow: 21 as number | null,
  instruments: '',
  timeframes: '15m',
})
const createMsg = ref('')
const creating = ref(false)
function list(text: string): string[] {
  return text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}
async function createVersion() {
  creating.value = true
  createMsg.value = ''
  try {
    const v = must(
      await aureon.POST('/api/trading/strategies', {
        body: {
          name: draft.name.trim(),
          code_ref: draft.code_ref,
          params: {
            fast: draft.fast,
            slow: draft.slow,
            instrument_ids: list(draft.instruments).map(Number).filter(Number.isInteger),
            timeframes: list(draft.timeframes),
          },
        },
      }),
    )
    createMsg.value = `Saved as version ${v.version}. The research agents pick it up on their next tick.`
    await strategies.reload()
  } catch (e) {
    createMsg.value = (e as Error).message
  } finally {
    creating.value = false
  }
}

// --- backtest ----------------------------------------------------------------------------
const bt = reactive({
  version: '',
  instrument: null as number | null,
  timeframe: '15m',
  days: 30 as number | null,
  fastGrid: '',
  slowGrid: '',
  spread: 2 as number | null,
  slippage: 1 as number | null,
  fee: 3 as number | null,
})
watch(
  runnable,
  (r) => {
    if (!r.some((v) => v.value === bt.version)) bt.version = r[0]?.value ?? ''
  },
  { immediate: true },
)
const btMsg = ref('')
const queuing = ref(false)
function ints(text: string): number[] {
  return list(text)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
}
async function queueBacktest() {
  if (!bt.version || !bt.instrument) {
    btMsg.value = 'Pick a strategy version and an instrument id.'
    return
  }
  queuing.value = true
  btMsg.value = ''
  const end = new Date()
  const start = new Date(end.getTime() - (bt.days ?? 30) * 86400_000)
  const grid: Record<string, number[]> = {}
  if (ints(bt.fastGrid).length) grid.fast = ints(bt.fastGrid)
  if (ints(bt.slowGrid).length) grid.slow = ints(bt.slowGrid)
  try {
    const r = must(
      await aureon.POST('/api/trading/strategies/backtest', {
        body: {
          strategy_version_id: bt.version,
          instrument_id: bt.instrument,
          timeframe: bt.timeframe as '15m',
          start: start.toISOString(),
          end: end.toISOString(),
          grid,
          costs: {
            spread_bps: String(bt.spread ?? 0),
            slippage_bps: String(bt.slippage ?? 0),
            fee_bps: String(bt.fee ?? 0),
          },
        },
      }),
    )
    btMsg.value = `Queued ${r.run_ids.length} run${r.run_ids.length === 1 ? '' : 's'}. Status updates arrive live.`
    await runs.reload()
  } catch (e) {
    btMsg.value = (e as Error).message
  } finally {
    queuing.value = false
  }
}

const runRows = computed(() =>
  (runs.data.value?.items ?? []).map((r) => ({
    ...r,
    status: live.backtests[r.id]?.status ?? r.status,
  })),
)
watch(
  () =>
    Object.values(live.backtests).filter((b) => b.status === 'done' || b.status === 'failed')
      .length,
  () => void runs.reload(),
)

// --- run detail --------------------------------------------------------------------------
const openId = ref('')
const explainMsg = ref('')
const detail = useLoad(async () => {
  if (!openId.value) return null
  return must(
    await aureon.GET('/api/trading/backtests/{run_id}', {
      params: { path: { run_id: openId.value }, query: { limit: 200 } },
    }),
  )
}, false)
const analyses = useLoad(async () => {
  if (!openId.value) return []
  return must(
    await aureon.GET('/api/trading/ai-analyses', {
      params: { query: { backtest_run_id: openId.value } },
    }),
  )
}, false)
watch(openId, () => {
  explainMsg.value = ''
  void detail.reload()
  void analyses.reload()
})

function metricStats(r: Run) {
  const m = r.metrics as Record<string, string | number | null>
  const v = (k: string) => (m[k] === null || m[k] === undefined ? '—' : String(m[k]))
  return [
    { label: 'Trades', value: v('trades') },
    { label: 'Win rate', value: pct(v('win_rate')) },
    { label: 'Net P&L', value: signed(v('net_pnl'), 2), tone: toneOf(v('net_pnl')) },
    { label: 'Expectancy', value: signed(v('expectancy'), 2), tone: toneOf(v('expectancy')) },
    { label: 'Profit factor', value: dec(v('profit_factor'), 2) },
    { label: 'Max drawdown', value: dec(v('max_drawdown'), 2) },
    { label: 'Fees', value: dec(v('fees'), 2) },
    { label: 'Spread + slippage', value: dec(v('spread_slippage_cost'), 2) },
  ]
}
const tradeRows = computed(() =>
  (detail.data.value?.trades ?? []).map((t, i) => ({
    id: String(i),
    side: t.side,
    entry: `${dec(t.entry_price)} · ${when(t.entry_time)}`,
    exit: t.exit_price ? `${dec(t.exit_price)} · ${when(t.exit_time)}` : '—',
    pnl: signed(t.pnl, 2),
    fees: dec(t.fees, 2),
  })),
)
async function explainRun(id: string) {
  try {
    const r = must(
      await aureon.POST('/api/trading/backtests/{run_id}/explain', {
        params: { path: { run_id: id } },
      }),
    )
    explainMsg.value = `Queued for the local AI (position ${r.position}). Refresh the explanation in a minute or two.`
  } catch (e) {
    explainMsg.value = (e as Error).message
  }
}
function statusTone(s: string) {
  return s === 'done' ? 'success' : s === 'failed' ? 'danger' : 'info'
}
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid">
      <Card title="Strategies">
        <ul v-if="strategies.data.value?.length" class="tp-list">
          <li v-for="s in strategies.data.value" :key="s.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ s.name }}</span>
              <span v-for="v in s.versions" :key="v.id" class="tp-note">
                v{{ v.version }} · {{ v.code_ref }} · {{ JSON.stringify(v.params) }}
              </span>
            </div>
            <Badge
              :tone="s.is_active ? 'success' : 'neutral'"
              :label="s.is_active ? 'Active' : 'Off'"
            />
          </li>
        </ul>
        <EmptyState
          v-else-if="!strategies.loading.value"
          title="No strategies yet"
          description="Create a version below (admin) and the research agents start evaluating it."
        />
      </Card>

      <Card v-if="isAdmin()" title="New strategy version">
        <form class="st__form" @submit.prevent="createVersion">
          <FormField label="Name"
            ><TextInput v-model="draft.name" size="sm" placeholder="ema-9-21"
          /></FormField>
          <FormField label="Rule"
            ><Select v-model="draft.code_ref" :options="CODE_REFS" size="sm"
          /></FormField>
          <div class="tp-row">
            <FormField label="Fast EMA"
              ><NumberInput v-model="draft.fast" :min="1" size="sm"
            /></FormField>
            <FormField label="Slow EMA"
              ><NumberInput v-model="draft.slow" :min="2" size="sm"
            /></FormField>
          </div>
          <FormField label="Instrument ids (comma-separated)">
            <TextInput v-model="draft.instruments" size="sm" placeholder="42, 7" />
          </FormField>
          <FormField label="Timeframes (comma-separated)">
            <TextInput v-model="draft.timeframes" size="sm" placeholder="15m, 1h" />
          </FormField>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            :loading="creating"
            :disabled="!draft.name.trim()"
          >
            Save version
          </Button>
          <p v-if="createMsg" class="tp-note" role="status">{{ createMsg }}</p>
        </form>
      </Card>

      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Run a backtest</span>
            <SourceTag source="simulated" />
          </div>
        </template>
        <form class="st__form" @submit.prevent="queueBacktest">
          <FormField label="Strategy version">
            <Select
              v-model="bt.version"
              :options="runnable"
              size="sm"
              placeholder="No runnable version"
            />
          </FormField>
          <div class="tp-row">
            <FormField label="Instrument id"
              ><NumberInput v-model="bt.instrument" :min="1" size="sm"
            /></FormField>
            <FormField label="Timeframe"
              ><Select v-model="bt.timeframe" :options="TIMEFRAMES" size="sm"
            /></FormField>
            <FormField label="Days back"
              ><NumberInput v-model="bt.days" :min="1" :max="3650" size="sm"
            /></FormField>
          </div>
          <div class="tp-row">
            <FormField label="Fast grid"
              ><TextInput v-model="bt.fastGrid" size="sm" placeholder="5, 9"
            /></FormField>
            <FormField label="Slow grid"
              ><TextInput v-model="bt.slowGrid" size="sm" placeholder="21, 34"
            /></FormField>
          </div>
          <div class="tp-row">
            <FormField label="Spread (bps)"
              ><NumberInput v-model="bt.spread" :min="0" :step="0.5" size="sm"
            /></FormField>
            <FormField label="Slippage (bps)"
              ><NumberInput v-model="bt.slippage" :min="0" :step="0.5" size="sm"
            /></FormField>
            <FormField label="Fee (bps)"
              ><NumberInput v-model="bt.fee" :min="0" :step="0.5" size="sm"
            /></FormField>
          </div>
          <Button type="submit" size="sm" variant="primary" :loading="queuing"
            >Queue backtest</Button
          >
          <p v-if="btMsg" class="tp-note" role="status">{{ btMsg }}</p>
        </form>
      </Card>
    </div>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Backtest runs</span>
          <SourceTag source="simulated" />
        </div>
      </template>
      <Alert v-if="runs.error.value" tone="warning">{{ runs.error.value }}</Alert>
      <ul v-if="runRows.length" class="tp-list">
        <li v-for="r in runRows" :key="r.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">
              instrument {{ r.instrument_id }} · {{ r.timeframe }} · {{ JSON.stringify(r.params) }}
            </span>
            <span class="tp-note">{{ when(r.period_start) }} → {{ when(r.period_end) }}</span>
            <span v-if="r.error" class="tp-note" role="alert">{{ r.error }}</span>
          </div>
          <div class="tp-row">
            <Badge :tone="statusTone(r.status)" :label="r.status" />
            <Button size="sm" variant="ghost" :disabled="r.status !== 'done'" @click="openId = r.id"
              >Results</Button
            >
          </div>
        </li>
      </ul>
      <EmptyState
        v-else-if="!runs.loading.value"
        title="No backtests yet"
        description="Queue one above."
      />
    </Card>

    <Card v-if="openId && detail.data.value">
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Results</span>
          <div class="tp-row">
            <SourceTag source="simulated" />
            <Button size="sm" variant="secondary" @click="explainRun(openId)"
              >Explain with AI</Button
            >
            <Button size="sm" variant="ghost" @click="openId = ''">Close</Button>
          </div>
        </div>
      </template>
      <StatRow :stats="metricStats(detail.data.value.run)" />
      <p class="tp-note">
        Fills at the next bar's open; costs {{ JSON.stringify(detail.data.value.run.costs) }} bps.
        {{ detail.data.value.trades_total }} trades.
      </p>
      <p v-if="explainMsg" class="tp-note" role="status">{{ explainMsg }}</p>
      <div class="tp-head">
        <span class="tp-note">AI explanation (local model; explanation only, not advice)</span>
        <Button size="sm" variant="ghost" @click="analyses.reload()">Refresh explanation</Button>
      </div>
      <article v-for="a in analyses.data.value ?? []" :key="a.id" class="st__analysis">
        <span class="tp-strong">{{ a.summary }}</span>
        <p class="tp-note">{{ a.content }}</p>
        <span class="tp-note">{{ a.model }} · {{ when(a.created_at) }}</span>
      </article>
      <Table
        v-if="tradeRows.length"
        :columns="[
          { key: 'side', label: 'Side' },
          { key: 'entry', label: 'Entry' },
          { key: 'exit', label: 'Exit' },
          { key: 'pnl', label: 'P&L', align: 'right' },
          { key: 'fees', label: 'Fees', align: 'right' },
        ]"
        :rows="tradeRows"
        caption="Backtest trades"
      />
    </Card>
  </div>
</template>

<style scoped>
.st__analysis {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: pre-wrap;
  min-width: 0;
}
.st__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
</style>

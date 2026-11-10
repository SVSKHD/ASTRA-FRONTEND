<script setup lang="ts">
// Strategies and backtests (docs/market-terminal.md §9).
//
// Versions are immutable: a change is a new version. Backtests run on the
// server's research worker (strict no-lookahead: a decision on bar i fills at
// bar i+1's open) and every result is SIMULATED. Creating a strategy or running
// a backtest never places a trade. Validation and request bodies live in
// src/trading/strategyForm.ts, checked against the backend's registry.
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormField from '@/components/ui/FormField.vue'
import MultiSelect from '@/components/ui/MultiSelect.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Select from '@/components/ui/Select.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Table from '@/components/ui/Table.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import InstrumentPicker from './InstrumentPicker.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, pct, signed, toneOf, when } from '@/trading/format'
import type { Instrument } from '@/trading/instruments'
import { chartPath } from '@/trading/sections'
import { isAdmin } from '@/trading/session'
import {
  STRATEGY_TYPES,
  TIMEFRAMES,
  buildBacktestRequest,
  buildStrategyCreate,
  idsOf,
  metricEntries,
  mustDetail,
  paramsText,
  timeframesOf,
  typeLabel,
  validateBacktest,
  validateDraft,
  type BacktestErrors,
  type DraftErrors,
} from '@/trading/strategyForm'
import { live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import type { components } from '@/api/client'

type Run = components['schemas']['BacktestRunOut']
const TF_OPTIONS = TIMEFRAMES.map((v) => ({ value: v, label: v }))
const TYPE_OPTIONS = STRATEGY_TYPES.map((t) => ({ value: t.value, label: t.label }))
const RUNS_PAGE = 20

const strategies = useLoad(async () => must(await aureon.GET('/api/trading/strategies')))
const runsPage = ref(1)
const runs = useLoad(async () =>
  must(
    await aureon.GET('/api/trading/backtests', {
      params: { query: { limit: RUNS_PAGE, offset: (runsPage.value - 1) * RUNS_PAGE } },
    }),
  ),
)
watch(runsPage, () => void runs.reload())
const runsPageCount = computed(() =>
  Math.max(1, Math.ceil((runs.data.value?.total ?? 0) / RUNS_PAGE)),
)

const versions = computed(() =>
  (strategies.data.value ?? []).flatMap((s) =>
    s.versions.map((v) => ({
      value: v.id,
      label: `${s.name} v${v.version} · ${typeLabel(v.code_ref)}`,
      code_ref: v.code_ref,
      params: v.params,
    })),
  ),
)
const runnable = computed(() =>
  versions.value.filter((v) => STRATEGY_TYPES.some((t) => t.value === v.code_ref)),
)
const versionLabel = (id: string) => versions.value.find((v) => v.value === id)?.label ?? 'version'

/** Symbols this screen has seen picked, so a chip reads "RELIANCE", not "instrument 2885". */
const symbols = reactive<Record<number, string>>({})
const instrumentName = (id: number) => symbols[id] ?? `instrument ${id}`

// --- new version (admin) ---------------------------------------------------------------
const draft = reactive({
  name: '',
  description: '',
  code_ref: 'ema_cross',
  fast: 9 as number | null,
  slow: 21 as number | null,
  instrumentIds: [] as number[],
  timeframes: ['15m'] as string[],
})
const typeHelp = computed(() => STRATEGY_TYPES.find((t) => t.value === draft.code_ref)?.help ?? '')
const draftTouched = ref(false)
const draftErrors = computed<DraftErrors>(() => (draftTouched.value ? validateDraft(draft) : {}))
const createMsg = ref('')
const createError = ref('')
const creating = ref(false)
const pickerKey = ref(0)

function addInstrument(i: Instrument) {
  symbols[i.id] = i.symbol
  if (!draft.instrumentIds.includes(i.id)) draft.instrumentIds.push(i.id)
  pickerKey.value++ // clear the search field for the next pick
}
function removeInstrument(id: number) {
  draft.instrumentIds = draft.instrumentIds.filter((x) => x !== id)
}

async function createVersion() {
  draftTouched.value = true
  createMsg.value = ''
  createError.value = ''
  if (Object.keys(validateDraft(draft)).length) return
  creating.value = true
  try {
    const v = mustDetail(
      await aureon.POST('/api/trading/strategies', { body: buildStrategyCreate(draft) }),
    )
    createMsg.value = `Saved as version ${v.version}. The research agents start evaluating it on their next tick. No order is placed.`
    draftTouched.value = false
    await strategies.reload()
  } catch (e) {
    createError.value = `The server rejected it: ${(e as Error).message}`
  } finally {
    creating.value = false
  }
}

// --- backtest ----------------------------------------------------------------------------
const bt = reactive({
  versionId: '',
  instrumentId: null as number | null,
  timeframe: '15m',
  days: 30 as number | null,
  quantity: null as number | null,
  spread: 2 as number | null,
  slippage: 1 as number | null,
  fee: 3 as number | null,
  fastGrid: '',
  slowGrid: '',
})
watch(
  runnable,
  (r) => {
    if (!r.some((v) => v.value === bt.versionId)) bt.versionId = r[0]?.value ?? ''
  },
  { immediate: true },
)
/** The instruments the chosen version watches, offered as one-tap picks. */
const versionInstruments = computed(() =>
  idsOf(runnable.value.find((v) => v.value === bt.versionId)?.params ?? {}),
)
const btPickerKey = ref(0)
const btPicked = ref('')
function pickBacktestInstrument(i: Instrument) {
  symbols[i.id] = i.symbol
  bt.instrumentId = i.id
  btPicked.value = `${i.symbol}`
}
function useVersionInstrument(id: number) {
  bt.instrumentId = id
  btPicked.value = instrumentName(id)
  btPickerKey.value++
}
function backtestThis(versionId: string) {
  bt.versionId = versionId
  document.getElementById('st-backtest')?.scrollIntoView({ block: 'start' })
}

const btTouched = ref(false)
const btErrors = computed<BacktestErrors>(() => (btTouched.value ? validateBacktest(bt) : {}))
const btMsg = ref('')
const btError = ref('')
const queuing = ref(false)
async function queueBacktest() {
  btTouched.value = true
  btMsg.value = ''
  btError.value = ''
  if (Object.keys(validateBacktest(bt)).length) return
  queuing.value = true
  try {
    const r = mustDetail(
      await aureon.POST('/api/trading/strategies/backtest', { body: buildBacktestRequest(bt) }),
    )
    btMsg.value = `Queued ${r.run_ids.length} simulated run${r.run_ids.length === 1 ? '' : 's'}. Status updates arrive live below.`
    btTouched.value = false
    runsPage.value = 1
    await runs.reload()
  } catch (e) {
    btError.value = `The server rejected it: ${(e as Error).message}`
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
function headline(r: Run): string {
  const m = r.metrics as Record<string, string | number | null>
  if (r.status !== 'done' || m.trades === undefined) return ''
  return `${m.trades} trades · net ${signed(m.net_pnl ?? null, 2)} · win rate ${pct(m.win_rate ?? null)}`
}

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
const IN_STATS = new Set([
  'trades',
  'win_rate',
  'net_pnl',
  'expectancy',
  'profit_factor',
  'max_drawdown',
  'fees',
  'spread_slippage_cost',
])
function otherMetrics(r: Run) {
  return metricEntries(r.metrics as Record<string, unknown>)
    .filter((e) => !IN_STATS.has(e.key))
    .map((e) => ({
      ...e,
      text:
        e.value === null || e.value === undefined
          ? '—'
          : typeof e.value === 'object'
            ? JSON.stringify(e.value)
            : String(e.value),
    }))
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
    <p class="st__safety" role="note">
      Creating a strategy or running a backtest never places a trade. A strategy version produces
      signals; a backtest is a simulation on stored candles.
    </p>

    <div class="tp-grid">
      <Card title="Strategies">
        <ul v-if="strategies.data.value?.length" class="tp-list">
          <li v-for="s in strategies.data.value" :key="s.id" class="st__strategy">
            <div class="tp-head">
              <span class="tp-strong">{{ s.name }}</span>
              <Badge
                :tone="s.is_active ? 'success' : 'neutral'"
                :label="s.is_active ? 'Enabled' : 'Disabled'"
              />
            </div>
            <span v-if="s.description" class="tp-note">{{ s.description }}</span>
            <ol class="st__versions" :aria-label="`Versions of ${s.name}`">
              <li v-for="v in s.versions" :key="v.id" class="st__version">
                <div class="tp-main">
                  <span class="tp-strong"
                    >v{{ v.version }} · {{ typeLabel(v.code_ref) }}
                    <span class="tp-note">{{ when(v.created_at) }}</span></span
                  >
                  <span class="tp-note">{{ paramsText(v.params) || 'no parameters' }}</span>
                  <span v-if="timeframesOf(v.params).length" class="tp-note"
                    >Timeframes: {{ timeframesOf(v.params).join(', ') }}</span
                  >
                  <div v-if="idsOf(v.params).length" class="tp-row">
                    <RouterLink
                      v-for="id in idsOf(v.params)"
                      :key="id"
                      class="st__link ui-focus-ring"
                      :to="chartPath(id, timeframesOf(v.params)[0])"
                      :aria-label="`Open chart for ${instrumentName(id)}`"
                      >{{ instrumentName(id) }}</RouterLink
                    >
                  </div>
                </div>
                <Button
                  v-if="STRATEGY_TYPES.some((t) => t.value === v.code_ref)"
                  size="sm"
                  variant="ghost"
                  @click="backtestThis(v.id)"
                  >Backtest</Button
                >
              </li>
            </ol>
          </li>
        </ul>
        <EmptyState
          v-else-if="!strategies.loading.value && !strategies.error.value"
          title="No strategies yet"
          description="Create a version below (admin) and the research agents start evaluating it."
        />
        <p v-if="strategies.error.value" class="st__err" role="alert">
          {{ strategies.error.value }}
        </p>
        <p class="tp-note">
          Enabled / disabled is shown as the server reports it. The API has no endpoint to switch a
          strategy on or off, so it cannot be changed here.
        </p>
      </Card>

      <Card v-if="isAdmin()" title="New strategy version">
        <form class="st__form" novalidate @submit.prevent="createVersion">
          <FormField label="Name" :error="draftErrors.name" required>
            <TextInput v-model="draft.name" size="sm" placeholder="ema-9-21" />
          </FormField>
          <FormField label="Description (optional)">
            <TextArea v-model="draft.description" :rows="2" />
          </FormField>
          <FormField label="Strategy type" :hint="typeHelp" :error="draftErrors.code_ref">
            <Select v-model="draft.code_ref" :options="TYPE_OPTIONS" size="sm" />
          </FormField>
          <div class="tp-row">
            <FormField label="Fast EMA" :error="draftErrors.fast">
              <NumberInput v-model="draft.fast" :min="1" size="sm" />
            </FormField>
            <FormField label="Slow EMA" :error="draftErrors.slow">
              <NumberInput v-model="draft.slow" :min="2" size="sm" />
            </FormField>
          </div>
          <FormField label="Instruments to watch" :error="draftErrors.instruments">
            <InstrumentPicker :key="pickerKey" size="sm" @pick="addInstrument" />
          </FormField>
          <div v-if="draft.instrumentIds.length" class="tp-row" aria-label="Picked instruments">
            <Chip
              v-for="id in draft.instrumentIds"
              :key="id"
              :label="instrumentName(id)"
              size="sm"
              removable
              @remove="removeInstrument(id)"
            />
          </div>
          <FormField label="Timeframes" :error="draftErrors.timeframes">
            <MultiSelect
              v-model="draft.timeframes"
              :options="TF_OPTIONS"
              size="sm"
              :max-chips="7"
            />
          </FormField>
          <Button type="submit" size="sm" variant="primary" :loading="creating">
            Save version
          </Button>
          <p v-if="createMsg" class="tp-note" role="status">{{ createMsg }}</p>
          <p v-if="createError" class="st__err" role="alert">{{ createError }}</p>
        </form>
      </Card>

      <Card id="st-backtest">
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Run a backtest</span>
            <SourceTag source="simulated" />
          </div>
        </template>
        <form class="st__form" novalidate @submit.prevent="queueBacktest">
          <FormField label="Strategy version" :error="btErrors.version">
            <Select
              v-model="bt.versionId"
              :options="runnable"
              size="sm"
              placeholder="No runnable version"
            />
          </FormField>
          <FormField label="Instrument" :error="btErrors.instrument">
            <InstrumentPicker
              :key="btPickerKey"
              size="sm"
              :selected-label="btPicked"
              @pick="pickBacktestInstrument"
            />
          </FormField>
          <div v-if="versionInstruments.length" class="tp-row">
            <span class="tp-note">This version watches:</span>
            <Button
              v-for="id in versionInstruments"
              :key="id"
              size="sm"
              :variant="bt.instrumentId === id ? 'tinted' : 'ghost'"
              :aria-pressed="bt.instrumentId === id ? 'true' : 'false'"
              @click="useVersionInstrument(id)"
              >{{ instrumentName(id) }}</Button
            >
          </div>
          <div class="tp-row">
            <FormField label="Timeframe" :error="btErrors.timeframe">
              <Select v-model="bt.timeframe" :options="TF_OPTIONS" size="sm" />
            </FormField>
            <FormField label="Days back" :error="btErrors.days">
              <NumberInput v-model="bt.days" :min="1" :max="3650" size="sm" />
            </FormField>
            <FormField label="Quantity (optional)" :error="btErrors.quantity">
              <NumberInput v-model="bt.quantity" :min="0" size="sm" />
            </FormField>
          </div>
          <div class="tp-row">
            <FormField label="Fast grid" hint="e.g. 5, 9" :error="btErrors.grid">
              <TextInput v-model="bt.fastGrid" size="sm" placeholder="5, 9" />
            </FormField>
            <FormField label="Slow grid" hint="e.g. 21, 34">
              <TextInput v-model="bt.slowGrid" size="sm" placeholder="21, 34" />
            </FormField>
          </div>
          <div class="tp-row">
            <FormField label="Spread (bps)" :error="btErrors.costs">
              <NumberInput v-model="bt.spread" :min="0" :step="0.5" size="sm" />
            </FormField>
            <FormField label="Slippage (bps)">
              <NumberInput v-model="bt.slippage" :min="0" :step="0.5" size="sm" />
            </FormField>
            <FormField label="Fee (bps)">
              <NumberInput v-model="bt.fee" :min="0" :step="0.5" size="sm" />
            </FormField>
          </div>
          <Button type="submit" size="sm" variant="primary" :loading="queuing">
            Queue backtest
          </Button>
          <p v-if="btMsg" class="tp-note" role="status">{{ btMsg }}</p>
          <p v-if="btError" class="st__err" role="alert">{{ btError }}</p>
        </form>
      </Card>
    </div>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Backtest runs</span>
          <div class="tp-row">
            <SourceTag source="simulated" />
            <Button size="sm" variant="ghost" :loading="runs.loading.value" @click="runs.reload()"
              >Refresh</Button
            >
          </div>
        </div>
      </template>
      <p v-if="runs.error.value" class="st__err" role="alert">
        Could not load backtest runs: {{ runs.error.value }}
      </p>
      <ul v-if="runRows.length" class="tp-list">
        <li v-for="r in runRows" :key="r.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ versionLabel(r.strategy_version_id) }}</span>
            <span class="tp-row">
              <RouterLink
                class="st__link ui-focus-ring"
                :to="chartPath(r.instrument_id, r.timeframe)"
                :aria-label="`Open chart for ${instrumentName(r.instrument_id)}`"
                >{{ instrumentName(r.instrument_id) }}</RouterLink
              >
              <span class="tp-note">· {{ r.timeframe }} · {{ paramsText(r.params) }}</span>
            </span>
            <span class="tp-note">{{ when(r.period_start) }} → {{ when(r.period_end) }}</span>
            <span v-if="headline(r)" class="tp-note tp-num">{{ headline(r) }}</span>
            <span v-if="r.error" class="st__err" role="alert">{{ r.error }}</span>
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
        v-else-if="!runs.loading.value && !runs.error.value"
        title="No backtests yet"
        description="Queue one above."
      />
      <Pagination
        v-if="runsPageCount > 1"
        :page="runsPage"
        :page-count="runsPageCount"
        @update:page="(p: number) => (runsPage = p)"
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
      <p class="tp-note">
        {{ versionLabel(detail.data.value.run.strategy_version_id) }} ·
        {{ instrumentName(detail.data.value.run.instrument_id) }} ·
        {{ detail.data.value.run.timeframe }} · {{ paramsText(detail.data.value.run.params) }}
      </p>
      <StatRow :stats="metricStats(detail.data.value.run)" />
      <dl class="st__metrics">
        <div v-for="m in otherMetrics(detail.data.value.run)" :key="m.key" class="st__metric">
          <dt class="tp-note">{{ m.label }}</dt>
          <dd class="tp-strong tp-num">{{ m.text }}</dd>
        </div>
      </dl>
      <p class="tp-note">
        Fills at the next bar's open; costs {{ JSON.stringify(detail.data.value.run.costs) }} bps.
        {{ detail.data.value.trades_total }} trades.
      </p>
      <p v-if="detail.data.value.run.error" class="st__err" role="alert">
        {{ detail.data.value.run.error }}
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
.st__safety {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--glass-border, var(--theme-border));
  border-left: 3px solid var(--theme-accent);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-primary);
  min-width: 0;
  overflow-wrap: anywhere;
}
.st__strategy {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--glass-border, var(--theme-border));
  min-width: 0;
}
.st__strategy:last-child {
  border-bottom: 0;
}
.st__versions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.st__version {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
  padding-left: var(--sp-2);
  border-left: 2px solid var(--glass-border, var(--theme-border));
  min-width: 0;
}
.st__link {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  color: var(--theme-accent);
  font-size: var(--text-xs);
  text-decoration: none;
  min-width: 0;
  overflow-wrap: anywhere;
}
.st__link:hover {
  text-decoration: underline;
}
.st__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
}
.st__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.st__metric dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.st__err {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-danger);
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (pointer: coarse) {
  .st__link {
    min-height: 44px;
  }
}
</style>

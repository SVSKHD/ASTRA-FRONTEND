<script setup lang="ts">
// Stock Screener (docs/market-terminal.md §6).
//
// A filter builder that produces exactly the `POST /api/trading/screener/run`
// body in the doc (src/trading/screener.ts). The backend has no screener
// endpoint yet, so Run stays disabled and says why, and "Copy request" hands the
// body to whoever builds it. Nothing is screened in this browser and no sample
// results are ever shown: the results table renders only what the server sends,
// and lights up once the contract has the path (the gate in screener.ts).
//
// Layout: filters beside the results on a wide screen; on a phone the filters
// are a collapsible panel above them, behind a "Filters" button.
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormField from '@/components/ui/FormField.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Pagination from '@/components/ui/Pagination.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import ScreenerResults from './ScreenerResults.vue'
import { when } from '@/trading/format'
import {
  EXCHANGES,
  FILTER_LABEL,
  KINDS,
  MAX_FILTERS,
  PAGE_SIZES,
  PRESETS,
  SCREENER_AVAILABLE,
  SCREENER_DOC,
  SCREENER_RUN_PATH,
  SORT_FIELDS,
  TIMEFRAMES,
  buildRequest,
  defaultForm,
  describeFilter,
  requestText,
  runScreener,
  validateRequest,
  watchlistFromQuery,
  type FilterType,
  type ScreenerFilter,
  type ScreenerResponse,
} from '@/trading/screener'
import { STORAGE_NOTE, watchlistStore } from '@/trading/watchlists'

const route = useRoute()
const store = watchlistStore()
const form = reactive(defaultForm())

// --- universe ----------------------------------------------------------------------------
function toggle<T>(list: T[], value: T, on: boolean) {
  const at = list.indexOf(value)
  if (on && at < 0) list.push(value)
  if (!on && at >= 0) list.splice(at, 1)
}
const watchlistOptions = computed(() => [
  { value: '', label: 'All instruments in the markets above' },
  ...store.lists.map((l) => ({
    value: l.id,
    label: `${l.name} (${l.items.length})`,
  })),
])
const linkedMissing = ref('')
watch(
  () => route.query.watchlist,
  (q) => {
    const id = watchlistFromQuery(q)
    linkedMissing.value = ''
    if (!id) return
    if (store.lists.some((l) => l.id === id)) form.watchlistId = id
    else linkedMissing.value = 'The watchlist in this link is not saved on this device.'
  },
  { immediate: true },
)
const watchlistModel = computed({
  get: () => form.watchlistId ?? '',
  set: (v: string) => (form.watchlistId = v || null),
})

// --- filters -----------------------------------------------------------------------------
type FieldKind = 'int' | 'num' | 'relation' | 'direction' | 'op'
interface Field {
  key: string
  label: string
  kind: FieldKind
  min?: number
  max?: number
  step?: number
}
const FIELDS: Record<FilterType, Field[]> = {
  ema_cross: [
    { key: 'fast', label: 'Fast EMA', kind: 'int', min: 1 },
    { key: 'slow', label: 'Slow EMA', kind: 'int', min: 2 },
    { key: 'direction', label: 'Direction', kind: 'direction' },
    { key: 'within_bars', label: 'Within N bars', kind: 'int', min: 1, max: 100 },
  ],
  ema_position: [
    { key: 'fast', label: 'Fast EMA', kind: 'int', min: 1 },
    { key: 'relation', label: 'Is', kind: 'relation' },
    { key: 'slow', label: 'Slow EMA', kind: 'int', min: 2 },
  ],
  price_vs_ema: [
    { key: 'relation', label: 'Price is', kind: 'relation' },
    { key: 'period', label: 'EMA period', kind: 'int', min: 1 },
  ],
  rsi: [
    { key: 'period', label: 'RSI period', kind: 'int', min: 1 },
    { key: 'op', label: 'Is', kind: 'op' },
    { key: 'value', label: 'Level', kind: 'num', min: 0, max: 100 },
  ],
  macd_cross: [
    { key: 'fast', label: 'Fast', kind: 'int', min: 1 },
    { key: 'slow', label: 'Slow', kind: 'int', min: 2 },
    { key: 'signal', label: 'Signal', kind: 'int', min: 1 },
    { key: 'direction', label: 'Direction', kind: 'direction' },
  ],
  volume: [
    { key: 'op', label: 'Volume is', kind: 'op' },
    { key: 'multiple_of_avg', label: '× average', kind: 'num', min: 0, step: 0.5 },
    { key: 'avg_period', label: 'Average of N bars', kind: 'int', min: 1 },
  ],
  adx: [
    { key: 'period', label: 'ADX period', kind: 'int', min: 1 },
    { key: 'op', label: 'Is', kind: 'op' },
    { key: 'value', label: 'Level', kind: 'num', min: 0, max: 100 },
  ],
  vwap_position: [{ key: 'relation', label: 'Price is', kind: 'relation' }],
}
const CHOICES: Record<'relation' | 'direction' | 'op', { value: string; label: string }[]> = {
  relation: [
    { value: 'above', label: 'Above' },
    { value: 'below', label: 'Below' },
  ],
  direction: [
    { value: 'bullish', label: 'Bullish (crosses above)' },
    { value: 'bearish', label: 'Bearish (crosses below)' },
  ],
  op: [
    { value: '>', label: 'Greater than' },
    { value: '<', label: 'Less than' },
  ],
}
const presetMenu = computed(() =>
  PRESETS.map((p) => ({
    value: p.key,
    label: p.label,
    disabled: form.filters.length >= MAX_FILTERS,
  })),
)
function addPreset(key: string) {
  const p = PRESETS.find((x) => x.key === key)
  if (p && form.filters.length < MAX_FILTERS) form.filters.push(p.make())
}
function removeFilter(i: number) {
  form.filters.splice(i, 1)
}
function fieldValue(f: ScreenerFilter, key: string): unknown {
  return (f as unknown as Record<string, unknown>)[key]
}
function setField(f: ScreenerFilter, key: string, v: unknown) {
  ;(f as unknown as Record<string, unknown>)[key] = v
}

// --- request, validation -----------------------------------------------------------------
const request = computed(() => buildRequest(form))
const issues = computed(() => validateRequest(request.value))
const issuesFor = (path: string) =>
  issues.value.filter((i) => i.path === path).map((i) => i.message)
const valid = computed(() => issues.value.length === 0)
const showRequest = ref(false)
const copyMsg = ref('')
async function copyRequest() {
  const text = requestText(request.value)
  try {
    await navigator.clipboard.writeText(text)
    copyMsg.value = 'Request copied. Hand it to the backend with ' + SCREENER_DOC + '.'
  } catch {
    showRequest.value = true
    copyMsg.value = 'Copying is blocked here; the request is shown below to copy by hand.'
  }
}

// --- run (only once the contract has the endpoint) ---------------------------------------
const available = SCREENER_AVAILABLE
const result = ref<ScreenerResponse | null>(null)
const loading = ref(false)
const error = ref('')
const filtersOpen = ref(false)
async function run() {
  if (!available || !valid.value) return
  loading.value = true
  error.value = ''
  try {
    result.value = await runScreener(request.value)
    filtersOpen.value = false
  } catch (e) {
    error.value = (e as Error).message || 'The screener did not answer.'
  } finally {
    loading.value = false
  }
}
function runFirstPage() {
  form.page = 1
  void run()
}
const pageCount = computed(() => Math.max(1, Math.ceil((result.value?.total ?? 0) / form.pageSize)))
function goPage(p: number) {
  form.page = p
  void run()
}
const sortDirOptions = [
  { value: 'desc', label: 'High → low' },
  { value: 'asc', label: 'Low → high' },
]
const candleOptions = [
  { value: 'confirmed', label: 'Confirmed candle' },
  { value: 'live', label: 'Live candle' },
]
const pageSizeOptions = PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))
const pageSizeModel = computed({
  get: () => String(form.pageSize),
  set: (v: string) => {
    form.pageSize = Number(v)
    form.page = 1
  },
})
const tfOptions = TIMEFRAMES.map((t) => ({ value: t, label: t }))
</script>

<template>
  <div class="tp-page sc">
    <Card>
      <template #header>
        <div class="tp-head">
          <h2 class="tp-title">Stock Screener</h2>
          <span class="tp-note">Filters run on the server, never in this browser.</span>
        </div>
      </template>
      <div v-if="!available" id="sc-unavailable" class="sc__notice" role="note">
        <span class="tp-strong">Screening is not available yet</span>
        <p class="tp-note">
          The backend has no screener endpoint (<code>{{ SCREENER_RUN_PATH }}</code> is not in the
          API contract). This screen builds the exact request it will take, described in
          {{ SCREENER_DOC }} of the market terminal doc. Copy the request and hand it to the
          backend. No results are calculated here and no sample results are shown.
        </p>
      </div>
    </Card>

    <div class="sc__layout">
      <Button
        class="sc__toggle"
        variant="secondary"
        :count="form.filters.length"
        :aria-expanded="filtersOpen ? 'true' : 'false'"
        aria-controls="sc-panel"
        @click="filtersOpen = !filtersOpen"
      >
        {{ filtersOpen ? 'Hide filters' : 'Filters' }}
      </Button>

      <aside
        id="sc-panel"
        class="sc__panel"
        :class="{ 'is-open': filtersOpen }"
        aria-label="Screener filters"
      >
        <form class="sc__form" @submit.prevent="runFirstPage">
          <fieldset class="sc__group">
            <legend class="sc__legend">Markets</legend>
            <div class="tp-row" role="group" aria-label="Exchanges">
              <Checkbox
                v-for="e in EXCHANGES"
                :key="e.value"
                :label="e.label"
                :model-value="form.exchanges.includes(e.value)"
                @update:model-value="(on: boolean) => toggle(form.exchanges, e.value, on)"
              />
            </div>
            <div class="tp-row" role="group" aria-label="Instrument kinds">
              <Checkbox
                v-for="k in KINDS"
                :key="k.value"
                :label="k.label"
                :model-value="form.kinds.includes(k.value)"
                @update:model-value="(on: boolean) => toggle(form.kinds, k.value, on)"
              />
            </div>
            <p class="tp-note">Futures are screened where the backend has their candles.</p>
            <FormField label="Universe" :hint="STORAGE_NOTE[store.storage]">
              <Select v-model="watchlistModel" :options="watchlistOptions" size="sm" />
            </FormField>
            <p v-if="linkedMissing" class="tp-note" role="status">{{ linkedMissing }}</p>
            <p v-for="m in issuesFor('universe')" :key="m" class="sc__err" role="alert">{{ m }}</p>
          </fieldset>

          <fieldset class="sc__group">
            <legend class="sc__legend">Candles</legend>
            <FormField label="Timeframe">
              <Select v-model="form.timeframe" :options="tfOptions" size="sm" />
            </FormField>
            <SegmentedControl
              v-model="form.candle"
              :options="candleOptions"
              size="sm"
              aria-label="Candle"
            />
            <p class="tp-note">
              <template v-if="form.candle === 'confirmed'"
                >Confirmed: only closed candles count, so a match cannot undo itself.</template
              >
              <template v-else
                >Live: the forming candle counts. A crossover can disappear before the bar
                closes.</template
              >
            </p>
          </fieldset>

          <fieldset class="sc__group">
            <legend class="sc__legend">Technical filters</legend>
            <ol class="sc__filters">
              <li v-for="(f, i) in form.filters" :key="i" class="sc__filter">
                <div class="tp-head">
                  <span class="tp-strong">{{ FILTER_LABEL[f.type] }}</span>
                  <IconButton
                    size="sm"
                    tone="danger"
                    :label="`Remove filter ${i + 1}: ${describeFilter(f)}`"
                    @click="removeFilter(i)"
                    ><Icon name="x" size="sm"
                  /></IconButton>
                </div>
                <div class="sc__fields">
                  <FormField v-for="fd in FIELDS[f.type]" :key="fd.key" :label="fd.label" size="sm">
                    <NumberInput
                      v-if="fd.kind === 'int' || fd.kind === 'num'"
                      :model-value="fieldValue(f, fd.key) as number | null"
                      :min="fd.min"
                      :max="fd.max"
                      :step="fd.step ?? 1"
                      size="sm"
                      @update:model-value="(v: number | null) => setField(f, fd.key, v)"
                    />
                    <Select
                      v-else
                      :model-value="fieldValue(f, fd.key) as string"
                      :options="CHOICES[fd.kind as 'op']"
                      size="sm"
                      @update:model-value="(v: string) => setField(f, fd.key, v)"
                    />
                  </FormField>
                </div>
                <p class="tp-note">{{ describeFilter(f) }}</p>
                <p v-for="m in issuesFor(`filters.${i}`)" :key="m" class="sc__err" role="alert">
                  {{ m }}
                </p>
              </li>
            </ol>
            <p v-for="m in issuesFor('filters')" :key="m" class="sc__err" role="alert">{{ m }}</p>
            <Dropdown :items="presetMenu" label="Add filter" @select="addPreset" />
          </fieldset>

          <fieldset class="sc__group">
            <legend class="sc__legend">Sort and page</legend>
            <FormField label="Sort by">
              <Select v-model="form.sortField" :options="SORT_FIELDS" size="sm" />
            </FormField>
            <SegmentedControl
              v-model="form.sortDir"
              :options="sortDirOptions"
              size="sm"
              aria-label="Sort direction"
            />
            <FormField label="Page size">
              <Select v-model="pageSizeModel" :options="pageSizeOptions" size="sm" />
            </FormField>
          </fieldset>

          <div class="sc__actions">
            <Button
              type="submit"
              variant="primary"
              :disabled="!available || !valid"
              :loading="loading"
              :aria-describedby="!available ? 'sc-unavailable' : undefined"
            >
              Run screener
            </Button>
            <Button variant="secondary" :disabled="!valid" @click="copyRequest"
              >Copy request</Button
            >
            <Button variant="ghost" @click="showRequest = !showRequest">
              {{ showRequest ? 'Hide request' : 'Show request' }}
            </Button>
          </div>
          <p v-if="!available" class="tp-note">
            Run is off until the backend ships {{ SCREENER_RUN_PATH }} ({{ SCREENER_DOC }}).
          </p>
          <p v-else-if="!valid" class="tp-note">Fix the highlighted fields to run.</p>
          <p v-if="copyMsg" class="tp-note" role="status">{{ copyMsg }}</p>
          <pre v-if="showRequest" class="sc__pre" aria-label="Screener request">{{
            requestText(request)
          }}</pre>
        </form>
      </aside>

      <section class="sc__results" aria-label="Screener results">
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Results</span>
              <span v-if="result" class="tp-note">
                {{ result.total }} of {{ result.universe_size }} instruments ·
                {{ result.timeframe }} · {{ result.candle }} candle · as of {{ when(result.as_of) }}
              </span>
            </div>
          </template>
          <div v-if="error" class="sc__notice sc__notice--danger" role="alert">
            <span class="tp-strong">The screener failed</span>
            <p class="tp-note">{{ error }}</p>
            <Button size="sm" variant="secondary" @click="run">Retry</Button>
          </div>
          <p v-if="loading" class="tp-note" role="status">Screening…</p>
          <template v-if="result && !loading">
            <ScreenerResults v-if="result.items.length" :response="result" />
            <EmptyState
              v-else
              title="Nothing matched"
              description="No instrument met every filter. Loosen a filter or widen the markets."
            />
            <Pagination
              v-if="pageCount > 1"
              :page="form.page"
              :page-count="pageCount"
              @update:page="goPage"
            />
          </template>
          <EmptyState
            v-else-if="!available && !loading"
            title="No results to show"
            :description="`Screening needs the backend's screener endpoint (${SCREENER_DOC}). Until it exists this screen only builds the request.`"
          />
          <EmptyState
            v-else-if="!loading && !error"
            title="Run the screener"
            description="Set the filters and press Run."
          />
        </Card>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sc__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-4);
  min-width: 0;
}
.sc__toggle {
  justify-self: start;
}
.sc__panel {
  display: none;
  min-width: 0;
}
.sc__panel.is-open {
  display: block;
}
.sc__results {
  min-width: 0;
}
@media (min-width: 900px) {
  .sc__layout {
    grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
    align-items: start;
  }
  .sc__toggle {
    display: none;
  }
  .sc__panel,
  .sc__panel.is-open {
    display: block;
    position: sticky;
    top: var(--sp-4);
    max-height: calc(100vh - var(--sp-6));
    overflow-y: auto;
  }
}
.sc__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: var(--radius-card);
  background: var(--glass-bg, var(--theme-surface));
}
.sc__group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0 0 var(--sp-3);
  border: 0;
  border-bottom: 1px solid var(--glass-border, var(--theme-border));
  min-width: 0;
}
.sc__legend {
  padding: 0;
  margin-bottom: var(--sp-1);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.sc__filters {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.sc__filter {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2);
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: var(--radius-md);
  min-width: 0;
}
.sc__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
  gap: var(--sp-2);
  min-width: 0;
}
.sc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.sc__notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  padding: var(--sp-3);
  border: 1px solid var(--theme-warning);
  border-left-width: 3px;
  border-radius: var(--radius-card);
  min-width: 0;
}
.sc__notice--danger {
  border-color: var(--theme-danger);
}
.sc__err {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-danger);
  min-width: 0;
  overflow-wrap: anywhere;
}
.sc__pre {
  margin: 0;
  padding: var(--sp-2);
  max-height: 320px;
  overflow: auto;
  border-radius: var(--radius-md);
  background: var(--theme-input);
  color: var(--text-primary);
  font-size: var(--text-xs);
  white-space: pre;
  min-width: 0;
}
@media (pointer: coarse) {
  .sc__toggle {
    min-height: 44px;
  }
}
</style>

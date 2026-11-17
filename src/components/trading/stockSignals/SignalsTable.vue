<script setup lang="ts">
// The Live Signals table: one row per stock in the universe, searchable,
// filterable, sortable and paged. A chevron opens the row's details right under
// it (only on demand; it reuses the row's already-read numbers, no extra fetch).
// Actions: details, chart, watchlist, alert, portfolio impact (held stocks),
// compare. The stock column stays put while the table scrolls sideways; less
// important columns step out on narrow screens.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Select from '@/components/ui/Select.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SignalBadge from './SignalBadge.vue'
import SignalDetail from './SignalDetail.vue'
import { dec, signed, ago } from '@/trading/format'
import type { Timeframe } from '@/trading/chartView'
import { isStaleAt, strengthWord, type SignalClass } from '@/trading/stockSignals/classify'
import {
  ORIGIN_LABEL,
  type RowData,
  type UniverseItem,
} from '@/trading/stockSignals/useStockSignals'
import type { HoldingView } from '@/trading/stockSignals/portfolio'
import type { StreamQuote } from '@/trading/stream'

const props = defineProps<{
  items: readonly UniverseItem[]
  rows: Readonly<Record<number, RowData>>
  holdings: ReadonlyMap<number, HoldingView>
  quotes: ReadonlyMap<number, StreamQuote>
  tf: Timeframe
  now: number
  loading: boolean
}>()
const emit = defineEmits<{
  chart: [UniverseItem]
  watchlist: [UniverseItem]
  alert: [UniverseItem]
  impact: [UniverseItem]
  compare: [UniverseItem]
}>()

// --- query -------------------------------------------------------------------------------
const q = ref('')
const cls = ref<'all' | SignalClass>('all')
const scope = ref<'all' | 'held' | 'watchlist' | 'screener'>('all')
const CLASS_OPTIONS = [
  { value: 'all', label: 'All signals' },
  { value: 'bullish', label: 'Bullish' },
  { value: 'bearish', label: 'Bearish' },
  { value: 'pending', label: 'Pending VWAP' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'unavailable', label: 'No data' },
]
const SCOPE_OPTIONS = [
  { value: 'all', label: 'All stocks' },
  { value: 'held', label: 'Held' },
  { value: 'watchlist', label: 'Watchlists' },
  { value: 'screener', label: 'Screener picks' },
]

type SortKey =
  'symbol' | 'ltp' | 'change' | 'ema8' | 'ema32' | 'vwap' | 'signal' | 'strength' | 'time'
const sortKey = ref<SortKey>('strength')
const sortDir = ref<1 | -1>(-1)
function sortBy(k: SortKey) {
  if (sortKey.value === k) sortDir.value = sortDir.value === 1 ? -1 : 1
  else {
    sortKey.value = k
    sortDir.value = k === 'symbol' ? 1 : -1
  }
}
function ariaSort(k: SortKey) {
  return sortKey.value !== k ? 'none' : sortDir.value === 1 ? 'ascending' : 'descending'
}

const ORDER: Record<SignalClass, number> = {
  bullish: 4,
  pending: 3,
  mixed: 2,
  bearish: 1,
  unavailable: 0,
}

interface Line {
  item: UniverseItem
  row: RowData | undefined
  ltp: number | null
  live: boolean
  held: boolean
}
const lines = computed<Line[]>(() =>
  props.items.map((item) => {
    const row = props.rows[item.instrument.id]
    const quote = props.quotes.get(item.instrument.id)
    const ltpLive = quote?.ltp && !quote.stale ? Number(quote.ltp) : null
    return {
      item,
      row,
      ltp: ltpLive ?? row?.reading?.close ?? null,
      live: ltpLive !== null,
      held: item.origins.includes('holding'),
    }
  }),
)
function keyOf(l: Line, k: SortKey): number | string {
  const r = l.row?.reading
  switch (k) {
    case 'symbol':
      return l.item.instrument.symbol
    case 'ltp':
      return l.ltp ?? -Infinity
    case 'change':
      return l.row?.change ?? -Infinity
    case 'ema8':
      return r?.ema8 ?? -Infinity
    case 'ema32':
      return r?.ema32 ?? -Infinity
    case 'vwap':
      return r?.vwapDistPct ?? -Infinity
    case 'signal':
      return r ? ORDER[r.cls] : -1
    case 'strength':
      return r?.strength ?? -1
    case 'time':
      return r?.cross?.at ?? -Infinity
  }
}
const filtered = computed(() => {
  const text = q.value.trim().toLowerCase()
  return lines.value
    .filter(
      (l) =>
        !text ||
        l.item.instrument.symbol.toLowerCase().includes(text) ||
        (l.item.instrument.name ?? '').toLowerCase().includes(text),
    )
    .filter((l) => cls.value === 'all' || (l.row?.reading?.cls ?? 'unavailable') === cls.value)
    .filter(
      (l) =>
        scope.value === 'all' ||
        l.item.origins.includes(scope.value === 'held' ? 'holding' : scope.value),
    )
    .sort((a, b) => {
      const x = keyOf(a, sortKey.value)
      const y = keyOf(b, sortKey.value)
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)
      return c * sortDir.value || a.item.instrument.symbol.localeCompare(b.item.instrument.symbol)
    })
})

const PAGE = 20
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE)))
watch([q, cls, scope], () => (page.value = 1))
watch(pageCount, (n) => (page.value = Math.min(page.value, n)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE, page.value * PAGE))

// --- expanded rows -----------------------------------------------------------------------
const open = ref<Set<number>>(new Set())
function toggle(id: number) {
  const s = new Set(open.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  open.value = s
}

const COLS = [
  { key: 'symbol', label: 'Stock', cls: 'c-stock' },
  { key: 'ltp', label: 'LTP', cls: 'c-num' },
  { key: 'change', label: 'Change', cls: 'c-num' },
  { key: 'ema8', label: 'EMA 8', cls: 'c-num c-md' },
  { key: 'ema32', label: 'EMA 32', cls: 'c-num c-md' },
  { key: 'vwap', label: 'VWAP', cls: 'c-num c-lg' },
  { key: 'signal', label: 'Signal', cls: '' },
  { key: 'strength', label: 'Strength', cls: 'c-sm' },
  { key: 'time', label: 'Cross time', cls: 'c-lg' },
] as const

function crossTime(l: Line): string {
  const c = l.row?.reading?.cross
  return c ? ago(new Date(c.at).toISOString(), props.now) : '—'
}
const p = (v: number | null | undefined) => (v === null || v === undefined ? '—' : dec(v, 2))
</script>

<template>
  <section class="stb" aria-label="Stock signals">
    <div class="stb__tools">
      <SearchField
        v-model="q"
        size="sm"
        placeholder="Search symbol or name"
        label="Search stocks"
      />
      <Select v-model="cls" :options="CLASS_OPTIONS" size="sm" aria-label="Signal filter" />
      <Select v-model="scope" :options="SCOPE_OPTIONS" size="sm" aria-label="Which stocks" />
      <span class="stb__count tp-num" role="status">
        {{ filtered.length }} of {{ items.length }} stocks
      </span>
    </div>

    <Skeleton v-if="loading && !items.length" :lines="8" height="44px" radius="var(--radius-md)" />
    <EmptyState
      v-else-if="!items.length"
      glyph="📈"
      title="No stocks to read yet"
      description="Signals are read for your Dhan holdings, your watchlists and today’s screener crosses. Add a stock to a watchlist, or connect Dhan, and they show here."
    />
    <EmptyState
      v-else-if="!filtered.length"
      glyph="🔍"
      title="Nothing matches"
      description="Try another filter or a shorter search."
    >
      <template #action>
        <Button size="sm" variant="secondary" @click="((q = ''), (cls = 'all'), (scope = 'all'))"
          >Clear filters</Button
        >
      </template>
    </EmptyState>

    <div v-else class="stb__wrap">
      <table class="stb__table">
        <thead>
          <tr>
            <th class="c-x" scope="col"><span class="sr">Details</span></th>
            <th
              v-for="c in COLS"
              :key="c.key"
              scope="col"
              :class="c.cls"
              :aria-sort="ariaSort(c.key)"
            >
              <button type="button" class="stb__sort" @click="sortBy(c.key)">
                {{ c.label }}
                <Icon
                  :name="
                    sortKey === c.key
                      ? sortDir === 1
                        ? 'chevron-up'
                        : 'chevron-down'
                      : 'chevrons-up-down'
                  "
                  size="xs"
                />
              </button>
            </th>
            <th class="c-sm" scope="col">Portfolio</th>
            <th class="c-act" scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="l in shown" :key="l.item.instrument.id">
            <tr
              class="stb__row"
              :class="[
                `is-${l.row?.reading?.cls ?? 'unavailable'}`,
                { 'is-open': open.has(l.item.instrument.id) },
              ]"
            >
              <td class="c-x">
                <IconButton
                  :label="`${open.has(l.item.instrument.id) ? 'Hide' : 'Show'} details for ${l.item.instrument.symbol}`"
                  size="sm"
                  :aria-expanded="open.has(l.item.instrument.id)"
                  @click="toggle(l.item.instrument.id)"
                >
                  <Icon name="chevron-down" size="sm" class="stb__chev" />
                </IconButton>
              </td>
              <th scope="row" class="c-stock">
                <span class="stb__sym">{{
                  l.item.instrument.trading_symbol || l.item.instrument.symbol
                }}</span>
                <span class="stb__name">{{
                  l.item.instrument.name || l.item.instrument.display_name
                }}</span>
              </th>
              <td class="c-num">
                <span class="tp-num">{{ p(l.ltp) }}</span>
                <span v-if="l.live" class="stb__live" title="Live from the broker feed">●</span>
              </td>
              <td class="c-num">
                <span
                  v-if="l.row?.change !== null && l.row?.change !== undefined"
                  class="tp-num"
                  :class="l.row.change >= 0 ? 'is-up' : 'is-down'"
                  >{{ signed(l.row.change, 2) }}%</span
                >
                <span v-else>—</span>
              </td>
              <td class="c-num c-md tp-num">{{ p(l.row?.reading?.ema8) }}</td>
              <td class="c-num c-md tp-num">{{ p(l.row?.reading?.ema32) }}</td>
              <td class="c-num c-lg tp-num">
                <template v-if="l.row?.reading?.usesVwap">{{ p(l.row.reading.vwap) }}</template>
                <span v-else class="stb__dim" title="Daily bars have no session VWAP">n/a</span>
              </td>
              <td>
                <span v-if="l.row?.state === 'loading' && !l.row.reading" class="stb__dim"
                  >Reading…</span
                >
                <SignalBadge
                  v-else
                  :cls="l.row?.reading?.cls ?? 'unavailable'"
                  :stale="!!l.row?.reading && isStaleAt(l.row.reading.asOf, tf, now)"
                />
              </td>
              <td class="c-sm">
                <span v-if="l.row?.reading?.strength != null" class="stb__strength">
                  <span class="stb__meter" aria-hidden="true">
                    <span :style="{ width: `${l.row.reading.strength}%` }" />
                  </span>
                  <span class="tp-num">{{ l.row.reading.strength }}</span>
                  <span class="sr">{{ strengthWord(l.row.reading.strength) }}</span>
                </span>
                <span v-else>—</span>
              </td>
              <td class="c-lg stb__dim">{{ crossTime(l) }}</td>
              <td class="c-sm">
                <span v-if="l.held" class="stb__held">Held</span>
                <span v-else class="stb__dim">{{
                  l.item.origins.map((o) => ORIGIN_LABEL[o]).join(', ')
                }}</span>
              </td>
              <td class="c-act">
                <span class="stb__acts">
                  <IconButton
                    :label="`View chart for ${l.item.instrument.symbol}`"
                    size="sm"
                    @click="emit('chart', l.item)"
                  >
                    <Icon name="chart-candlestick" size="sm" />
                  </IconButton>
                  <IconButton
                    :label="`Add ${l.item.instrument.symbol} to a watchlist`"
                    size="sm"
                    @click="emit('watchlist', l.item)"
                  >
                    <Icon name="star" size="sm" />
                  </IconButton>
                  <IconButton
                    :label="`Create an alert for ${l.item.instrument.symbol}`"
                    size="sm"
                    @click="emit('alert', l.item)"
                  >
                    <Icon name="bell" size="sm" />
                  </IconButton>
                  <IconButton
                    v-if="l.held"
                    :label="`Portfolio impact of ${l.item.instrument.symbol}`"
                    size="sm"
                    @click="emit('impact', l.item)"
                  >
                    <Icon name="briefcase" size="sm" />
                  </IconButton>
                  <IconButton
                    :label="`Compare ${l.item.instrument.symbol} with another stock`"
                    size="sm"
                    @click="emit('compare', l.item)"
                  >
                    <Icon name="git-compare" size="sm" />
                  </IconButton>
                </span>
              </td>
            </tr>
            <tr v-if="open.has(l.item.instrument.id)" class="stb__detail">
              <td :colspan="COLS.length + 3">
                <SignalDetail
                  :reading="l.row?.reading ?? null"
                  :tf="tf"
                  :now="now"
                  :holding="holdings.get(l.item.instrument.id) ?? null"
                  :error="l.row?.state === 'error' ? l.row.error : ''"
                >
                  <Button size="sm" variant="tinted" @click="emit('chart', l.item)">
                    <Icon name="chart-candlestick" size="sm" />View chart
                  </Button>
                  <Button size="sm" variant="secondary" @click="emit('watchlist', l.item)">
                    <Icon name="star" size="sm" />Watchlist
                  </Button>
                  <Button size="sm" variant="secondary" @click="emit('alert', l.item)">
                    <Icon name="bell" size="sm" />Alert
                  </Button>
                  <Button
                    v-if="l.held"
                    size="sm"
                    variant="secondary"
                    @click="emit('impact', l.item)"
                  >
                    <Icon name="briefcase" size="sm" />Portfolio impact
                  </Button>
                  <Button size="sm" variant="ghost" @click="emit('compare', l.item)">
                    <Icon name="git-compare" size="sm" />Compare
                  </Button>
                </SignalDetail>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <Pagination
      v-if="pageCount > 1"
      :page="page"
      :page-count="pageCount"
      @update:page="(n: number) => (page = n)"
    />
  </section>
</template>

<style scoped>
.stb {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  container-type: inline-size;
}
.stb__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.stb__tools > :first-child {
  flex: 1 1 220px;
  max-width: 340px;
}
.stb__count {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.stb__wrap {
  overflow-x: auto;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
}
.stb__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}
.stb__table th,
.stb__table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--theme-border);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
  background: var(--theme-card);
}
.stb__table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-dim);
}
/* The chevron and the stock name stay in view while the table scrolls sideways. */
.c-x {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 40px;
  padding-right: 0 !important;
}
.c-stock {
  position: sticky;
  left: 40px;
  z-index: 1;
  min-width: 140px;
  box-shadow: 1px 0 0 var(--theme-border);
}
thead .c-x,
thead .c-stock {
  z-index: 3;
}
.c-num {
  text-align: right !important;
}
.c-num .stb__sort {
  margin-left: auto;
}
.stb__sort {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}
.stb__sort:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.stb__row:hover td,
.stb__row:hover th {
  background: color-mix(in oklch, var(--theme-text) 3%, var(--theme-card));
}
.stb__row.is-open td,
.stb__row.is-open th {
  border-bottom-color: transparent;
}
.stb__chev {
  transition: transform var(--dur-fast) ease;
}
.stb__row.is-open .stb__chev {
  transform: rotate(180deg);
}
.stb__sym {
  display: block;
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.stb__name {
  display: block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--text-2xs);
  font-weight: var(--weight-normal);
  color: var(--theme-dim);
  min-width: 0;
}
.stb__live {
  margin-left: 4px;
  font-size: var(--text-2xs);
  color: var(--theme-success);
  vertical-align: middle;
}
.is-up {
  color: var(--theme-success);
}
.is-down {
  color: var(--theme-danger);
}
.stb__dim {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.stb__strength {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.stb__meter {
  position: relative;
  width: 44px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 10%, transparent);
  overflow: hidden;
}
.stb__meter span {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--theme-accent);
}
.stb__row.is-bullish .stb__meter span {
  background: var(--theme-success);
}
.stb__row.is-bearish .stb__meter span {
  background: var(--theme-danger);
}
.stb__held {
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 15%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.stb__acts {
  display: inline-flex;
  gap: 0;
}
.stb__detail td {
  padding: var(--sp-3) var(--sp-4) var(--sp-4) 50px;
  white-space: normal;
  background: color-mix(in oklch, var(--theme-text) 2%, var(--theme-card));
  animation: stb-open var(--dur-fast, 150ms) ease-out;
}
.stb__detail :deep(.sd__actions .ui-icon) {
  margin-right: 4px;
}
@keyframes stb-open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* Fewer columns as the room shrinks: the stock, price, move and signal stay. */
@container (max-width: 1100px) {
  .c-lg {
    display: none;
  }
}
@container (max-width: 880px) {
  .c-md {
    display: none;
  }
}
@container (max-width: 640px) {
  .c-sm {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .stb__detail td,
  .stb__chev {
    animation: none;
    transition: none;
  }
}
</style>

<script setup lang="ts">
// The Live Signals table: the engine's stored state of each evaluated stock,
// searchable, filterable, sortable and paged. A chevron opens the row's details
// right under it, on demand (the crossover event is read then if it is not
// already known). Actions: chart, watchlist, alerts, portfolio impact (held
// stocks), compare. The stock column stays put while the table scrolls
// sideways; less important columns step out on narrow screens. The visible
// page's ids go up so the page can follow their live prices.
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
import {
  STATE_BUCKET,
  num,
  type Bucket,
  type PortfolioHolding,
  type SignalEvent,
  type StateRow,
} from '@/trading/stockSignals/api'
import type { StreamQuote } from '@/trading/stream'

const props = defineProps<{
  rows: readonly StateRow[]
  total: number
  events: ReadonlyMap<number, SignalEvent>
  holdingOf: (id: number) => PortfolioHolding | null
  quotes: ReadonlyMap<number, StreamQuote>
  now: number
  loading: boolean
}>()
const emit = defineEmits<{
  chart: [StateRow]
  watchlist: [StateRow]
  alert: [StateRow]
  impact: [StateRow]
  compare: [StateRow]
  expand: [StateRow]
  visible: [number[]]
}>()

const q = ref('')
const bucket = ref<'all' | Bucket>('all')
const scope = ref<'all' | 'held' | 'fresh'>('all')
const BUCKET_OPTIONS = [
  { value: 'all', label: 'All signals' },
  { value: 'bullish', label: 'Bullish' },
  { value: 'bearish', label: 'Bearish' },
  { value: 'pending', label: 'Awaiting VWAP' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'unavailable', label: 'No data' },
]
const SCOPE_OPTIONS = [
  { value: 'all', label: 'All stocks' },
  { value: 'held', label: 'Held only' },
  { value: 'fresh', label: 'Crossed recently' },
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
const ORDER: Record<Bucket, number> = {
  bullish: 4,
  pending: 3,
  mixed: 2,
  bearish: 1,
  unavailable: 0,
}

function ltpOf(r: StateRow): { value: number | null; live: boolean } {
  const quote = props.quotes.get(r.instrument_id)
  const live = quote?.ltp && !quote.stale ? Number(quote.ltp) : null
  return { value: live ?? num(r.last_price), live: live !== null }
}
function keyOf(r: StateRow, k: SortKey): number | string {
  switch (k) {
    case 'symbol':
      return r.symbol
    case 'ltp':
      return ltpOf(r).value ?? -Infinity
    case 'change':
      return num(r.change_pct) ?? -Infinity
    case 'ema8':
      return num(r.ema_fast) ?? -Infinity
    case 'ema32':
      return num(r.ema_slow) ?? -Infinity
    case 'vwap':
      return num(r.vwap_distance_pct) ?? -Infinity
    case 'signal':
      return ORDER[STATE_BUCKET[r.state]]
    case 'strength':
      return num(r.trend_score) ?? -1
    case 'time': {
      const e = props.events.get(r.instrument_id)
      return e ? Date.parse(e.crossed_at) : -Infinity
    }
  }
}
const filtered = computed(() => {
  const text = q.value.trim().toLowerCase()
  return props.rows
    .filter(
      (r) =>
        !text ||
        r.symbol.toLowerCase().includes(text) ||
        (r.name ?? '').toLowerCase().includes(text),
    )
    .filter((r) => bucket.value === 'all' || STATE_BUCKET[r.state] === bucket.value)
    .filter((r) =>
      scope.value === 'all'
        ? true
        : scope.value === 'held'
          ? r.in_holdings
          : props.events.has(r.instrument_id),
    )
    .sort((a, b) => {
      const x = keyOf(a, sortKey.value)
      const y = keyOf(b, sortKey.value)
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)
      return c * sortDir.value || a.symbol.localeCompare(b.symbol)
    })
})

const PAGE = 20
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE)))
watch([q, bucket, scope], () => (page.value = 1))
watch(pageCount, (n) => (page.value = Math.min(page.value, n)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE, page.value * PAGE))
watch(
  () => shown.value.map((r) => r.instrument_id).join(),
  () =>
    emit(
      'visible',
      shown.value.map((r) => r.instrument_id),
    ),
  { immediate: true },
)

const open = ref<Set<number>>(new Set())
function toggle(r: StateRow) {
  const s = new Set(open.value)
  if (s.has(r.instrument_id)) s.delete(r.instrument_id)
  else {
    s.add(r.instrument_id)
    emit('expand', r)
  }
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
  { key: 'time', label: 'Signal time', cls: 'c-lg' },
] as const

const p = (v: string | number | null | undefined) => {
  const n = num(v)
  return n === null ? '—' : dec(n, 2)
}
const up = (v: string | null | undefined) => (num(v) ?? 0) >= 0
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
      <Select v-model="bucket" :options="BUCKET_OPTIONS" size="sm" aria-label="Signal filter" />
      <Select v-model="scope" :options="SCOPE_OPTIONS" size="sm" aria-label="Which stocks" />
      <span class="stb__count tp-num" role="status">
        {{ filtered.length }} of {{ rows.length }} stocks<template v-if="total > rows.length">
          · first {{ rows.length }} of {{ total }} evaluated</template
        >
      </span>
    </div>

    <Skeleton v-if="loading && !rows.length" :lines="8" height="44px" radius="var(--radius-md)" />
    <EmptyState
      v-else-if="!rows.length"
      glyph="📈"
      title="No signals stored yet"
      description="The signal engine stores a state for each stock after every 15-minute close in market hours. Once its first run finishes, the stocks show here."
    />
    <EmptyState
      v-else-if="!filtered.length"
      glyph="🔍"
      title="Nothing matches"
      description="Try another filter or a shorter search."
    >
      <template #action>
        <Button size="sm" variant="secondary" @click="((q = ''), (bucket = 'all'), (scope = 'all'))"
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
          <template v-for="r in shown" :key="r.instrument_id">
            <tr
              class="stb__row"
              :class="[`is-${STATE_BUCKET[r.state]}`, { 'is-open': open.has(r.instrument_id) }]"
            >
              <td class="c-x">
                <IconButton
                  :label="`${open.has(r.instrument_id) ? 'Hide' : 'Show'} details for ${r.symbol}`"
                  size="sm"
                  :aria-expanded="open.has(r.instrument_id)"
                  @click="toggle(r)"
                >
                  <Icon name="chevron-down" size="sm" class="stb__chev" />
                </IconButton>
              </td>
              <th scope="row" class="c-stock">
                <span class="stb__sym">{{ r.symbol }}</span>
                <span class="stb__name">{{ r.name }}</span>
              </th>
              <td class="c-num">
                <span class="tp-num">{{ p(ltpOf(r).value) }}</span>
                <span v-if="ltpOf(r).live" class="stb__live" title="Live from the broker feed"
                  >●</span
                >
              </td>
              <td class="c-num">
                <span
                  v-if="num(r.change_pct) !== null"
                  class="tp-num"
                  :class="up(r.change_pct) ? 'is-up' : 'is-down'"
                  >{{ signed(r.change_pct, 2) }}%</span
                >
                <span v-else>—</span>
              </td>
              <td class="c-num c-md tp-num">{{ p(r.ema_fast) }}</td>
              <td class="c-num c-md tp-num">{{ p(r.ema_slow) }}</td>
              <td class="c-num c-lg tp-num">
                {{ p(r.vwap) }}
                <span
                  v-if="num(r.vwap_distance_pct) !== null"
                  class="stb__dist"
                  :class="up(r.vwap_distance_pct) ? 'is-up' : 'is-down'"
                  >{{ signed(r.vwap_distance_pct, 2) }}%</span
                >
              </td>
              <td><SignalBadge :state="r.state" /></td>
              <td class="c-sm">
                <span v-if="num(r.trend_score) !== null" class="stb__strength">
                  <span class="stb__meter" aria-hidden="true">
                    <span :style="{ width: `${num(r.trend_score)}%` }" />
                  </span>
                  <span class="tp-num">{{ dec(r.trend_score, 0) }}</span>
                </span>
                <span v-else>—</span>
              </td>
              <td class="c-lg stb__dim">
                {{
                  events.get(r.instrument_id)
                    ? ago(events.get(r.instrument_id)!.crossed_at, now)
                    : '—'
                }}
              </td>
              <td class="c-sm">
                <span v-if="r.in_holdings" class="stb__held">Held</span>
                <span v-else class="stb__dim">Not held</span>
              </td>
              <td class="c-act">
                <span class="stb__acts">
                  <IconButton
                    :label="`View chart for ${r.symbol}`"
                    size="sm"
                    @click="emit('chart', r)"
                  >
                    <Icon name="chart-candlestick" size="sm" />
                  </IconButton>
                  <IconButton
                    :label="`Add ${r.symbol} to a watchlist`"
                    size="sm"
                    @click="emit('watchlist', r)"
                  >
                    <Icon name="star" size="sm" />
                  </IconButton>
                  <IconButton :label="`Alerts for ${r.symbol}`" size="sm" @click="emit('alert', r)">
                    <Icon name="bell" size="sm" />
                  </IconButton>
                  <IconButton
                    v-if="r.in_holdings"
                    :label="`Portfolio impact of ${r.symbol}`"
                    size="sm"
                    @click="emit('impact', r)"
                  >
                    <Icon name="briefcase" size="sm" />
                  </IconButton>
                  <IconButton
                    :label="`Compare ${r.symbol} with another stock`"
                    size="sm"
                    @click="emit('compare', r)"
                  >
                    <Icon name="git-compare" size="sm" />
                  </IconButton>
                </span>
              </td>
            </tr>
            <tr v-if="open.has(r.instrument_id)" class="stb__detail">
              <td :colspan="COLS.length + 3">
                <SignalDetail
                  :state="r"
                  :event="events.get(r.instrument_id) ?? null"
                  :holding="holdingOf(r.instrument_id)"
                  :now="now"
                >
                  <Button size="sm" variant="tinted" @click="emit('chart', r)">
                    <Icon name="chart-candlestick" size="sm" />View chart
                  </Button>
                  <Button size="sm" variant="secondary" @click="emit('watchlist', r)">
                    <Icon name="star" size="sm" />Watchlist
                  </Button>
                  <Button size="sm" variant="secondary" @click="emit('alert', r)">
                    <Icon name="bell" size="sm" />Alerts
                  </Button>
                  <Button
                    v-if="r.in_holdings"
                    size="sm"
                    variant="secondary"
                    @click="emit('impact', r)"
                  >
                    <Icon name="briefcase" size="sm" />Portfolio impact
                  </Button>
                  <Button size="sm" variant="ghost" @click="emit('compare', r)">
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--text-2xs);
  font-weight: var(--weight-normal);
  color: var(--theme-dim);
}
.stb__live {
  margin-left: 4px;
  font-size: var(--text-2xs);
  color: var(--theme-success);
}
.stb__dist {
  display: block;
  font-size: var(--text-2xs);
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
}
.stb__detail td {
  padding: var(--sp-3) var(--sp-4) var(--sp-4) 50px;
  white-space: normal;
  background: color-mix(in oklch, var(--theme-text) 2%, var(--theme-card));
  animation: stb-open var(--dur-fast, 150ms) ease-out;
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

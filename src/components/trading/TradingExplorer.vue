<script setup lang="ts">
// Market Explorer (/trading/market, and "All instruments" in the Stocks tab):
// the backend's instrument master, searched, filtered and paged on the server,
// with snapshot or live quotes beside each row.
//
//   GET /api/trading/brokers     which brokers have instruments, per segment
//   GET /api/trading/instruments ?broker&q&instrument_type&exchange&segment&limit&offset
//   GET /api/trading/quotes      ?broker&symbols=SEGMENT:ID,…   (≤ 50 per call)
//   live `quote` events from the trading stream, when the instrument is subscribed
//
// Honesty rules (docs/market-terminal.md):
// - Every filter is applied by the server before paging, so the count is the
//   whole market's. The Futures and Options kinds pick one contract type at a time.
// - % change needs a previous close the quote API does not send (§3): "—".
// - No instruments may mean the master was never synced; its sync status is
//   not reported (§2), so it is "unknown", not "ok".
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useVirtualizer } from '@tanstack/vue-virtual'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import InstrumentDetail from './InstrumentDetail.vue'
import MarketHealth from './MarketHealth.vue'
import MarketPanel from './MarketPanel.vue'
import { useNow } from '@/control/poll'
import { useUiStore } from '@/stores/ui'
import { ago, dec, when } from '@/trading/format'
import {
  brokerLabel,
  exchangeOf,
  fetchBrokers,
  KIND_LABEL,
  kindOf,
  searchInstruments,
  segmentOf,
  TYPES_BY_KIND,
  type Broker,
  type BrokerInfo,
  type Exchange,
  type Instrument,
  type Kind,
} from '@/trading/instruments'
import { changeOf, fetchQuotes, NO_CHANGE_REASON, quoteView, type QuoteOut } from '@/trading/quotes'
import { remember } from '@/trading/resolve'
import { live } from '@/trading/stream'
import { ApiFailure } from '@/trading/useLoad'

const { isPhone } = storeToRefs(useUiStore())
const now = useNow(5_000)

// --- the query (server side) --------------------------------------------------------------------
type KindFilter = 'all' | Exclude<Kind, 'other'>
const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'equity', label: 'Equity' },
  { value: 'index', label: 'Index' },
  { value: 'future', label: 'Futures' },
  { value: 'option', label: 'Options' },
]
const PAGE_SIZES = ['50', '100', '200'].map((v) => ({ value: v, label: `${v} per page` }))
const SEARCH_DEBOUNCE_MS = 300

const text = ref('')
const q = ref('')
const kind = ref<KindFilter>('all')
const contractType = ref<Record<'future' | 'option', string>>({
  future: TYPES_BY_KIND.future[0],
  option: TYPES_BY_KIND.option[0],
})
const pageSize = ref('50')
const page = ref(1)

// --- broker scope ------------------------------------------------------------------------------
const brokers = shallowRef<BrokerInfo[]>([])
const broker = ref<Broker>('dhan')
const brokerOptions = computed(() =>
  (brokers.value.length
    ? brokers.value
    : [{ broker: 'dhan', label: 'Dhan', configured: true, instruments: 0, segments: [] }]
  ).map((b) => ({
    value: b.broker,
    label: brokers.value.length ? brokerLabel(b as BrokerInfo) : b.label,
  })),
)
const brokerInfo = computed(() => brokers.value.find((b) => b.broker === broker.value) ?? null)
async function loadBrokers() {
  try {
    brokers.value = await fetchBrokers()
  } catch {
    brokers.value = [] // the selector falls back to Dhan; the search still works
  }
}
void loadBrokers()

// --- exchange and segment (server side) ----------------------------------------------------------
type ExchangeFilter = 'all' | Exchange
const EXCHANGES: { value: ExchangeFilter; label: string }[] = [
  { value: 'all', label: 'All exchanges' },
  { value: 'NSE', label: 'NSE' },
  { value: 'BSE', label: 'BSE' },
  { value: 'MCX', label: 'MCX' },
]
const exchange = ref<ExchangeFilter>('all')
const segment = ref('')
const segmentOptions = computed(() => [
  { value: '', label: 'All segments' },
  ...(brokerInfo.value?.segments ?? [])
    .filter((s) => exchange.value === 'all' || s.segment.startsWith(exchange.value))
    .map((s) => ({ value: s.segment, label: `${s.segment} · ${s.instruments.toLocaleString()}` })),
])
// A segment from another exchange or broker would match nothing.
watch([exchange, broker], () => {
  if (segment.value && !segmentOptions.value.some((o) => o.value === segment.value)) {
    segment.value = ''
  }
})

let debounce: ReturnType<typeof setTimeout> | undefined
watch(text, (t) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (q.value = t.trim()), SEARCH_DEBOUNCE_MS)
})
onBeforeUnmount(() => clearTimeout(debounce))

const instrumentType = computed(() => {
  const k = kind.value
  if (k === 'all') return undefined
  if (k === 'future' || k === 'option') return contractType.value[k]
  return TYPES_BY_KIND[k][0]
})
const typeOptions = computed(() =>
  kind.value === 'future' || kind.value === 'option'
    ? TYPES_BY_KIND[kind.value].map((t) => ({ value: t, label: t }))
    : [],
)
const contractTypeModel = computed({
  get: () =>
    kind.value === 'future' || kind.value === 'option' ? contractType.value[kind.value] : '',
  set: (v: string) => {
    if (kind.value === 'future' || kind.value === 'option') contractType.value[kind.value] = v
  },
})

// --- loading -----------------------------------------------------------------------------------
const rows = shallowRef<Instrument[]>([])
const total = ref(0)
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
let seq = 0

const limit = computed(() => Number(pageSize.value))
const offset = computed(() => (page.value - 1) * limit.value)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))

async function load() {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const res = await searchInstruments({
      broker: broker.value,
      q: q.value,
      instrumentType: instrumentType.value,
      exchange: exchange.value === 'all' ? undefined : exchange.value,
      segment: segment.value || undefined,
      limit: limit.value,
      offset: offset.value,
    })
    if (mine !== seq) return
    remember(res.items)
    rows.value = res.items
    total.value = res.total
    loaded.value = true
    void loadQuotes(res.items)
  } catch (e) {
    if (mine !== seq) return
    error.value =
      e instanceof ApiFailure
        ? `The instrument search failed: ${e.message}`
        : 'The instrument search could not be reached. Check the connection.'
  } finally {
    if (mine === seq) loading.value = false
  }
}

// A filter change goes back to page 1; any change reloads once.
watch([q, instrumentType, pageSize, broker, exchange, segment], () => (page.value = 1))
watch(
  () =>
    [
      broker.value,
      q.value,
      instrumentType.value,
      exchange.value,
      segment.value,
      pageSize.value,
      page.value,
    ].join('|'),
  () => void load(),
  { immediate: true },
)

// --- quotes ------------------------------------------------------------------------------------
const snapshots = shallowRef(new Map<string, QuoteOut>())
const quotesLoading = ref(false)
const quotesError = ref('')
const quotesAt = ref<string | null>(null)
let quoteSeq = 0

async function loadQuotes(items: Instrument[] = rows.value) {
  const refs = items.filter((i) => i.broker === 'dhan').map((i) => i.broker_instrument_id)
  const mine = ++quoteSeq
  quotesError.value = ''
  if (!refs.length) {
    snapshots.value = new Map()
    return
  }
  quotesLoading.value = true
  try {
    const got = await fetchQuotes(refs)
    if (mine !== quoteSeq) return
    snapshots.value = got
    quotesAt.value = new Date().toISOString()
  } catch (e) {
    if (mine !== quoteSeq) return
    snapshots.value = new Map()
    quotesError.value =
      e instanceof ApiFailure
        ? e.status === 501
          ? 'Quotes are not supported for this broker.'
          : `Quotes could not be read: ${e.message}. Prices show "—".`
        : 'Quotes could not be reached. Prices show "—".'
  } finally {
    if (mine === quoteSeq) quotesLoading.value = false
  }
}

const visible = computed(() =>
  rows.value.map((i) => ({
    i,
    quote: quoteView(
      live.quotes[i.id],
      snapshots.value.get(i.broker_instrument_id),
      live.status,
      now.value,
    ),
  })),
)
type Row = (typeof visible.value)[number]

function contract(i: Instrument): string {
  const parts = [i.expiry, i.strike ? dec(i.strike) : null, i.option_type].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}
function changeText(r: Row): { text: string; title: string } {
  const c = r.quote ? changeOf(r.quote.last, r.quote.previousClose) : null
  return c
    ? { text: `${c.pct}%`, title: `${c.change} since the previous close` }
    : { text: '—', title: NO_CHANGE_REASON }
}

// --- the long list: virtualised past a page of 100 -----------------------------------------------
const VIRTUAL_AFTER = 100
const ROW_PX = 44
const scroller = ref<HTMLElement | null>(null)
const virtual = computed(() => visible.value.length > VIRTUAL_AFTER)
const virtualizer = useVirtualizer(
  computed(() => ({
    count: virtual.value ? visible.value.length : 0,
    getScrollElement: () => scroller.value,
    estimateSize: () => ROW_PX,
    overscan: 8,
  })),
)
const shown = computed(() =>
  virtual.value
    ? virtualizer.value
        .getVirtualItems()
        .map((v) => ({ row: visible.value[v.index], start: v.start }))
    : visible.value.map((row) => ({ row, start: 0 })),
)
const runway = computed(() => (virtual.value ? virtualizer.value.getTotalSize() : 0))

// --- detail ------------------------------------------------------------------------------------
const selected = shallowRef<Instrument | null>(null)
const selectedQuote = computed(() =>
  selected.value ? (visible.value.find((r) => r.i.id === selected.value!.id)?.quote ?? null) : null,
)
const probe = computed(() =>
  selected.value ? { id: selected.value.id, symbol: selected.value.symbol } : null,
)
function open(i: Instrument) {
  selected.value = i
}
function onRowKey(e: KeyboardEvent, i: Instrument) {
  const el = e.currentTarget as HTMLElement
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open(i)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = (
      e.key === 'ArrowDown' ? el.nextElementSibling : el.previousElementSibling
    ) as HTMLElement | null
    next?.focus()
  }
}

const range = computed(() =>
  rows.value.length ? `${offset.value + 1}–${offset.value + rows.value.length}` : '0',
)
</script>

<template>
  <div class="tp-page">
    <MarketHealth compact :probe="probe" />

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Market Explorer</span>
          <span class="tp-note" role="status">
            <template v-if="loaded">{{ total.toLocaleString() }} instruments</template>
          </span>
        </div>
      </template>

      <div class="mx__filters">
        <TextInput
          v-model="text"
          type="search"
          size="sm"
          icon="search"
          placeholder="Search symbol (server-side)"
          aria-label="Search instruments"
          class="mx__search"
        />
        <SegmentedControl v-model="kind" :options="KINDS" size="sm" aria-label="Instrument kind" />
        <Select
          v-if="typeOptions.length"
          v-model="contractTypeModel"
          :options="typeOptions"
          size="sm"
          aria-label="Contract type"
          class="mx__select"
        />
      </div>
      <p v-if="typeOptions.length" class="tp-note">
        The API filters one instrument type per request, so
        {{ KINDS.find((k) => k.value === kind)?.label }}
        shows one contract type at a time (docs/market-terminal.md §2).
      </p>

      <div class="mx__filters">
        <Select
          v-model="broker"
          :options="brokerOptions"
          size="sm"
          aria-label="Broker"
          class="mx__select"
        />
        <SegmentedControl v-model="exchange" :options="EXCHANGES" size="sm" aria-label="Exchange" />
        <Select
          v-model="segment"
          :options="segmentOptions"
          size="sm"
          aria-label="Segment"
          class="mx__select"
        />
        <span class="mx__spacer"></span>
        <Select
          v-model="pageSize"
          :options="PAGE_SIZES"
          size="sm"
          aria-label="Page size"
          class="mx__select"
        />
      </div>

      <!-- error -->
      <EmptyState v-if="error" title="The instruments could not be loaded" :description="error">
        <template #action>
          <Button size="sm" variant="secondary" :loading="loading" @click="load">Retry</Button>
        </template>
      </EmptyState>

      <!-- first load -->
      <div
        v-else-if="!loaded"
        class="mx__skeleton"
        aria-busy="true"
        aria-label="Loading instruments"
      >
        <Skeleton v-for="n in 8" :key="n" height="28px" />
      </div>

      <!-- nothing came back -->
      <EmptyState
        v-else-if="!rows.length"
        :title="q ? `No instruments match “${q}”` : 'No instruments returned'"
        :description="
          q || instrumentType
            ? 'Try a shorter symbol or another kind. If nothing ever matches, the instrument master may not be synced — its sync status is not reported yet (docs/market-terminal.md §2).'
            : 'The instrument master may not be synced: run the Dhan instrument refresh on the server. Its sync status is not reported yet, so it shows as unknown (docs/market-terminal.md §2).'
        "
      />

      <template v-else>
        <div class="mx__quotes tp-row">
          <span v-if="quotesError" class="tp-note mx__warn" role="alert">{{ quotesError }}</span>
          <span v-else-if="quotesLoading" class="tp-note">Reading quotes…</span>
          <span v-else-if="quotesAt" class="tp-note" :title="when(quotesAt)"
            >Quotes read {{ ago(quotesAt, now) }} (snapshot; live where the stream follows the
            instrument)</span
          >
          <Button size="sm" variant="ghost" :loading="quotesLoading" @click="loadQuotes()">
            Refresh quotes
          </Button>
        </div>

        <div
          ref="scroller"
          class="mx__table"
          :class="{ 'is-phone': isPhone, 'is-virtual': virtual }"
          role="table"
          aria-label="Instruments"
          :aria-rowcount="visible.length + 1"
        >
          <div v-if="!isPhone" class="mx__row mx__row--head" role="row">
            <span role="columnheader">Symbol</span>
            <span role="columnheader">Exch · segment</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">Expiry · strike · type</span>
            <span role="columnheader" class="is-num">Lot</span>
            <span role="columnheader" class="is-num">Tick</span>
            <span role="columnheader" class="is-num">Last</span>
            <span role="columnheader" class="is-num" :title="NO_CHANGE_REASON">% chg</span>
            <span role="columnheader" class="is-num">Volume</span>
            <span role="columnheader">Quote time</span>
            <span role="columnheader">Freshness</span>
          </div>
          <div
            class="mx__body"
            role="rowgroup"
            :style="virtual ? { height: `${runway}px` } : undefined"
          >
            <div
              v-for="{ row, start } in shown"
              :key="row.i.id"
              class="mx__row"
              :class="{ 'is-selected': selected?.id === row.i.id }"
              :style="virtual ? { transform: `translateY(${start}px)` } : undefined"
              role="row"
              tabindex="0"
              :aria-label="`${row.i.symbol}, open details`"
              @click="open(row.i)"
              @keydown="onRowKey($event, row.i)"
            >
              <template v-if="!isPhone">
                <span role="cell" class="mx__sym">{{ row.i.symbol }}</span>
                <span role="cell"
                  >{{ exchangeOf(row.i) ?? '—' }} · {{ segmentOf(row.i) ?? '—' }}</span
                >
                <span role="cell" :title="row.i.instrument_type">{{
                  KIND_LABEL[kindOf(row.i)]
                }}</span>
                <span role="cell">{{ contract(row.i) }}</span>
                <span role="cell" class="is-num">{{ dec(row.i.lot_size) }}</span>
                <span role="cell" class="is-num">{{ dec(row.i.tick_size) }}</span>
                <span role="cell" class="is-num">{{ dec(row.quote?.last) }}</span>
                <span role="cell" class="is-num" :title="changeText(row).title">{{
                  changeText(row).text
                }}</span>
                <span role="cell" class="is-num">{{ dec(row.quote?.volume) }}</span>
                <span role="cell" :title="row.quote ? when(row.quote.at) : 'No quote'">{{
                  row.quote ? ago(row.quote.at, now) : '—'
                }}</span>
                <span role="cell">
                  <Badge
                    v-if="row.quote"
                    :tone="row.quote.freshness.tone"
                    :label="row.quote.freshness.label"
                    :title="row.quote.freshness.text"
                  />
                  <span v-else class="tp-note">No quote</span>
                </span>
              </template>
              <template v-else>
                <span role="cell" class="mx__phone-main">
                  <span class="mx__sym">{{ row.i.symbol }}</span>
                  <span class="tp-note"
                    >{{ exchangeOf(row.i) ?? segmentOf(row.i) ?? '—' }} ·
                    {{ KIND_LABEL[kindOf(row.i)]
                    }}<template v-if="contract(row.i) !== '—'"> · {{ contract(row.i) }}</template> ·
                    lot {{ dec(row.i.lot_size) }}</span
                  >
                </span>
                <span role="cell" class="mx__phone-side">
                  <span class="tp-num">{{ dec(row.quote?.last) }}</span>
                  <Badge
                    v-if="row.quote"
                    :tone="row.quote.freshness.tone"
                    :label="row.quote.freshness.label"
                    :title="row.quote.freshness.text"
                  />
                  <span v-else class="tp-note">No quote</span>
                </span>
              </template>
            </div>
          </div>
        </div>

        <div class="tp-head mx__pager">
          <span class="tp-note">Rows {{ range }} of {{ total.toLocaleString() }}</span>
          <Pagination v-model:page="page" :page-count="pageCount" />
        </div>
      </template>
    </Card>

    <MarketPanel :open="!!selected" :title="selected?.symbol ?? ''" @close="selected = null">
      <InstrumentDetail v-if="selected" :instrument="selected" :quote="selectedQuote" />
    </MarketPanel>
  </div>
</template>

<style scoped>
.mx__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.mx__search {
  flex: 1 1 220px;
  min-width: 0;
}
.mx__select {
  flex: 0 1 180px;
  min-width: 0;
}
.mx__spacer {
  flex: 1 1 0;
}
.mx__warn {
  color: var(--theme-warning);
}
.mx__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.mx__quotes {
  justify-content: space-between;
}
.mx__table {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}
.mx__table.is-virtual {
  max-height: 70vh;
  overflow-y: auto;
}
.mx__body {
  position: relative;
}
.mx__row {
  display: grid;
  grid-template-columns:
    minmax(140px, 1.6fr) minmax(110px, 1fr) minmax(64px, 0.6fr) minmax(130px, 1.2fr)
    minmax(48px, 0.5fr) minmax(48px, 0.5fr) minmax(72px, 0.8fr) minmax(56px, 0.6fr)
    minmax(72px, 0.8fr) minmax(72px, 0.7fr) minmax(96px, 0.9fr);
  align-items: center;
  gap: var(--sp-2);
  min-width: 1040px;
  min-height: 44px;
  padding: var(--sp-1) var(--sp-3);
  border-bottom: 1px solid var(--glass-border);
  font-size: var(--text-xs);
  color: var(--theme-text);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.mx__table.is-virtual .mx__body .mx__row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
}
.mx__row > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mx__row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 32px;
  background: var(--glass-solid);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
  cursor: default;
}
.mx__row:not(.mx__row--head):hover {
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
}
.mx__row:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.mx__row.is-selected {
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}
.mx__body .mx__row:last-child {
  border-bottom: 0;
}
.is-num {
  text-align: right;
}
.mx__sym {
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
}
.mx__table.is-phone .mx__row {
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 52px;
}
.mx__phone-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mx__phone-main > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mx__phone-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.mx__pager {
  padding-top: var(--sp-2);
}
@media (pointer: coarse) {
  .mx__row:not(.mx__row--head) {
    min-height: 48px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mx__row {
    transition: none;
  }
}
</style>

<script setup lang="ts">
// Explore, in the Stocks tab's own language: one search over every instrument
// the server has, a few plain filters, and results drawn as the same rows the
// watchlist uses (price, today's move, a month's trend) with a "+" that puts
// one on your open list. Picking a result opens the same stock page.
//
// The broker terminal's explorer (every column, segments, page sizes) stays on
// the trading page, where it belongs.
import { computed, ref, watch } from 'vue'
import TextInput from '@/components/ui/TextInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StockRow from '@/components/stocks/StockRow.vue'
import { useWatchlistRows, type StockRowData } from '@/trading/useWatchlistRows'
import {
  searchInstruments,
  TYPES_BY_KIND,
  type Exchange,
  type Instrument,
  type Kind,
} from '@/trading/instruments'
import { remember } from '@/trading/resolve'
import { ApiFailure } from '@/trading/useLoad'
import type { WatchlistItem } from '@/trading/watchlists'
import type { Stock } from '@/types'
import type { Ref } from 'vue'

const props = defineProps<{
  now: number
  listName: string
  listedIds: ReadonlySet<number>
  selectedId: number | null
  compact: boolean
  trackedOf: (symbol: string) => Stock | null
}>()
const emit = defineEmits<{
  add: [Instrument]
  select: [id: number | null]
  /** The selected result, kept current as its price moves (the stock page reads it). */
  row: [StockRowData | null]
}>()

// --- the query -------------------------------------------------------------------------
type KindFilter = 'equity' | 'index' | 'future' | 'option' | 'all'
const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'equity', label: 'Stocks' },
  { value: 'index', label: 'Indices' },
  { value: 'future', label: 'Futures' },
  { value: 'option', label: 'Options' },
  { value: 'all', label: 'All' },
]
// The API takes one instrument type per request; for futures and options the
// reader picks which, in words.
const CONTRACT_LABEL: Record<string, string> = {
  FUTIDX: 'Index futures',
  FUTSTK: 'Stock futures',
  FUTCOM: 'Commodity futures',
  FUTCUR: 'Currency futures',
  OPTIDX: 'Index options',
  OPTSTK: 'Stock options',
  OPTFUT: 'Commodity options',
  OPTCUR: 'Currency options',
}
type ExchangeFilter = 'all' | Exchange
const EXCHANGES: { value: ExchangeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'NSE', label: 'NSE' },
  { value: 'BSE', label: 'BSE' },
]
const PAGE = 30

const text = ref('')
const q = ref('')
const kind = ref<KindFilter>('equity')
const exchange = ref<ExchangeFilter>('NSE')
const contract = ref<Record<'future' | 'option', string>>({
  future: TYPES_BY_KIND.future[0]!,
  option: TYPES_BY_KIND.option[0]!,
})
const contractOptions = computed(() =>
  kind.value === 'future' || kind.value === 'option'
    ? TYPES_BY_KIND[kind.value].map((t) => ({ value: t, label: CONTRACT_LABEL[t] ?? t }))
    : [],
)
const contractModel = computed({
  get: () => (kind.value === 'future' || kind.value === 'option' ? contract.value[kind.value] : ''),
  set: (v: string) => {
    if (kind.value === 'future' || kind.value === 'option')
      contract.value = { ...contract.value, [kind.value]: v }
  },
})
const instrumentType = computed(() =>
  kind.value === 'all'
    ? undefined
    : kind.value === 'future' || kind.value === 'option'
      ? contract.value[kind.value]
      : TYPES_BY_KIND[kind.value as Exclude<Kind, 'other' | 'future' | 'option'>][0],
)

let debounce: ReturnType<typeof setTimeout> | undefined
watch(text, (t) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (q.value = t.trim()), 300)
})

// --- the results ---------------------------------------------------------------------------
const found = ref<Instrument[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
let seq = 0
async function load(append = false) {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const page = await searchInstruments({
      q: q.value || undefined,
      instrumentType: instrumentType.value,
      exchange: exchange.value === 'all' ? undefined : exchange.value,
      limit: PAGE,
      offset: append ? found.value.length : 0,
    })
    if (mine !== seq) return
    remember(page.items)
    found.value = append ? [...found.value, ...page.items] : page.items
    total.value = page.total
  } catch (e) {
    if (mine !== seq) return
    error.value =
      e instanceof ApiFailure ? e.message : 'The search could not be reached. Check the connection.'
    if (!append) found.value = []
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch([q, instrumentType, exchange], () => void load(), { immediate: true })

// The same rows as the watchlist. Daily history (trend and change) for the first
// screenful only: one candle read per result would be a burst at the broker.
const items = computed<WatchlistItem[]>(() =>
  found.value.map((i) => ({ id: i.id, symbol: i.symbol, broker: i.broker, added_at: '' })),
)
const { rows } = useWatchlistRows(() => items.value, computed(() => props.now) as Ref<number>, {
  historyFor: PAGE,
})
watch(
  () => rows.value.find((r) => r.item.id === props.selectedId) ?? null,
  (r) => emit('row', r),
  { immediate: true },
)
const byId = computed(() => new Map(found.value.map((i) => [i.id, i])))
</script>

<template>
  <div class="sx">
    <div class="sx__controls">
      <TextInput
        v-model="text"
        type="search"
        size="md"
        icon="search"
        :placeholder="
          compact
            ? 'Search name or symbol'
            : 'Search every stock, index and contract by name or symbol'
        "
        aria-label="Search instruments"
        clearable
      />
      <div class="sx__filters">
        <SegmentedControl v-model="kind" :options="KINDS" size="sm" aria-label="What to show" />
        <SegmentedControl v-model="exchange" :options="EXCHANGES" size="sm" aria-label="Exchange" />
        <Select
          v-if="contractOptions.length"
          v-model="contractModel"
          class="sx__contract"
          :options="contractOptions"
          size="sm"
          aria-label="Contract type"
        />
      </div>
    </div>

    <div class="sx__scroll">
      <p v-if="!error && found.length" class="sx__count" role="status">
        {{ total.toLocaleString() }} {{ total === 1 ? 'result' : 'results'
        }}<template v-if="q"> for “{{ q }}”</template>
      </p>

      <EmptyState v-if="error" glyph="⚠️" title="The search could not be run" :description="error">
        <template #action>
          <Button size="sm" variant="secondary" @click="load()">Try again</Button>
        </template>
      </EmptyState>
      <Skeleton
        v-else-if="loading && !found.length"
        :lines="6"
        height="56px"
        radius="var(--radius-card)"
      />
      <EmptyState
        v-else-if="!found.length"
        glyph="🔍"
        :title="q ? `Nothing matches “${q}”` : 'Nothing to show'"
        description="Try a shorter name or symbol, another exchange, or All."
      />
      <div v-else class="sx__rows">
        <StockRow
          v-for="r in rows"
          :key="r.item.id"
          :row="r"
          :tracked="trackedOf(r.item.symbol)"
          :selected="!compact && selectedId === r.item.id"
          :compact="compact"
          explore
          :listed="listedIds.has(r.item.id)"
          @open="emit('select', r.item.id)"
          @add="byId.get(r.item.id) && emit('add', byId.get(r.item.id)!)"
        />
        <Button
          v-if="found.length < total"
          class="sx__more"
          size="sm"
          variant="secondary"
          :loading="loading"
          @click="load(true)"
        >
          Show more ({{ (total - found.length).toLocaleString() }} left)
        </Button>
      </div>
      <p class="sx__note">
        Prices are the broker's; today's move and the trend are shown for the first
        {{ PAGE }} results.
      </p>
    </div>
  </div>
</template>

<style scoped>
.sx {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.sx__controls {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: 2px 10px 0;
}
.sx__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.sx__contract {
  flex: 0 1 200px;
  min-width: 0;
}
.sx__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 10px 18px;
}
.sx__count {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.sx__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.sx__more {
  align-self: center;
  margin-top: var(--sp-2);
}
.sx__note {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  text-align: center;
}
</style>

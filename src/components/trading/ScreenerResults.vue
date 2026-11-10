<script setup lang="ts">
// The screener's results table: one row per `ScreenerItem` (docs/market-terminal.md §6).
//
// It renders only what the server sent. A field the server left null shows "—";
// nothing is estimated. `change_pct` is shown as the percent the server computed
// (the contract names it a percent, not a 0..1 ratio). Each row opens the chart
// at the screened timeframe and can be added to a watchlist on this device.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import Table from '@/components/ui/Table.vue'
import { dec, signed, ago, when } from '@/trading/format'
import { describe, exchangeOf, segmentOf } from '@/trading/instruments'
import {
  SIGNAL_LABEL,
  indicatorLabel,
  type ScreenerItem,
  type ScreenerResponse,
} from '@/trading/screener'
import { chartPath } from '@/trading/sections'
import { watchlistStore } from '@/trading/watchlists'

const props = defineProps<{ response: ScreenerResponse }>()

const store = watchlistStore()
const NEW_LIST = '__new__'
const status = ref('')

const columns = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'exchange', label: 'Exchange' },
  { key: 'last', label: 'Price', align: 'right' as const },
  { key: 'change', label: '% change', align: 'right' as const },
  { key: 'timeframe', label: 'TF' },
  { key: 'indicators', label: 'Indicators' },
  { key: 'signal', label: 'Signal' },
  { key: 'crossed', label: 'Crossed at' },
  { key: 'fresh', label: 'Data as of' },
  { key: 'actions', label: 'Actions' },
]

const rows = computed(() =>
  props.response.items.map((it) => ({
    id: it.instrument.id,
    item: it,
    symbol: it.instrument.symbol,
    describe: describe(it.instrument),
    exchange: exchangeOf(it.instrument) ?? segmentOf(it.instrument) ?? '—',
    last: dec(it.last, 2),
    change:
      it.change_pct === null || it.change_pct === undefined ? '—' : `${signed(it.change_pct, 2)}%`,
    changeTone: tone(it.change_pct),
    timeframe: props.response.timeframe,
    indicators: Object.entries(it.indicators ?? {}).map(([k, v]) => ({
      key: k,
      label: indicatorLabel(k),
      value: dec(v, 2),
    })),
    signal: it.signal ? SIGNAL_LABEL[it.signal] : '—',
    signalTone: signalTone(it.signal),
    crossed: when(it.crossed_at),
    fresh: it.data_as_of ? ago(it.data_as_of) : '—',
    freshTitle: when(it.data_as_of),
    chart: chartPath(it.instrument.id, props.response.timeframe),
  })),
)

type Ind = { key: string; label: string; value: string }
const inds = (row: Record<string, unknown>) => row.indicators as Ind[]

function tone(v: string | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  if (!/[1-9]/.test(s)) return ''
  return s.startsWith('-') ? 'sr__neg' : 'sr__pos'
}
function signalTone(s: ScreenerItem['signal']): 'success' | 'danger' | 'neutral' {
  if (s === 'bullish_cross' || s === 'above') return 'success'
  if (s === 'bearish_cross' || s === 'below') return 'danger'
  return 'neutral'
}

const menu = computed(() => [
  ...store.lists.map((l) => ({ value: l.id, label: `Add to ${l.name}` })),
  { value: NEW_LIST, label: 'Add to a new list “Screener”' },
])

function addTo(listId: string, it: ScreenerItem) {
  try {
    const id = listId === NEW_LIST ? store.create('Screener').id : listId
    const list = store.lists.find((l) => l.id === id)
    const already = list?.items.some((x) => x.id === it.instrument.id)
    store.add(id, {
      id: it.instrument.id,
      symbol: it.instrument.symbol,
      broker: it.instrument.broker,
    })
    status.value = already
      ? `${it.instrument.symbol} is already on ${list?.name}.`
      : `Added ${it.instrument.symbol} to ${list?.name}. Saved on this device only.`
  } catch (e) {
    status.value = (e as Error).message
  }
}
</script>

<template>
  <div class="sr">
    <Table :columns="columns" :rows="rows" caption="Screener results">
      <template #cell-symbol="{ row }">
        <div class="sr__sym">
          <span class="tp-strong">{{ row.symbol }}</span>
          <span class="tp-note">{{ row.describe }}</span>
        </div>
      </template>
      <template #cell-last="{ row }"
        ><span class="tp-num">{{ row.last }}</span></template
      >
      <template #cell-change="{ row }">
        <span class="tp-num" :class="row.changeTone as string">{{ row.change }}</span>
      </template>
      <template #cell-indicators="{ row }">
        <ul v-if="inds(row).length" class="sr__ind">
          <li v-for="i in inds(row)" :key="i.key">
            <span class="tp-note">{{ i.label }}</span>
            <span class="tp-num">{{ i.value }}</span>
          </li>
        </ul>
        <span v-else>—</span>
      </template>
      <template #cell-signal="{ row }">
        <Badge
          v-if="row.signal !== '—'"
          :tone="row.signalTone as 'success'"
          :label="row.signal as string"
        />
        <span v-else>—</span>
      </template>
      <template #cell-fresh="{ row }">
        <span :title="row.freshTitle as string">{{ row.fresh }}</span>
      </template>
      <template #cell-actions="{ row }">
        <div class="sr__actions">
          <RouterLink
            class="sr__link ui-focus-ring"
            :to="row.chart as string"
            :aria-label="`Open chart for ${row.symbol}`"
            >Open chart</RouterLink
          >
          <Dropdown
            :items="menu"
            label="Add to watchlist"
            @select="(v: string) => addTo(v, row.item as ScreenerItem)"
          />
        </div>
      </template>
    </Table>
    <p class="tp-note" role="status" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style scoped>
.sr {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.sr__sym {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sr__ind {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: auto auto;
  column-gap: var(--sp-2);
  min-width: 0;
}
.sr__ind li {
  display: contents;
}
.sr__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.sr__link {
  display: inline-flex;
  align-items: center;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-md);
  color: var(--theme-accent);
  font-size: var(--text-sm);
  text-decoration: none;
  white-space: nowrap;
}
.sr__link:hover {
  text-decoration: underline;
}
.sr__pos {
  color: var(--theme-success);
}
.sr__neg {
  color: var(--theme-danger);
}
@media (pointer: coarse) {
  .sr__link {
    min-height: 44px;
  }
}
</style>

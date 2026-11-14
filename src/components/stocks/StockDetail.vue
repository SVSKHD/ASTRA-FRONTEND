<script setup lang="ts">
// One stock, the way a person reads it: the price and how far it moved today,
// a chart with a choice of range, YOUR thesis and targets for it, and the few
// facts worth knowing. Broker plumbing (security ids, references) stays on the
// trading page's instrument view, one click away.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Chip from '@/components/ui/Chip.vue'
import StockChart from '@/components/stocks/StockChart.vue'
import { dec, ago } from '@/trading/format'
import { chartPath } from '@/trading/sections'
import type { StockRowData } from '@/trading/useWatchlistRows'
import type { Stock } from '@/types'

const props = withDefaults(
  defineProps<{
    row: StockRowData
    tracked: Stock | null
    now: number
    /** On the open list: Remove. Not (Explore): Add to it. */
    listed?: boolean
    listName?: string
  }>(),
  { listed: true, listName: '' },
)
const emit = defineEmits<{ remove: []; add: [] }>()
const app = useAppStore()
const router = useRouter()

const name = computed(
  () => props.row.instrument?.display_name || props.row.instrument?.name || props.row.item.symbol,
)
const exchange = computed(() => props.row.instrument?.exchange || '')
const last = computed(() => props.row.quote?.last ?? null)

// --- your thesis -----------------------------------------------------------------
// Distance from the price to a level, as a signed percent of the price.
function away(level: number): string {
  const p = Number(last.value)
  if (!level || !Number.isFinite(p) || !p) return ''
  const pct = ((level - p) / p) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}
function addThesis() {
  app.openCreate('stock')
  app.setDialogDraft('symbol', props.row.item.symbol)
  app.setDialogDraft('name', name.value)
}

const facts = computed(() => {
  const i = props.row.instrument
  const q = props.row.quote
  return [
    ['Exchange', exchange.value || '—'],
    ['ISIN', i?.isin || '—'],
    ['Volume', q?.volume ? dec(q.volume, 0) : '—'],
    ['Bid / Ask', q?.bid || q?.ask ? `${dec(q?.bid)} / ${dec(q?.ask)}` : '—'],
    ['Lot size', i ? dec(i.lot_size) : '—'],
    ['Tick size', i ? dec(i.tick_size) : '—'],
  ] as const
})
</script>

<template>
  <div class="sd">
    <section class="sd__hero">
      <div class="sd__id">
        <span class="sd__tile" aria-hidden="true">{{ row.item.symbol.slice(0, 2) }}</span>
        <div class="sd__names">
          <h2 class="sd__symbol">{{ row.item.symbol }}</h2>
          <span class="sd__name"
            >{{ name }}<template v-if="exchange"> · {{ exchange }}</template></span
          >
        </div>
      </div>

      <div v-if="last" class="sd__price">
        <span class="sd__last">₹{{ dec(last, 2) }}</span>
        <span v-if="row.change" class="sd__change" :class="row.change.up ? 'is-up' : 'is-down'">
          <Icon :name="row.change.up ? 'trending-up' : 'trending-down'" size="sm" />
          {{ row.change.up ? '+' : '' }}{{ dec(row.change.change, 2) }} ({{
            row.change.up ? '+' : ''
          }}{{ row.change.pct }}%) today
        </span>
      </div>
      <div v-else class="sd__noprice">
        <Icon name="circle-slash" size="md" />
        <div>
          <strong>No price right now</strong>
          <span>{{
            row.flag?.text ?? 'The broker has not sent a price for it yet. It may not be trading.'
          }}</span>
        </div>
      </div>
      <span
        v-if="row.quote && last"
        class="sd__fresh"
        :class="row.quote.source === 'stream' ? 'is-live' : ''"
      >
        <span class="sd__dot" />
        <template v-if="row.quote.source === 'stream'">Live</template>
        <template v-else>Price from {{ ago(row.quote.at, now) }}</template>
      </span>
      <p v-if="row.flag && row.flag.tone !== 'neutral'" class="sd__flag">{{ row.flag.text }}</p>
    </section>

    <StockChart
      :instrument-id="row.item.id"
      :symbol="row.item.symbol"
      :ltp="row.quote?.last ?? null"
      :ltp-at="row.quote?.at ?? null"
      :streaming="row.quote?.source === 'stream'"
      :now="now"
    />

    <section class="sd__card" aria-label="Your thesis">
      <div class="sd__cardHead">
        <span class="sd__label">Your thesis</span>
        <Button v-if="tracked" size="sm" variant="ghost" @click="app.openEdit('stock', tracked.id)">
          <Icon name="pencil" size="sm" />Edit
        </Button>
      </div>
      <template v-if="tracked">
        <p v-if="tracked.why" class="sd__why">{{ tracked.why }}</p>
        <div class="sd__levels">
          <div v-if="tracked.targetPrice" class="sd__level">
            <span class="sd__levelLabel">Target</span>
            <span class="sd__levelValue">₹{{ dec(tracked.targetPrice, 2) }}</span>
            <span class="sd__levelAway">{{ away(tracked.targetPrice) }}</span>
          </div>
          <div v-if="tracked.watchPrice" class="sd__level">
            <span class="sd__levelLabel">Watch at</span>
            <span class="sd__levelValue">₹{{ dec(tracked.watchPrice, 2) }}</span>
            <span class="sd__levelAway">{{ away(tracked.watchPrice) }}</span>
          </div>
        </div>
        <Chip v-if="tracked.tag" size="sm" :label="tracked.tag" />
      </template>
      <div v-else class="sd__empty">
        <p class="sd__muted">
          Why are you watching it? Note a thesis, a target and a price to act at.
        </p>
        <Button size="sm" variant="secondary" @click="addThesis">
          <Icon name="plus" size="sm" />Add a thesis
        </Button>
      </div>
    </section>

    <section class="sd__card" aria-label="Key facts">
      <span class="sd__label">Key facts</span>
      <dl class="sd__facts">
        <template v-for="[k, v] in facts" :key="k">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>
    </section>

    <div class="sd__actions">
      <Button size="sm" variant="secondary" @click="router.push(chartPath(row.item.id))">
        <Icon name="chart-candlestick" size="sm" />Full chart
      </Button>
      <Button v-if="listed" size="sm" variant="ghost" class="sd__remove" @click="emit('remove')">
        <Icon name="trash" size="sm" />Remove from list
      </Button>
      <Button v-else size="sm" @click="emit('add')">
        <Icon name="plus" size="sm" />Add to {{ listName || 'a watchlist' }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.sd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
  /* The page scrolls inside its pane (as the todo pane does), never past it. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 4px 12px 2px;
}
.sd__noprice {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-dim) 10%, transparent);
  color: var(--theme-dim);
}
.sd__noprice div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sd__noprice strong {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.sd__noprice span {
  font-size: var(--text-sm);
}
.sd__hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.sd__id {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.sd__tile {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-accent);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.02em;
}
.sd__names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sd__symbol {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.sd__name {
  font-size: var(--text-sm);
  color: var(--theme-dim);
  min-width: 0;
  overflow-wrap: anywhere;
}
.sd__price {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}
.sd__last {
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
}
.sd__change {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
}
.sd__change.is-up {
  color: var(--theme-success);
}
.sd__change.is-down {
  color: var(--theme-danger);
}
.sd__fresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.sd__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-dim);
}
.sd__fresh.is-live .sd__dot {
  background: var(--theme-success);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-success) 25%, transparent);
}
.sd__flag {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-warning);
}
.sd__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  min-width: 0;
}
.sd__cardHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sd__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.sd__why {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.5;
  color: var(--theme-text);
}
.sd__levels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--sp-2);
}
.sd__level {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-accent) 7%, transparent);
}
.sd__levelLabel {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.sd__levelValue {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
}
.sd__levelAway {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--theme-accent);
}
.sd__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
}
.sd__muted {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.sd__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2) var(--sp-4);
  margin: 0;
}
.sd__facts dt {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.sd__facts dd {
  margin: 0 0 var(--sp-1);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
  overflow-wrap: anywhere;
  min-width: 0;
}
.sd__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.sd__actions :deep(.ui-icon),
.sd__card :deep(.ui-btn .ui-icon) {
  margin-right: 6px;
}
.sd__remove {
  color: var(--theme-danger);
}
</style>

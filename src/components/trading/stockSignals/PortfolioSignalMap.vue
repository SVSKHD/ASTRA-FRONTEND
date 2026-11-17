<script setup lang="ts">
// Portfolio Map: your Dhan holdings as tiles sized by allocation and coloured by
// their EMA 8 / 32 + VWAP signal (green bullish, red bearish, amber pending or
// mixed, grey with no fresh data), candidates from the screener that are not
// held, and a rebalance PREVIEW (current vs proposed weights, whole shares,
// cash). Nothing here places, proposes or queues an order.
import { computed, reactive, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Alert from '@/components/ui/Alert.vue'
import SignalBadge from './SignalBadge.vue'
import { dec, signed } from '@/trading/format'
import type { Timeframe } from '@/trading/chartView'
import { isStaleAt } from '@/trading/stockSignals/classify'
import {
  CONCENTRATION,
  concentrated,
  rebalance,
  toneOf,
  type HoldingView,
} from '@/trading/stockSignals/portfolio'
import type { RowData, UniverseItem } from '@/trading/stockSignals/useStockSignals'

const props = defineProps<{
  held: readonly { item: UniverseItem; view: HoldingView }[]
  candidates: readonly UniverseItem[]
  rows: Readonly<Record<number, RowData>>
  tf: Timeframe
  now: number
  loading: boolean
}>()
const emit = defineEmits<{ chart: [UniverseItem] }>()

const views = computed(() => props.held.map((h) => h.view))
const heavy = computed(() => concentrated(views.value))
const totalValue = computed(() => views.value.reduce((a, v) => a + v.value, 0))
const totalPnl = computed(() => views.value.reduce((a, v) => a + (v.pnl ?? 0), 0))

function reading(item: UniverseItem) {
  return props.rows[item.instrument.id]?.reading ?? null
}
function tone(item: UniverseItem) {
  const r = reading(item)
  return toneOf(r?.cls, r ? isStaleAt(r.asOf, props.tf, props.now) : true)
}
function vwapText(item: UniverseItem) {
  const r = reading(item)
  if (!r || !r.usesVwap) return 'VWAP n/a'
  if (r.vwapDistPct === null) return 'VWAP —'
  return `${r.vwapDistPct >= 0 ? 'Above' : 'Below'} VWAP`
}

// --- rebalance preview -------------------------------------------------------------------
const proposed = reactive<Record<string, number | null>>({})
const extra = ref<UniverseItem[]>([])
function pct(symbol: string, current: number) {
  return proposed[symbol] ?? Math.round(current * 1000) / 10
}
function addCandidate(c: UniverseItem) {
  if (!extra.value.some((x) => x.instrument.id === c.instrument.id))
    extra.value = [...extra.value, c]
  proposed[c.instrument.symbol] ??= 0
}
function reset() {
  for (const k of Object.keys(proposed)) delete proposed[k]
  extra.value = []
}
const preview = computed(() => {
  const target: Record<string, number> = {}
  for (const [k, v] of Object.entries(proposed)) if (v !== null) target[k] = v / 100
  const prices: Record<string, number | null> = {}
  for (const c of extra.value) prices[c.instrument.symbol] = reading(c)?.close ?? null
  return rebalance(views.value, target, prices)
})
const changed = computed(() => Object.keys(proposed).length > 0)
</script>

<template>
  <div class="pm">
    <EmptyState
      v-if="!loading && !held.length"
      glyph="💼"
      title="No Dhan holdings to map"
      description="Once your Dhan account reports holdings, each one shows here sized by its share of the portfolio and coloured by its signal."
    />
    <template v-else>
      <section class="pm__card">
        <header class="pm__head">
          <h3 class="pm__title">Holdings by signal</h3>
          <span class="pm__sum tp-num">
            Value {{ dec(totalValue, 0) }} · P&amp;L
            <span :class="totalPnl >= 0 ? 'is-up' : 'is-down'">{{ signed(totalPnl, 0) }}</span>
          </span>
          <span class="pm__legend" aria-hidden="true">
            <i class="t-bull" />Bullish <i class="t-bear" />Bearish <i class="t-amber" />Pending /
            mixed <i class="t-neutral" />No fresh data
          </span>
        </header>
        <Alert v-if="heavy.length" tone="warning" title="Concentration">
          {{ heavy.map((h) => `${h.symbol} ${(h.weight * 100).toFixed(0)}%`).join(', ') }}
          {{ heavy.length === 1 ? 'is' : 'are' }} over {{ CONCENTRATION * 100 }}% of the portfolio.
        </Alert>
        <div class="pm__map" role="list">
          <button
            v-for="h in held"
            :key="h.item.instrument.id"
            type="button"
            role="listitem"
            class="pm__tile"
            :class="`t-${tone(h.item)}`"
            :style="{ flexGrow: Math.max(1, Math.round(h.view.weight * 100)) }"
            :aria-label="`${h.view.symbol}, ${(h.view.weight * 100).toFixed(1)}% of holdings, ${reading(h.item)?.cls ?? 'no data'}. Open chart.`"
            @click="emit('chart', h.item)"
          >
            <span class="pm__sym">{{ h.view.symbol }}</span>
            <span class="pm__w tp-num">{{ (h.view.weight * 100).toFixed(1) }}%</span>
            <span v-if="h.view.pnl !== null" class="pm__pnl tp-num"
              >{{ signed(h.view.pnl, 0) }} ({{ signed(h.view.pnlPct, 1) }}%)</span
            >
            <span class="pm__meta">
              <template v-if="reading(h.item)?.trend">
                EMA {{ reading(h.item)!.trend === 'up' ? '▲' : '▼' }}
              </template>
              · {{ vwapText(h.item) }}
            </span>
            <SignalBadge :cls="reading(h.item)?.cls ?? 'unavailable'" />
          </button>
        </div>
      </section>

      <div class="pm__grid">
        <section class="pm__card">
          <header class="pm__head">
            <h3 class="pm__title">Candidates</h3>
            <span class="pm__sum"
              >Screener crosses you do not hold, bullish and confirmed first</span
            >
          </header>
          <ul v-if="candidates.length" class="pm__cands">
            <li v-for="c in candidates" :key="c.instrument.id" class="pm__cand">
              <span class="pm__candId">
                <b>{{ c.instrument.symbol }}</b>
                <SignalBadge :cls="reading(c)?.cls ?? 'unavailable'" />
              </span>
              <span class="tp-num pm__dim">
                {{ reading(c)?.close != null ? dec(reading(c)!.close, 2) : '—' }} · strength
                {{ reading(c)?.strength ?? '—' }}
              </span>
              <span class="pm__candActs">
                <Button size="sm" variant="ghost" @click="emit('chart', c)">
                  <Icon name="chart-candlestick" size="sm" />Chart
                </Button>
                <Button size="sm" variant="secondary" @click="addCandidate(c)"
                  >Add to preview</Button
                >
              </span>
            </li>
          </ul>
          <p v-else class="pm__dim">No screener candidates right now.</p>
        </section>

        <section class="pm__card" aria-label="Rebalance preview">
          <header class="pm__head">
            <h3 class="pm__title">Rebalance preview</h3>
            <Button v-if="changed" size="sm" variant="ghost" @click="reset">Reset</Button>
          </header>
          <p class="pm__note">
            A preview to think with. Set a target weight; nothing is ordered, proposed or queued.
          </p>
          <div class="pm__tableWrap">
            <table class="pm__table tp-num">
              <thead>
                <tr>
                  <th scope="col">Stock</th>
                  <th scope="col">Now</th>
                  <th scope="col">Target %</th>
                  <th scope="col">Shares</th>
                  <th scope="col">Cash</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in preview.lines" :key="l.symbol">
                  <th scope="row">{{ l.symbol }}</th>
                  <td>{{ (l.current * 100).toFixed(1) }}%</td>
                  <td>
                    <NumberInput
                      size="sm"
                      class="pm__num"
                      :min="0"
                      :max="100"
                      :step="0.5"
                      :model-value="pct(l.symbol, l.current)"
                      :aria-label="`Target weight for ${l.symbol}`"
                      @update:model-value="(v: number | null) => (proposed[l.symbol] = v)"
                    />
                  </td>
                  <td :class="(l.shares ?? 0) > 0 ? 'is-up' : (l.shares ?? 0) < 0 ? 'is-down' : ''">
                    {{
                      l.shares === null ? 'no price' : l.shares === 0 ? '—' : signed(l.shares, 0)
                    }}
                  </td>
                  <td>{{ l.cash === null || l.cash === 0 ? '—' : signed(l.cash, 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="pm__totals tp-num">
            <span>
              Cash {{ preview.cashNeeded >= 0 ? 'needed' : 'freed' }}
              <b>{{ dec(Math.abs(preview.cashNeeded), 0) }}</b>
            </span>
            <span
              v-if="Math.abs(preview.unallocated) > 0.001"
              :class="preview.unallocated < 0 ? 'is-down' : ''"
            >
              {{ preview.unallocated < 0 ? 'Over' : 'Unallocated' }}
              {{ (Math.abs(preview.unallocated) * 100).toFixed(1) }}%
            </span>
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pm {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.pm__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
  min-width: 0;
}
.pm__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-1) var(--sp-3);
}
.pm__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.pm__sum,
.pm__dim,
.pm__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.pm__legend {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin-left: auto;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.pm__legend i {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-left: 6px;
  border-radius: 2px;
  background: var(--tile);
}
.t-bull {
  --tile: var(--theme-success);
}
.t-bear {
  --tile: var(--theme-danger);
}
.t-amber {
  --tile: var(--theme-warning);
}
.t-neutral {
  --tile: var(--theme-dim);
}
.pm__map {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pm__tile {
  flex-basis: 130px;
  min-height: 104px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in oklch, var(--tile) 45%, var(--theme-border));
  background: color-mix(in oklch, var(--tile) 16%, var(--theme-card));
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.pm__tile:hover {
  background: color-mix(in oklch, var(--tile) 24%, var(--theme-card));
}
.pm__tile:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.pm__sym {
  font-weight: var(--weight-semibold);
}
.pm__w {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
}
.pm__pnl,
.pm__meta {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.pm__tile :deep(.sb) {
  margin-top: auto;
}
.pm__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--sp-3);
}
.pm__cands {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.pm__cand {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1) var(--sp-3);
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--theme-border);
}
.pm__candId {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.pm__candActs {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}
.pm__candActs :deep(.ui-icon) {
  margin-right: 4px;
}
.pm__tableWrap {
  overflow-x: auto;
}
.pm__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.pm__table th,
.pm__table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--theme-border);
  text-align: right;
  white-space: nowrap;
}
.pm__table th:first-child {
  text-align: left;
}
.pm__table thead th {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-dim);
}
.pm__num {
  width: 100px;
  margin-left: auto;
}
.pm__totals {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.is-up {
  color: var(--theme-success);
}
.is-down {
  color: var(--theme-danger);
}
</style>

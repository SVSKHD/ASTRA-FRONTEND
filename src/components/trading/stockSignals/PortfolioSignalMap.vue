<script setup lang="ts">
// Portfolio Map (docs/37 §6): your Dhan holdings from the latest snapshot as
// tiles sized by allocation and coloured by the engine's signal (green bullish,
// red bearish, amber awaiting VWAP or mixed, grey with no usable signal), each
// with P&L, EMA and VWAP state and the advisory class; candidates the engine
// ranks bullish that you do not hold; and the server's rebalance PREVIEW (trims,
// whole-share buys, charges, cash before / after). Nothing here places,
// proposes or queues an order; the server creates no intent either.
import { computed, reactive, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import FormField from '@/components/ui/FormField.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SignalNotice from './SignalNotice.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SignalBadge from './SignalBadge.vue'
import { dec, signed, ago } from '@/trading/format'
import {
  CLASS_LABEL,
  STATE_BUCKET,
  num,
  previewRebalance,
  type PortfolioHolding,
  type PortfolioMap,
  type RebalancePreview,
  type SignalState,
  type SignalTf,
  type StateRow,
} from '@/trading/stockSignals/api'

const props = defineProps<{
  map: PortfolioMap | null
  candidates: readonly StateRow[]
  tf: SignalTf
  now: number
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ chart: [PortfolioHolding]; candidate: [StateRow] }>()

function tone(h: PortfolioHolding): string {
  const s = h.signal_state as SignalState | null
  if (!s) return 'neutral'
  const b = STATE_BUCKET[s] ?? 'unavailable'
  return b === 'bullish'
    ? 'bull'
    : b === 'bearish'
      ? 'bear'
      : b === 'unavailable'
        ? 'neutral'
        : 'amber'
}
const holdings = computed(() =>
  [...(props.map?.holdings ?? [])].sort(
    (a, b) => (num(b.allocation_pct) ?? 0) - (num(a.allocation_pct) ?? 0),
  ),
)
const p = (v: string | number | null | undefined, dp = 2) => {
  const n = num(v)
  return n === null ? '—' : dec(n, dp)
}
const up = (v: string | number | null | undefined) => (num(v) ?? 0) >= 0
const counts = computed(() => props.map?.classification_counts ?? {})

// --- rebalance preview (the server's) ----------------------------------------------------
const form = reactive({
  maxWeight: null as number | null,
  cashBuffer: null as number | null,
  maxNew: null as number | null,
  minTrade: null as number | null,
})
const preview = ref<RebalancePreview | null>(null)
const previewing = ref(false)
const previewError = ref('')
async function runPreview() {
  previewing.value = true
  previewError.value = ''
  try {
    preview.value = await previewRebalance({
      timeframe: props.tf,
      ...(form.maxWeight !== null ? { max_weight_pct: form.maxWeight } : {}),
      ...(form.cashBuffer !== null ? { cash_buffer_pct: form.cashBuffer } : {}),
      ...(form.maxNew !== null ? { max_new: form.maxNew } : {}),
      ...(form.minTrade !== null ? { min_trade_value: form.minTrade } : {}),
    })
  } catch (e) {
    previewError.value = (e as Error).message || 'The preview could not be made.'
  } finally {
    previewing.value = false
  }
}
const allocRows = computed(() => {
  const pr = preview.value
  if (!pr) return []
  const keys = [
    ...new Set([...Object.keys(pr.allocation_before), ...Object.keys(pr.allocation_after)]),
  ]
  return keys
    .map((k) => ({
      symbol: k,
      before: num(pr.allocation_before[k]) ?? 0,
      after: num(pr.allocation_after[k]) ?? 0,
    }))
    .sort((a, b) => b.after - a.after)
})
</script>

<template>
  <div class="pm">
    <SignalNotice v-if="error" tone="danger" title="The portfolio map could not be read">{{
      error
    }}</SignalNotice>
    <Skeleton v-if="loading && !map" :lines="1" height="260px" radius="var(--radius-card)" />
    <EmptyState
      v-else-if="map && !map.holdings.length"
      glyph="💼"
      title="No Dhan holdings to map"
      description="The map reads the latest Dhan holdings snapshot (taken every 5 minutes in market hours). Once your account reports holdings, each one shows here."
    />
    <template v-else-if="map">
      <section class="pm__card">
        <header class="pm__head">
          <h3 class="pm__title">Holdings by signal</h3>
          <span class="pm__sum tp-num">
            Invested {{ p(map.totals.invested, 0) }} · value {{ p(map.totals.current, 0) }} ·
            P&amp;L
            <span :class="up(map.totals.unrealized_pnl) ? 'is-up' : 'is-down'">{{
              signed(map.totals.unrealized_pnl, 0)
            }}</span>
            <template v-if="map.available_cash !== null">
              · cash {{ p(map.available_cash, 0) }}</template
            >
          </span>
          <span class="pm__legend" aria-hidden="true">
            <i class="t-bull" />Bullish <i class="t-bear" />Bearish <i class="t-amber" />Awaiting /
            mixed <i class="t-neutral" />No signal
          </span>
        </header>
        <div class="pm__chips">
          <span v-for="(n, k) in counts" :key="k" class="pm__chip"
            >{{ CLASS_LABEL[k as keyof typeof CLASS_LABEL] ?? k }} {{ n }}</span
          >
          <span class="pm__dim">
            Holdings
            {{ map.freshness.holdings_as_of ? ago(map.freshness.holdings_as_of, now) : '—' }} ·
            signals
            {{ map.freshness.signals_as_of ? ago(map.freshness.signals_as_of, now) : '—' }}
          </span>
        </div>
        <div class="pm__map" role="list">
          <button
            v-for="h in holdings"
            :key="h.symbol"
            type="button"
            role="listitem"
            class="pm__tile"
            :class="`t-${tone(h)}`"
            :style="{ flexGrow: Math.max(1, Math.round(num(h.allocation_pct) ?? 1)) }"
            :disabled="!h.instrument_id"
            :aria-label="`${h.symbol}, ${p(h.allocation_pct, 1)}% of holdings, ${h.signal_state ?? 'no signal'}, ${CLASS_LABEL[h.classification]}. ${h.instrument_id ? 'Open chart.' : 'Not matched to an instrument.'}`"
            @click="emit('chart', h)"
          >
            <span class="pm__sym">{{ h.symbol }}</span>
            <span class="pm__w tp-num">{{ p(h.allocation_pct, 1) }}%</span>
            <span
              v-if="h.unrealized_pnl !== null"
              class="pm__pnl tp-num"
              :class="up(h.unrealized_pnl) ? 'is-up' : 'is-down'"
            >
              {{ signed(h.unrealized_pnl, 0)
              }}<template v-if="h.unrealized_pnl_pct !== null">
                ({{ signed(h.unrealized_pnl_pct, 1) }}%)</template
              >
            </span>
            <span class="pm__meta">
              EMA
              {{
                h.ema_state === 'above'
                  ? '8 > 32 ▲'
                  : h.ema_state === 'below'
                    ? '8 < 32 ▼'
                    : (h.ema_state ?? '—')
              }}
              · VWAP {{ h.vwap_state ?? '—' }}
            </span>
            <SignalBadge :state="h.signal_state as SignalState | null" />
            <span class="pm__class" :class="`c-${h.classification.toLowerCase()}`">{{
              CLASS_LABEL[h.classification]
            }}</span>
          </button>
        </div>
        <p class="pm__dim">
          {{
            map.sector_exposure.available
              ? ''
              : `Sector exposure: ${map.sector_exposure.reason ?? 'not available'}.`
          }}
          {{ map.disclaimer }}
        </p>
      </section>

      <div class="pm__grid">
        <section class="pm__card">
          <header class="pm__head">
            <h3 class="pm__title">Candidates</h3>
            <span class="pm__sum">Trending bullish, not held</span>
          </header>
          <ul v-if="candidates.length" class="pm__cands">
            <li v-for="c in candidates" :key="c.instrument_id" class="pm__cand">
              <span class="pm__candId"
                ><b>{{ c.symbol }}</b
                ><SignalBadge :state="c.state"
              /></span>
              <span class="tp-num pm__dim"
                >{{ p(c.last_price) }} · score {{ p(c.trend_score, 0) }}</span
              >
              <Button size="sm" variant="ghost" @click="emit('candidate', c)">
                <Icon name="chart-candlestick" size="sm" />Chart
              </Button>
            </li>
          </ul>
          <p v-else class="pm__dim">
            No bullish candidates outside your holdings in the latest run.
          </p>
        </section>

        <section class="pm__card" aria-label="Rebalance preview">
          <header class="pm__head">
            <h3 class="pm__title">Rebalance preview</h3>
          </header>
          <p class="pm__note">
            The server trims overweight holdings and spreads the freed value and spare cash over
            bullish candidates, with Dhan charges. A preview only: nothing is ordered, proposed or
            queued. Leave a field empty for the server's default.
          </p>
          <form class="pm__form" @submit.prevent="runPreview">
            <FormField label="Max weight %"
              ><NumberInput v-model="form.maxWeight" size="sm" :min="1" :max="100" placeholder="20"
            /></FormField>
            <FormField label="Cash buffer %"
              ><NumberInput v-model="form.cashBuffer" size="sm" :min="0" :max="100"
            /></FormField>
            <FormField label="New positions"
              ><NumberInput v-model="form.maxNew" size="sm" :min="0" :max="20"
            /></FormField>
            <FormField label="Min trade value"
              ><NumberInput v-model="form.minTrade" size="sm" :min="0"
            /></FormField>
            <Button type="submit" size="sm" variant="primary" :loading="previewing">Preview</Button>
          </form>
          <SignalNotice v-if="previewError" tone="danger">{{ previewError }}</SignalNotice>
          <template v-if="preview">
            <dl class="pm__cash tp-num">
              <div>
                <dt>Cash before</dt>
                <dd>{{ preview.cash_known ? p(preview.cash_before, 0) : 'unknown' }}</dd>
              </div>
              <div>
                <dt>Cash required</dt>
                <dd>{{ p(preview.cash_required, 0) }}</dd>
              </div>
              <div>
                <dt>Cash after</dt>
                <dd>{{ preview.cash_known ? p(preview.cash_after, 0) : 'unknown' }}</dd>
              </div>
              <div>
                <dt>Charges</dt>
                <dd>{{ p(preview.total_charges, 2) }}</dd>
              </div>
            </dl>
            <div v-if="preview.trades.length" class="pm__tableWrap">
              <table class="pm__table tp-num">
                <thead>
                  <tr>
                    <th scope="col">Side</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Price</th>
                    <th scope="col">Value</th>
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in preview.trades" :key="`${t.side}${t.symbol}`">
                    <td :class="t.side === 'BUY' ? 'is-up' : 'is-down'">{{ t.side }}</td>
                    <th scope="row">{{ t.symbol }}</th>
                    <td>{{ p(t.quantity, 0) }}</td>
                    <td>{{ p(t.price) }}</td>
                    <td>{{ p(t.value, 0) }}</td>
                    <td class="pm__why">{{ t.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="pm__dim">No trades: the portfolio already fits these limits.</p>
            <div v-if="allocRows.length" class="pm__alloc">
              <div v-for="a in allocRows" :key="a.symbol" class="pm__allocRow tp-num">
                <span class="pm__allocSym">{{ a.symbol }}</span>
                <span class="pm__bars" aria-hidden="true">
                  <span
                    class="pm__bar is-before"
                    :style="{ width: `${Math.min(100, a.before)}%` }"
                  />
                  <span class="pm__bar is-after" :style="{ width: `${Math.min(100, a.after)}%` }" />
                </span>
                <span>{{ a.before.toFixed(1) }}% → {{ a.after.toFixed(1) }}%</span>
              </div>
            </div>
            <ul v-if="preview.review.length || preview.notes.length" class="pm__notes">
              <li v-for="r in preview.review" :key="`r${r}`"><b>Review:</b> {{ r }}</li>
              <li v-for="n in preview.notes" :key="`n${n}`">{{ n }}</li>
            </ul>
            <p class="pm__dim">
              {{ preview.charges_model }} · generated {{ ago(preview.generated_at, now) }}
            </p>
          </template>
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
.pm__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.pm__chip {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  font-size: var(--text-2xs);
  color: var(--theme-text);
}
.pm__map {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pm__tile {
  flex-basis: 140px;
  min-height: 120px;
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
.pm__tile:hover:not(:disabled) {
  background: color-mix(in oklch, var(--tile) 24%, var(--theme-card));
}
.pm__tile:disabled {
  cursor: default;
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
.pm__meta,
.pm__class {
  font-size: var(--text-2xs);
}
.pm__meta {
  color: var(--theme-dim);
}
.pm__tile :deep(.sb) {
  margin-top: auto;
}
.pm__class {
  font-weight: var(--weight-semibold);
  color: var(--theme-dim);
}
.c-review_risk {
  color: var(--theme-danger);
}
.c-potential_add {
  color: var(--theme-success);
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
.pm__cand :deep(.ui-icon) {
  margin-right: 4px;
}
.pm__candId {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-right: auto;
}
.pm__form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-2);
}
.pm__form > :not(button) {
  flex: 1 1 110px;
  min-width: 0;
}
.pm__cash {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--sp-2);
  margin: 0;
}
.pm__cash dt {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-dim);
}
.pm__cash dd {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
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
  text-align: left;
  white-space: nowrap;
}
.pm__table thead th {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-dim);
}
.pm__why {
  min-width: 0;
  white-space: normal !important;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.pm__alloc {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pm__allocRow {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.pm__allocSym {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pm__bars {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pm__bar {
  height: 4px;
  border-radius: var(--radius-pill);
}
.pm__bar.is-before {
  background: color-mix(in oklch, var(--theme-text) 25%, transparent);
}
.pm__bar.is-after {
  background: var(--theme-accent);
}
.pm__notes {
  margin: 0;
  padding-left: 1.1em;
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.is-up {
  color: var(--theme-success);
}
.is-down {
  color: var(--theme-danger);
}
</style>

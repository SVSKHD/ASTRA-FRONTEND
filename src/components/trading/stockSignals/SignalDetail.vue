<script setup lang="ts">
// One stock's signal in full, as the engine stored it: the state and what it
// means, EMA 8 / 32 and their spread, VWAP and the distance from it, the newest
// crossover (direction, cross time) and its VWAP confirmation (time and price,
// kept apart), RSI / ADX / relative volume, the trend score, data freshness,
// what is missing, and the holding (allocation, P&L, advisory class, reasons)
// when held. Used by the table's expanded row, the chart viewer and the
// portfolio-impact dialog. Quick actions go in the default slot.
import SignalBadge from './SignalBadge.vue'
import { dec, signed, ago } from '@/trading/format'
import {
  CLASS_LABEL,
  STATE_HELP,
  num,
  type PortfolioHolding,
  type SignalEvent,
  type StateRow,
} from '@/trading/stockSignals/api'

defineProps<{
  state: StateRow | null
  event?: SignalEvent | null
  holding?: PortfolioHolding | null
  now: number
  error?: string
}>()

const p = (v: string | number | null | undefined, dp = 2) => {
  const n = num(v)
  return n === null ? '—' : dec(n, dp)
}
const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' IST'
    : '—'
const tone = (v: string | number | null | undefined) => {
  const n = num(v)
  return n === null || n === 0 ? '' : n > 0 ? 'is-up' : 'is-down'
}
</script>

<template>
  <div class="sd">
    <p v-if="error && !state" class="sd__error" role="alert">{{ error }}</p>
    <template v-else-if="state">
      <div class="sd__head">
        <SignalBadge :state="state.state" size="md" />
        <span v-if="state.trend_score !== null" class="sd__score tp-num">
          Trend score {{ p(state.trend_score, 0) }} / 100
        </span>
        <span class="sd__fresh">
          Newest closed candle {{ state.candle_close_at ? ago(state.candle_close_at, now) : '—' }}
        </span>
      </div>
      <p class="sd__why">
        {{ STATE_HELP[state.state] }}
        <template v-if="state.reason"> {{ state.reason }}</template>
      </p>

      <dl class="sd__grid tp-num">
        <div>
          <dt>EMA 8</dt>
          <dd>{{ p(state.ema_fast) }}</dd>
        </div>
        <div>
          <dt>EMA 32</dt>
          <dd>
            {{ p(state.ema_slow) }}
            <span v-if="state.ema_spread_pct !== null" class="sd__sub"
              >spread {{ signed(state.ema_spread_pct, 2) }}%</span
            >
          </dd>
        </div>
        <div>
          <dt>Session VWAP</dt>
          <dd>
            {{ p(state.vwap) }}
            <span
              v-if="state.vwap_distance_pct !== null"
              class="sd__sub"
              :class="tone(state.vwap_distance_pct)"
              >price {{ signed(state.vwap_distance_pct, 2) }}%</span
            >
          </dd>
        </div>
        <div>
          <dt>Last cross</dt>
          <dd>
            <template v-if="event">
              <span :class="event.direction === 'bullish' ? 'is-up' : 'is-down'">
                {{ event.direction === 'bullish' ? '▲ Bullish' : '▼ Bearish' }}
              </span>
              <span class="sd__sub">{{ when(event.crossed_at) }}</span>
            </template>
            <template v-else>None recently</template>
          </dd>
        </div>
        <div>
          <dt>VWAP confirmation</dt>
          <dd>
            <template v-if="event?.confirmed_at">
              Confirmed at {{ p(event.confirm_price) }}
              <span class="sd__sub">{{ when(event.confirmed_at) }}</span>
            </template>
            <template v-else-if="event">Awaiting</template>
            <template v-else>—</template>
          </dd>
        </div>
        <div>
          <dt>RSI 14</dt>
          <dd>{{ p(state.rsi, 1) }}</dd>
        </div>
        <div>
          <dt>ADX 14</dt>
          <dd>{{ p(state.adx, 1) }}</dd>
        </div>
        <div>
          <dt>Rel. volume</dt>
          <dd>{{ num(state.rvol) === null ? '—' : `${p(state.rvol)}×` }}</dd>
        </div>
        <div>
          <dt>vs Nifty 50</dt>
          <dd :class="tone(state.relative_pct)">
            {{ num(state.relative_pct) === null ? '—' : `${signed(state.relative_pct, 2)}%` }}
          </dd>
        </div>
      </dl>
      <p v-if="state.missing_features.length" class="sd__missing">
        Not available: {{ state.missing_features.join(', ') }}
      </p>

      <div class="sd__holding" :class="{ 'is-held': holding }">
        <template v-if="holding">
          <span class="sd__label"
            >In your portfolio · {{ CLASS_LABEL[holding.classification] }}</span
          >
          <span class="tp-num">
            {{ num(holding.allocation_pct) === null ? '—' : `${p(holding.allocation_pct, 1)}%` }}
            of holdings · qty {{ p(holding.quantity, 0) }} · avg {{ p(holding.avg_cost) }}
          </span>
          <span
            v-if="holding.unrealized_pnl !== null"
            class="tp-num"
            :class="tone(holding.unrealized_pnl)"
          >
            P&amp;L {{ signed(holding.unrealized_pnl, 2) }}
            <template v-if="holding.unrealized_pnl_pct !== null"
              >({{ signed(holding.unrealized_pnl_pct, 2) }}%)</template
            >
          </span>
          <ul v-if="holding.reasons.length" class="sd__reasons">
            <li v-for="r in holding.reasons" :key="r">{{ r }}</li>
          </ul>
        </template>
        <span v-else-if="state.in_holdings" class="sd__label">Held (portfolio map not loaded)</span>
        <span v-else class="sd__label">Not held</span>
      </div>
    </template>
    <p v-else class="sd__error">Loading the signal…</p>
    <div v-if="$slots.default" class="sd__actions"><slot /></div>
  </div>
</template>

<style scoped>
.sd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.sd__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}
.sd__score {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--theme-text);
}
.sd__fresh {
  margin-left: auto;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.sd__why {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.sd__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
}
.sd__grid div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.sd__grid dt {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-dim);
}
.sd__grid dd {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.sd__sub {
  display: block;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.sd__missing {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-warning);
}
.is-up {
  color: var(--theme-success) !important;
}
.is-down {
  color: var(--theme-danger) !important;
}
.sd__holding {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.sd__holding.is-held {
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
}
.sd__label {
  font-weight: var(--weight-semibold);
  color: var(--theme-dim);
}
.sd__reasons {
  flex-basis: 100%;
  margin: 0;
  padding-left: 1.1em;
  color: var(--theme-dim);
}
.sd__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.sd__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.sd__actions :deep(.ui-icon) {
  margin-right: 4px;
}
</style>

<script setup lang="ts">
// One stock's signal, in full: the class, EMA 8 / 32, the newest cross, VWAP and
// how far price is from it, whether VWAP confirmed the cross, RSI / ADX /
// relative volume, the explanation, how fresh it is, and the holding (weight and
// P&L) when it is held. Used by the table's expanded row, the chart viewer and
// the portfolio-impact dialog. Quick actions go in the default slot.
import { computed } from 'vue'
import SignalBadge from './SignalBadge.vue'
import { dec, signed } from '@/trading/format'
import { fullTime, type Timeframe } from '@/trading/chartView'
import { isStaleAt, strengthWord, type Reading } from '@/trading/stockSignals/classify'
import type { HoldingView } from '@/trading/stockSignals/portfolio'
import { ago } from '@/trading/format'

const props = defineProps<{
  reading: Reading | null
  tf: Timeframe
  now: number
  holding?: HoldingView | null
  /** Why there is no reading (the read failed). */
  error?: string
  compact?: boolean
}>()

const stale = computed(() =>
  props.reading ? isStaleAt(props.reading.asOf, props.tf, props.now) : false,
)
const p = (v: number | null | undefined, dp = 2) =>
  v === null || v === undefined ? '—' : dec(v, dp)
const at = (t: number | undefined | null) => (t ? fullTime(t, props.tf) : '—')
</script>

<template>
  <div class="sd" :class="{ 'is-compact': compact }">
    <p v-if="error && !reading" class="sd__error" role="alert">{{ error }}</p>
    <template v-else-if="reading">
      <div class="sd__head">
        <SignalBadge :cls="reading.cls" size="md" :stale="stale" />
        <span v-if="reading.strength !== null" class="sd__strength tp-num">
          Strength {{ reading.strength }} · {{ strengthWord(reading.strength) }}
        </span>
        <span class="sd__fresh" :class="{ 'is-stale': stale }">
          {{ stale ? 'Stale: ' : '' }}newest bar
          {{ reading.asOf ? ago(new Date(reading.asOf).toISOString(), now) : '—' }}
        </span>
      </div>
      <p class="sd__why">{{ reading.explanation }}</p>

      <dl class="sd__grid tp-num">
        <div>
          <dt>EMA 8</dt>
          <dd>{{ p(reading.ema8) }}</dd>
        </div>
        <div>
          <dt>EMA 32</dt>
          <dd>{{ p(reading.ema32) }}</dd>
        </div>
        <div v-if="reading.usesVwap">
          <dt>VWAP</dt>
          <dd>
            {{ p(reading.vwap) }}
            <span
              v-if="reading.vwapDistPct !== null"
              class="sd__dist"
              :class="reading.vwapDistPct >= 0 ? 'is-up' : 'is-down'"
              >{{ signed(reading.vwapDistPct, 2) }}%</span
            >
          </dd>
        </div>
        <div v-else>
          <dt>VWAP</dt>
          <dd class="sd__na">Not on daily bars</dd>
        </div>
        <div>
          <dt>Last cross</dt>
          <dd>
            <template v-if="reading.cross">
              <span :class="reading.cross.direction === 'up' ? 'is-up' : 'is-down'">
                {{ reading.cross.direction === 'up' ? '▲ Up' : '▼ Down' }}
              </span>
              <span class="sd__sub">{{ at(reading.cross.at) }}</span>
            </template>
            <template v-else>None in view</template>
          </dd>
        </div>
        <div v-if="reading.usesVwap">
          <dt>VWAP confirmation</dt>
          <dd>
            <template v-if="reading.confirmed">
              Confirmed <span class="sd__sub">{{ at(reading.confirmed.at) }}</span>
            </template>
            <template v-else-if="reading.cls === 'pending'">Awaiting</template>
            <template v-else>—</template>
          </dd>
        </div>
        <div>
          <dt>RSI 14</dt>
          <dd>{{ p(reading.rsi, 1) }}</dd>
        </div>
        <div>
          <dt>ADX 14</dt>
          <dd>{{ p(reading.adx, 1) }}</dd>
        </div>
        <div>
          <dt>Rel. volume</dt>
          <dd>{{ reading.relVolume === null ? '—' : `${reading.relVolume.toFixed(2)}×` }}</dd>
        </div>
      </dl>

      <div class="sd__holding" :class="{ 'is-held': holding }">
        <template v-if="holding">
          <span class="sd__label">In your portfolio</span>
          <span class="tp-num">
            {{ (holding.weight * 100).toFixed(1) }}% of holdings · qty {{ dec(holding.quantity) }} ·
            avg
            {{ dec(holding.avgCost, 2) }}
          </span>
          <span
            v-if="holding.pnl !== null"
            class="tp-num"
            :class="holding.pnl >= 0 ? 'is-up' : 'is-down'"
          >
            P&amp;L {{ signed(holding.pnl, 2) }} ({{ signed(holding.pnlPct, 2) }}%)
          </span>
        </template>
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
.sd__strength {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--theme-text);
}
.sd__fresh {
  margin-left: auto;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.sd__fresh.is-stale {
  color: var(--theme-warning);
}
.sd__why {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
  min-width: 0;
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
  font-size: var(--text-sm);
  color: var(--theme-text);
  min-width: 0;
}
.sd__sub {
  display: block;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.sd__dist {
  margin-left: 4px;
  font-size: var(--text-xs);
}
.sd__na {
  color: var(--theme-dim) !important;
}
.is-up {
  color: var(--theme-success);
}
.is-down {
  color: var(--theme-danger);
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
</style>

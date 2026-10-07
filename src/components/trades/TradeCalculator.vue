<script setup lang="ts">
// The Trades tab's Calculator: "if I take this symbol from here to there with
// this many lots, what is it worth?" The same model the journal logs with —
// move = exit − entry (reversed for a sell), P/L = move × lot × contract size —
// from the same contract sizes in Account settings, so a figure worked out here
// is the figure the trade would log.
import { computed, ref, watch } from 'vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { contractSizeFor, round2, signOf, tradeMove, tradePl } from '@/utils/tradeMath'
import type { LoggerSettings, TradeSide } from '@/types'

const props = defineProps<{ settings: LoggerSettings }>()

const symbols = computed(() =>
  Object.keys(props.settings.contractSizes)
    .sort()
    .map((s) => ({ value: s, label: s })),
)
const symbol = ref(props.settings.lastSymbol || symbols.value[0]?.value || '')
// Settings arrive after mount; take the last-used symbol once they do, unless
// one has been picked already.
watch(
  () => props.settings.lastSymbol,
  (last) => {
    if (last && !symbols.value.some((o) => o.value === symbol.value)) symbol.value = last
  },
)

const SIDES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
]
const side = ref<TradeSide>('buy')
const from = ref<string | number>('')
const to = ref<string | number>('')
const lots = ref<string | number>(props.settings.defaultLot || 1)

const num = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const entry = computed(() => num(from.value))
const exit = computed(() => num(to.value))
const lot = computed(() => num(lots.value))
const size = computed(() => contractSizeFor(props.settings.contractSizes, symbol.value))

const ready = computed(() => entry.value != null && exit.value != null && lot.value != null)
const move = computed(() =>
  entry.value != null && exit.value != null ? tradeMove(side.value, entry.value, exit.value) : 0,
)
const profit = computed(() => (ready.value ? tradePl(move.value, lot.value!, size.value) : 0))
const perPoint = computed(() => round2((lot.value ?? 0) * size.value))
const pct = computed(() =>
  entry.value ? round2((((exit.value ?? entry.value) - entry.value) / entry.value) * 100) : 0,
)

// The same move at other lot sizes, so sizing up or down is one glance.
const LADDER = [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
const ladder = computed(() =>
  LADDER.map((l) => ({ lot: l, pl: tradePl(move.value, l, size.value) })),
)

const money = (v: number) =>
  (v < 0 ? '−$' : '$') +
  Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString()

function swap() {
  ;[from.value, to.value] = [to.value, from.value]
}
</script>

<template>
  <section class="calc" aria-label="Profit calculator">
    <div class="calc__form">
      <div class="calc__field">
        <span class="calc__label">Symbol</span>
        <Select v-model="symbol" :options="symbols" size="md" placeholder="Symbol" />
      </div>
      <div class="calc__field">
        <span class="calc__label">Side</span>
        <Tabs
          size="sm"
          :model-value="side"
          :tabs="SIDES"
          aria-label="Buy or sell"
          @update:model-value="side = $event as TradeSide"
        />
      </div>
      <div class="calc__field">
        <span class="calc__label">From price</span>
        <TextInput
          v-model="from"
          type="number"
          inputmode="decimal"
          placeholder="e.g. 2350.00"
          aria-label="From price"
        />
      </div>
      <button type="button" class="calc__swap" title="Swap from and to" @click="swap">⇄</button>
      <div class="calc__field">
        <span class="calc__label">To price</span>
        <TextInput
          v-model="to"
          type="number"
          inputmode="decimal"
          placeholder="e.g. 2362.50"
          aria-label="To price"
        />
      </div>
      <div class="calc__field">
        <span class="calc__label">Lots</span>
        <TextInput v-model="lots" type="number" inputmode="decimal" aria-label="Lots" />
      </div>
    </div>

    <div class="calc__result" :class="'is-' + signOf(profit)" role="status" aria-live="polite">
      <div class="calc__big">
        <span class="calc__label">Profit</span>
        <span class="calc__profit">{{
          ready ? (profit > 0 ? '+' : '') + money(profit) : '—'
        }}</span>
      </div>
      <dl class="calc__facts">
        <div>
          <dt>Movement</dt>
          <dd>
            {{ ready ? signed(move) : '—' }} <small v-if="ready && pct">({{ signed(pct) }}%)</small>
          </dd>
        </div>
        <div>
          <dt>Per 1.00 move</dt>
          <dd>{{ money(perPoint) }}</dd>
        </div>
        <div>
          <dt>Contract size</dt>
          <dd>{{ size.toLocaleString() }}</dd>
        </div>
      </dl>
      <p class="calc__formula">
        {{ ready ? signed(move) : 'move' }} × {{ lot ?? 'lots' }} lot ×
        {{ size.toLocaleString() }} = {{ ready ? money(profit) : 'profit' }}
      </p>
    </div>

    <div v-if="ready" class="calc__ladder">
      <span class="calc__label">Same move, other lot sizes</span>
      <div class="calc__ladder-row">
        <div
          v-for="r in ladder"
          :key="r.lot"
          class="calc__rung"
          :class="['is-' + signOf(r.pl), { 'is-current': r.lot === lot }]"
        >
          <span class="calc__rung-lot">{{ r.lot }} lot</span>
          <span class="calc__rung-pl">{{ money(r.pl) }}</span>
        </div>
      </div>
    </div>

    <p class="calc__note">
      Contract sizes come from Account settings ({{ symbol }} = {{ size.toLocaleString() }} per
      lot).
    </p>
  </section>
</template>

<style scoped>
.calc {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
  padding: var(--sp-4);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.calc__form {
  display: grid;
  grid-template-columns:
    minmax(140px, 1.2fr) auto minmax(120px, 1fr) auto minmax(120px, 1fr)
    minmax(90px, 0.7fr);
  align-items: end;
  gap: var(--sp-3);
}
.calc__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.calc__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.calc__swap {
  height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-md);
  cursor: pointer;
}
.calc__swap:hover {
  color: var(--theme-text);
}
.calc__result {
  display: grid;
  grid-template-columns: minmax(180px, auto) 1fr;
  align-items: center;
  gap: var(--sp-3) var(--sp-6);
  padding: var(--sp-4);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}
.calc__big {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.calc__profit {
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
}
.is-pos .calc__profit,
.calc__rung.is-pos .calc__rung-pl {
  color: var(--theme-success);
}
.is-neg .calc__profit,
.calc__rung.is-neg .calc__rung-pl {
  color: var(--theme-danger);
}
.calc__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
  margin: 0;
}
.calc__facts dt {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.calc__facts dd {
  margin: 2px 0 0;
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
}
.calc__facts small {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.calc__formula {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.calc__ladder {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.calc__ladder-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: var(--sp-2);
}
.calc__rung {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-text) 8%, transparent);
}
.calc__rung.is-current {
  border-color: var(--theme-accent);
}
.calc__rung-lot {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.calc__rung-pl {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.calc__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@media (max-width: 900px) {
  .calc__form {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .calc__swap {
    display: none;
  }
  .calc__result {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

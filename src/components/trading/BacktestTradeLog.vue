<script setup lang="ts">
// A backtest's trades as a log you can read: one card per trade, newest first,
// with the side, entry → exit, how long it was held and what it made. Used by
// the replay (only what has happened by its cursor, the open one valued at the
// replay's price) and by the results (every trade). Clicking a trade asks the
// parent to jump to it.
import { computed, ref } from 'vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { dec, signed, when } from '@/trading/format'
import { heldBars, stateAt, unrealised, type PlacedTrade } from '@/trading/backtestReplay'

const props = withDefaults(
  defineProps<{
    placed: readonly PlacedTrade[]
    /** The replay's bar: trades after it are not shown. Omit for the whole log. */
    cursor?: number
    /** The price at the cursor, to value the open trade. */
    price?: number | null
    /** The trade to highlight (the one the replay last touched). */
    activeN?: number | null
  }>(),
  { cursor: Number.POSITIVE_INFINITY, price: null, activeN: null },
)
const emit = defineEmits<{ seek: [n: number] }>()

type Filter = 'all' | 'wins' | 'losses' | 'open'
const filter = ref<Filter>('all')
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'wins', label: 'Wins' },
  { value: 'losses', label: 'Losses' },
  { value: 'open', label: 'Open' },
]

const rows = computed(() =>
  props.placed
    .map((t) => {
      const state = stateAt(t, props.cursor)
      const live = state === 'open' && props.price !== null ? unrealised(t, props.price) : null
      const value = state === 'closed' ? t.pnl : live
      return { t, state, value, held: heldBars(t, props.cursor) }
    })
    .filter((r) => r.state !== 'pending')
    .filter((r) =>
      filter.value === 'all'
        ? true
        : filter.value === 'open'
          ? r.state === 'open'
          : r.state === 'closed' &&
            (filter.value === 'wins' ? (r.value ?? 0) > 0 : (r.value ?? 0) <= 0),
    )
    .reverse(),
)
const counts = computed(() => {
  const shown = props.placed.filter((t) => stateAt(t, props.cursor) !== 'pending')
  return { shown: shown.length, total: props.placed.length }
})
function toneOf(v: number | null): 'up' | 'down' | 'flat' {
  return v === null || v === 0 ? 'flat' : v > 0 ? 'up' : 'down'
}
</script>

<template>
  <section class="tl" aria-label="Trade log">
    <header class="tl__head">
      <span class="tl__title">
        Trades
        <span class="tl__count tp-num">
          {{ counts.shown === counts.total ? counts.total : `${counts.shown} of ${counts.total}` }}
        </span>
      </span>
      <SegmentedControl v-model="filter" :options="FILTERS" size="sm" aria-label="Show trades" />
    </header>

    <ol v-if="rows.length" class="tl__list">
      <li
        v-for="r in rows"
        :key="r.t.n"
        class="tl__trade"
        :class="[`is-${r.state}`, `is-${toneOf(r.value)}`, { 'is-active': activeN === r.t.n }]"
      >
        <button
          type="button"
          class="tl__btn"
          :aria-label="`Trade ${r.t.n}: jump the replay to it`"
          @click="emit('seek', r.t.n)"
        >
          <span class="tl__row">
            <span class="tl__id">
              <span class="tl__n tp-num">#{{ r.t.n }}</span>
              <span class="tl__side" :class="r.t.long ? 'is-long' : 'is-short'">
                {{ r.t.long ? 'Long' : 'Short' }}
              </span>
              <span v-if="r.state === 'open'" class="tl__open">Open</span>
            </span>
            <span class="tl__pnl tp-num">
              <template v-if="r.value !== null">
                {{ signed(r.value, 2) }}
                <span v-if="r.state === 'closed' && r.t.ret !== null" class="tl__ret"
                  >({{ signed(r.t.ret * 100, 2) }}%)</span
                >
              </template>
              <template v-else>—</template>
            </span>
          </span>
          <span class="tl__path tp-num">
            <span>
              <b>{{ dec(r.t.trade.entry_price, 2) }}</b>
              <span class="tl__when">{{ when(r.t.trade.entry_time) }}</span>
            </span>
            <span class="tl__arrow" aria-hidden="true">→</span>
            <span v-if="r.state === 'closed'">
              <b>{{ dec(r.t.trade.exit_price, 2) }}</b>
              <span class="tl__when">{{ when(r.t.trade.exit_time) }}</span>
            </span>
            <span v-else class="tl__when">
              {{ price !== null ? `now ${dec(price, 2)} · unrealised` : 'still open' }}
            </span>
          </span>
          <span class="tl__meta tp-num">
            {{ r.held }} {{ r.held === 1 ? 'bar' : 'bars' }} · qty {{ dec(r.t.trade.quantity) }} ·
            fees {{ dec(r.t.trade.fees, 2) }}
          </span>
        </button>
      </li>
    </ol>
    <p v-else class="tl__empty">
      {{
        counts.shown
          ? 'No trades match this filter.'
          : 'No trades yet. Press play, or jump to the first trade.'
      }}
    </p>
  </section>
</template>

<style scoped>
.tl {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  min-height: 0;
}
.tl__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.tl__title {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.tl__count {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--theme-dim);
}
.tl__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  overflow-y: auto;
  min-height: 0;
}
.tl__trade {
  --tone: var(--theme-dim);
  position: relative;
  border-radius: var(--radius-md);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  overflow: hidden;
  transition:
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}
.tl__trade::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--tone);
}
.tl__trade.is-up {
  --tone: var(--theme-success);
}
.tl__trade.is-down {
  --tone: var(--theme-danger);
}
.tl__trade.is-open {
  --tone: var(--theme-warning);
}
.tl__trade.is-active {
  border-color: color-mix(in oklch, var(--theme-accent) 60%, var(--theme-border));
  background: color-mix(in oklch, var(--theme-accent) 7%, var(--theme-card));
}
.tl__btn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: var(--sp-2) var(--sp-3) var(--sp-2) calc(var(--sp-3) + 3px);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tl__btn:hover {
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
}
.tl__btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.tl__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.tl__id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.tl__n {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.tl__side,
.tl__open {
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tl__side.is-long {
  color: var(--theme-success);
  background: color-mix(in oklch, var(--theme-success) 14%, transparent);
}
.tl__side.is-short {
  color: var(--theme-danger);
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
}
.tl__open {
  color: var(--theme-warning);
  background: color-mix(in oklch, var(--theme-warning) 14%, transparent);
}
.tl__pnl {
  font-weight: var(--weight-semibold);
  color: var(--tone);
  white-space: nowrap;
}
.tl__trade.is-flat .tl__pnl {
  color: var(--theme-text);
}
.tl__ret {
  margin-left: 4px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}
.tl__path {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.tl__path b {
  font-weight: var(--weight-semibold);
}
.tl__when {
  margin-left: 6px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.tl__arrow {
  color: var(--theme-dim);
}
.tl__meta {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.tl__empty {
  margin: 0;
  padding: var(--sp-4);
  text-align: center;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
</style>

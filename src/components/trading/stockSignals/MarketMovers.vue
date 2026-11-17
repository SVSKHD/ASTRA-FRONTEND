<script setup lang="ts">
// Market Movers: fresh EMA 8 / 32 crosses across NSE stocks from the server's
// screener (bullish and bearish, newest first), and the biggest moves today
// among the stocks this page reads. Click one for its chart.
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { dec, signed, ago } from '@/trading/format'
import type { ScreenerItem } from '@/trading/screener'
import type { RowData, UniverseItem } from '@/trading/stockSignals/useStockSignals'

const props = defineProps<{
  bullish: readonly ScreenerItem[]
  bearish: readonly ScreenerItem[]
  asOf: string | null
  items: readonly UniverseItem[]
  rows: Readonly<Record<number, RowData>>
  now: number
}>()
const emit = defineEmits<{ chart: [number] }>()

const moves = computed(() =>
  props.items
    .map((i) => ({ item: i, change: props.rows[i.instrument.id]?.change ?? null }))
    .filter((m): m is { item: UniverseItem; change: number } => m.change !== null)
    .sort((a, b) => b.change - a.change),
)
const gainers = computed(() => moves.value.filter((m) => m.change > 0).slice(0, 8))
const losers = computed(() =>
  [...moves.value]
    .reverse()
    .filter((m) => m.change < 0)
    .slice(0, 8),
)
</script>

<template>
  <div class="mm">
    <section
      v-for="col in [
        { key: 'bull', title: 'Fresh bullish crosses', list: bullish, up: true },
        { key: 'bear', title: 'Fresh bearish crosses', list: bearish, up: false },
      ]"
      :key="col.key"
      class="mm__card"
    >
      <header class="mm__head">
        <h3 class="mm__title">
          <Icon
            :name="col.up ? 'trending-up' : 'trending-down'"
            size="sm"
            :class="col.up ? 'is-up' : 'is-down'"
          />
          {{ col.title }}
        </h3>
        <span class="mm__dim"
          >NSE screener<template v-if="asOf"> · {{ ago(asOf, now) }}</template></span
        >
      </header>
      <ol v-if="col.list.length" class="mm__list">
        <li v-for="s in col.list" :key="s.instrument.id">
          <button type="button" class="mm__row" @click="emit('chart', s.instrument.id)">
            <span class="mm__sym">{{ s.instrument.symbol }}</span>
            <span class="mm__dim mm__name">{{ s.instrument.name }}</span>
            <span class="tp-num">{{ s.last ? dec(s.last, 2) : '—' }}</span>
            <span class="tp-num" :class="Number(s.change_pct) >= 0 ? 'is-up' : 'is-down'">{{
              s.change_pct ? `${signed(s.change_pct, 2)}%` : '—'
            }}</span>
            <span class="mm__dim">{{ s.crossed_at ? ago(s.crossed_at, now) : '' }}</span>
          </button>
        </li>
      </ol>
      <EmptyState
        v-else
        glyph="🕊️"
        title="No fresh crosses"
        description="The screener found none in the last few bars."
      />
    </section>

    <section
      v-for="col in [
        { key: 'g', title: 'Top gainers (your stocks)', list: gainers },
        { key: 'l', title: 'Top losers (your stocks)', list: losers },
      ]"
      :key="col.key"
      class="mm__card"
    >
      <header class="mm__head">
        <h3 class="mm__title">{{ col.title }}</h3>
      </header>
      <ol v-if="col.list.length" class="mm__list">
        <li v-for="m in col.list" :key="m.item.instrument.id">
          <button type="button" class="mm__row" @click="emit('chart', m.item.instrument.id)">
            <span class="mm__sym">{{ m.item.instrument.symbol }}</span>
            <span class="mm__dim mm__name">{{ m.item.instrument.name }}</span>
            <span class="tp-num">{{
              rows[m.item.instrument.id]?.reading?.close != null
                ? dec(rows[m.item.instrument.id]!.reading!.close, 2)
                : '—'
            }}</span>
            <span class="tp-num" :class="m.change >= 0 ? 'is-up' : 'is-down'"
              >{{ signed(m.change, 2) }}%</span
            >
          </button>
        </li>
      </ol>
      <p v-else class="mm__dim">No moves to show yet.</p>
    </section>
  </div>
</template>

<style scoped>
.mm {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--sp-3);
}
.mm__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
  min-width: 0;
}
.mm__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}
.mm__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.mm__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mm__row {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) auto 64px auto;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: 7px 4px;
  border: 0;
  border-bottom: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.mm__row:hover {
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
}
.mm__row:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.mm__row > :nth-child(4) {
  text-align: right;
}
.mm__sym {
  font-weight: var(--weight-semibold);
}
.mm__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mm__dim {
  font-size: var(--text-xs);
  color: var(--theme-dim);
  min-width: 0;
}
.is-up {
  color: var(--theme-success);
}
.is-down {
  color: var(--theme-danger);
}
</style>

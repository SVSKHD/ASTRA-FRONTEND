<script setup lang="ts">
// Market Movers: the engine's rankings from its latest finished run (docs/37
// §4): gainers, losers, unusual volume, and trending bullish / bearish by trend
// score. Each says how much of the universe it covers and when. Click one for
// its chart.
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SignalNotice from './SignalNotice.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SignalBadge from './SignalBadge.vue'
import { dec, signed, ago } from '@/trading/format'
import { num, type Ranking, type StateRow } from '@/trading/stockSignals/api'
import type { Movers } from '@/trading/stockSignals/useStockSignals'

defineProps<{ movers: Movers | null; loading: boolean; error: string; now: number }>()
const emit = defineEmits<{ chart: [StateRow]; retry: [] }>()

const COLS: { key: keyof Movers; title: string; icon: string; tone: string }[] = [
  { key: 'gainers', title: 'Top gainers', icon: 'trending-up', tone: 'is-up' },
  { key: 'losers', title: 'Top losers', icon: 'trending-down', tone: 'is-down' },
  { key: 'unusual', title: 'Unusual volume', icon: 'activity', tone: '' },
  { key: 'bullish', title: 'Trending bullish', icon: 'arrow-up-right', tone: 'is-up' },
  { key: 'bearish', title: 'Trending bearish', icon: 'arrow-down-right', tone: 'is-down' },
]
function coverage(r: Ranking | null, now: number): string {
  if (!r) return 'Not available'
  const c = r.coverage
  const when = c.finished_at ?? c.data_as_of
  return `${c.evaluated} of ${c.universe_size} evaluated${when ? ` · ${ago(when, now)}` : ''}`
}
</script>

<template>
  <div class="mm">
    <SignalNotice v-if="error" tone="danger" title="Rankings could not be read">
      {{ error }}

      <template #action>
        <Button size="sm" variant="secondary" @click="emit('retry')">Try again</Button>
      </template></SignalNotice
    >
    <div v-if="loading && !movers" class="mm__grid">
      <Skeleton v-for="n in 5" :key="n" :lines="1" height="260px" radius="var(--radius-card)" />
    </div>
    <div v-else-if="movers" class="mm__grid">
      <section v-for="col in COLS" :key="col.key" class="mm__card">
        <header class="mm__head">
          <h3 class="mm__title">
            <Icon :name="col.icon as never" size="sm" :class="col.tone" />{{ col.title }}
          </h3>
          <span class="mm__dim">{{ coverage(movers[col.key], now) }}</span>
        </header>
        <p v-if="movers[col.key]?.note" class="mm__dim">{{ movers[col.key]!.note }}</p>
        <ol v-if="movers[col.key]?.items.length" class="mm__list">
          <li v-for="s in movers[col.key]!.items" :key="s.instrument_id">
            <button type="button" class="mm__row" @click="emit('chart', s)">
              <span class="mm__sym">{{ s.symbol }}</span>
              <SignalBadge :state="s.state" />
              <span class="tp-num">{{
                num(s.last_price) === null ? '—' : dec(s.last_price, 2)
              }}</span>
              <span class="tp-num" :class="(num(s.change_pct) ?? 0) >= 0 ? 'is-up' : 'is-down'">{{
                num(s.change_pct) === null ? '—' : `${signed(s.change_pct, 2)}%`
              }}</span>
              <span class="tp-num mm__dim">
                <template v-if="col.key === 'unusual'">{{
                  num(s.rvol) === null ? '' : `${dec(s.rvol, 1)}× vol`
                }}</template>
                <template v-else>{{
                  num(s.trend_score) === null ? '' : `score ${dec(s.trend_score, 0)}`
                }}</template>
              </span>
            </button>
          </li>
        </ol>
        <EmptyState
          v-else
          glyph="🕊️"
          title="Nothing ranked"
          description="The latest run ranked no stocks here."
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.mm {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.mm__grid {
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
  grid-template-columns: 96px auto minmax(0, 1fr) 64px 80px;
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
.mm__row > :nth-child(3),
.mm__row > :nth-child(4),
.mm__row > :nth-child(5) {
  text-align: right;
}
.mm__row:hover {
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
}
.mm__row:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.mm__sym {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: var(--weight-semibold);
}
.mm__dim {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.is-up {
  color: var(--theme-success);
}
.is-down {
  color: var(--theme-danger);
}
</style>

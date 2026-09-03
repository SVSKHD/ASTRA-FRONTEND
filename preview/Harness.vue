<script setup lang="ts">
import { computed, ref } from 'vue'
import AccountBlock from '@/components/trades/AccountBlock.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import TradeCalendar from '@/components/trades/TradeCalendar.vue'
import TradeTable from '@/components/trades/TradeTable.vue'
import SecuredLedger from '@/components/trades/SecuredLedger.vue'
import TradeForm from '@/components/trades/TradeForm.vue'
import {
  DEFAULT_LOGGER_SETTINGS,
  accountTotals,
  targetProgress,
  tradeStats,
} from '@/utils/tradeMath'
import type { SecuredEntry, Trade, TradeSession, TradeSide } from '@/types'

const MONTH = '2026-09'
const settings = {
  ...DEFAULT_LOGGER_SETTINGS,
  startingBalance: 25000,
  dayTarget: 10,
  monthTarget: 50,
}

function t(
  id: string,
  day: number,
  side: TradeSide,
  session: TradeSession,
  entry: number,
  exit: number,
  lot = 1,
): Trade {
  const move = side === 'buy' ? exit - entry : entry - exit
  return {
    id,
    date: `${MONTH}-${String(day).padStart(2, '0')}`,
    ts: day * 1000,
    symbol: 'XAUUSD',
    session,
    side,
    lot,
    entry,
    exit,
    move,
    pl: move * lot * 100,
    note: '',
    createdAt: 0,
  }
}

const trades = ref<Trade[]>([
  t('a', 1, 'buy', 'London', 2400, 2412),
  t('b', 1, 'sell', 'NY', 2415, 2409),
  t('c', 2, 'buy', 'Asia', 2402, 2400.5),
  t('d', 3, 'buy', 'London', 2390, 2404, 2),
  t('e', 4, 'sell', 'NY', 2420, 2426),
  t('f', 4, 'sell', 'London', 2418, 2411),
  t('g', 8, 'buy', 'Asia', 2430, 2433),
  t('h', 9, 'buy', 'London', 2440, 2421),
  t('i', 10, 'sell', 'NY', 2450, 2438, 1.5),
  t('j', 11, 'buy', 'London', 2455, 2455),
  t('k', 15, 'buy', 'NY', 2460, 2482),
  t('l', 16, 'sell', 'Asia', 2470, 2466),
])
const secured = ref<SecuredEntry[]>([
  { id: 's1', date: '2026-09-05', amt: 1200, note: 'Withdrawn to bank', createdAt: 0 },
])

const selected = ref('')
const totals = computed(() => accountTotals(trades.value, secured.value, settings.startingBalance))
const stats = computed(() => tradeStats(trades.value))
const dayProgress = computed(() => targetProgress(6, settings.dayTarget))
const monthProgress = computed(() => targetProgress(stats.value.totalMove, settings.monthTarget))
const visible = computed(() =>
  selected.value ? trades.value.filter((x) => x.date === selected.value) : trades.value,
)
</script>

<template>
  <main class="harness">
    <AccountBlock
      :balance="totals.balance"
      :secured="totals.securedTotal"
      :total-profit="totals.totalProfit"
      period="September 2026"
    />
    <section class="harness__targets">
      <div>
        <span class="ui-label">Today · move</span>
        <ProgressBar :value="dayProgress.pct" label="Today" />
      </div>
      <div>
        <span class="ui-label">Month to date · move</span>
        <ProgressBar :value="monthProgress.pct" label="Month" />
      </div>
    </section>
    <div class="harness__split">
      <TradeCalendar
        :trades="trades"
        :day-target="settings.dayTarget"
        :selected="selected"
        @update:selected="selected = $event"
      />
      <TradeForm :settings="settings" />
    </div>
    <TradeTable
      :trades="visible"
      empty-title="No trades this month"
      empty-description="Log the first one above."
    />
    <SecuredLedger :entries="secured" :total="totals.securedTotal" />
  </main>
</template>

<style>
/* The app paints its own page behind the stage; the harness has to say so or
   every glass token is measured against a white browser default. */
body {
  background: var(--theme-surface);
  color: var(--theme-text);
}
</style>

<style scoped>
.harness {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--sp-5);
  min-width: 0;
}
.harness__targets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-4);
}
.harness__split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
  gap: var(--sp-4);
}
</style>

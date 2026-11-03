<script setup lang="ts">
// Market panel of the MT5 dashboard: per symbol open/closed, the session (from
// UTC on the server, plus what the bot reported), last price and a price + EMA
// chart from the bars the bot pushed. Usually only the execution timeframe is
// pushed; a higher one (e.g. M15) appears only when the bot's HTF align is on,
// so a timeframe without bars says so instead of drawing an empty chart.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import CandleChart from './CandleChart.vue'
import SourceTag from './SourceTag.vue'
import { dec, when } from '@/trading/format'
import { sessionLabel, toChart, type Mt5Market } from '@/trading/mt5'

const props = defineProps<{ market: Mt5Market; timeframe: string; timeframes: string[] }>()
const emit = defineEmits<{ 'update:timeframe': [tf: string] }>()

const tfOptions = computed(() =>
  [...new Set([...props.timeframes, props.timeframe])].map((t) => ({ value: t, label: t })),
)

const rows = computed(() =>
  props.market.symbols.map((s) => ({
    s,
    chart: toChart(s.candles, s.ema_periods),
  })),
)
</script>

<template>
  <Card>
    <template #header>
      <div class="tp-head">
        <span class="tp-title">Market</span>
        <div class="tp-row">
          <Badge tone="info" :label="`Session: ${sessionLabel(market.session)}`" />
          <SourceTag source="broker" />
        </div>
      </div>
    </template>
    <div v-if="tfOptions.length > 1" class="tp-row">
      <SegmentedControl
        :model-value="timeframe"
        :options="tfOptions"
        size="sm"
        aria-label="Chart timeframe"
        @update:model-value="(v: string) => emit('update:timeframe', v)"
      />
    </div>
    <p v-if="!rows.length" class="tp-note">The bot has not reported any symbol yet.</p>
    <section v-for="r in rows" :key="r.s.symbol" class="mm__sym" :aria-label="r.s.symbol">
      <div class="tp-head">
        <span class="tp-strong">{{ r.s.symbol }}</span>
        <div class="tp-row">
          <Badge
            :tone="r.s.open === null ? 'neutral' : r.s.open ? 'success' : 'warning'"
            :label="r.s.open === null ? 'Market ?' : r.s.open ? 'Open' : 'Closed'"
          />
          <Badge
            v-if="r.s.bot_session"
            tone="neutral"
            :label="`Bot: ${sessionLabel(r.s.bot_session)}`"
          />
        </div>
      </div>
      <div class="tp-row mm__nums">
        <span class="tp-note"
          >Last <strong class="tp-strong tp-num">{{ dec(r.s.last_price) }}</strong></span
        >
        <span class="tp-note">at {{ when(r.s.last_price_at) }}</span>
        <span v-if="r.s.tick_age_s !== null" class="tp-note tp-num"
          >tick {{ dec(r.s.tick_age_s, 1) }} s old</span
        >
      </div>
      <CandleChart
        v-if="r.chart.candles.length"
        :candles="r.chart.candles"
        :lines="r.chart.lines"
        :height="220"
      />
      <p v-else class="tp-note">
        No {{ r.s.timeframe }} bars pushed for {{ r.s.symbol }} (the bot sends its execution
        timeframe; higher ones only with HTF align on).
      </p>
    </section>
  </Card>
</template>

<style scoped>
.mm__sym {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--glass-border, var(--theme-border));
  min-width: 0;
}
.mm__sym:last-child {
  border-bottom: 0;
}
.mm__nums {
  gap: var(--sp-3);
}
</style>

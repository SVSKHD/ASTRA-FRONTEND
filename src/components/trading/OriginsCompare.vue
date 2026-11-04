<script setup lang="ts">
// My trading vs the bot's over the selected period: the same numbers side by
// side, who did better on net P&L, and — quietly — whether the split adds up
// (manual + bot + unknown = the account's total from its deals).
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Table from '@/components/ui/Table.vue'
import SourceTag from './SourceTag.vue'
import { dec, pct, signed } from '@/trading/format'
import { compareOrigins, duration, type OriginStats, type TradeStatsOut } from '@/trading/origins'

const props = defineProps<{
  stats: TradeStatsOut | null
  loading?: boolean
  error?: string
  periodLabel: string
}>()
defineEmits<{ retry: [] }>()

const cmp = computed(() => compareOrigins(props.stats))
const cur = computed(() => props.stats?.currency || '')

const METRICS: { key: string; label: string; fmt: (s: OriginStats) => string }[] = [
  { key: 'net', label: 'Net P&L', fmt: (s) => signed(s.net, 2) },
  { key: 'trades', label: 'Trades', fmt: (s) => String(s.trades) },
  { key: 'win_rate', label: 'Win rate', fmt: (s) => pct(s.win_rate) },
  { key: 'avg_r', label: 'Avg R', fmt: (s) => dec(s.avg_r, 2) },
  { key: 'max_drawdown', label: 'Max drawdown', fmt: (s) => dec(s.max_drawdown, 2) },
  { key: 'avg_duration_s', label: 'Avg duration', fmt: (s) => duration(s.avg_duration_s) },
]
const rows = computed(() =>
  METRICS.map((m) => ({
    id: m.key,
    metric: m.label,
    manual: cmp.value.manual ? m.fmt(cmp.value.manual) : '—',
    bot: cmp.value.bot ? m.fmt(cmp.value.bot) : '—',
  })),
)

const verdict = computed(() => {
  const c = cmp.value
  const by = c.diff ? dec(c.diff.replace(/^-/, ''), 2) : ''
  const unit = cur.value ? ` ${cur.value}` : ''
  if (c.winner === 'manual') return `You did better by ${by}${unit}.`
  if (c.winner === 'bot') return `The bot did better by ${by}${unit}.`
  if (c.winner === 'tie') return 'Even: the same net P&L.'
  return ''
})

const check = computed(() => props.stats?.check ?? null)
</script>

<template>
  <Card>
    <template #header>
      <div class="tp-head">
        <span class="tp-title">Me vs the bot · {{ periodLabel }}</span>
        <SourceTag source="calculated" />
      </div>
    </template>

    <p v-if="loading && !stats" class="tp-note">Comparing…</p>
    <template v-else-if="error && !stats">
      <p class="tp-note" role="alert">Could not load the comparison: {{ error }}</p>
      <Button size="sm" @click="$emit('retry')">Try again</Button>
    </template>
    <p v-else-if="stats && !cmp.winner" class="tp-note">
      Neither you nor the bot closed a trade in this period.
    </p>
    <template v-else-if="stats">
      <div class="tp-row">
        <Badge
          :tone="cmp.winner === 'tie' ? 'neutral' : 'success'"
          :label="
            cmp.winner === 'manual' ? 'You lead' : cmp.winner === 'bot' ? 'Bot leads' : 'Even'
          "
        />
        <span class="tp-strong" data-test="verdict">{{ verdict }}</span>
      </div>
      <Table
        :columns="[
          { key: 'metric', label: '' },
          { key: 'manual', label: 'My trading', align: 'right' },
          { key: 'bot', label: 'Bot trading', align: 'right' },
        ]"
        :rows="rows"
        caption="My trading vs bot trading"
      />
    </template>

    <p
      v-if="check"
      class="tp-note tp-num"
      :class="{ oc__bad: !check.ok }"
      data-test="split-check"
      :role="check.ok ? undefined : 'alert'"
    >
      Split check: manual + bot + unknown = {{ signed(check.split_sum_net, 2) }} · account total
      {{ signed(check.account_total_net, 2) }} ·
      {{ check.ok ? 'ok' : 'MISMATCH — some deals are missing or misclassified' }}
    </p>
  </Card>
</template>

<style scoped>
.oc__bad {
  color: var(--theme-danger);
}
</style>

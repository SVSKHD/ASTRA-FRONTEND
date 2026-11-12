<script setup lang="ts">
// This month's AI spend (GET /api/ai/usage, src/ai/costs.ts), from the base kit:
// a StatRow for the month (spent, cap, left, calls) over a ProgressBar, and a
// ProgressBar per budget (investments, business, chat, reserve). A bar turns to
// the warning colour at 80 % and to danger at the cap — where the server refuses
// the next call (`budget_exceeded`). The tone is the ProgressBar's own accent
// tokens re-pointed, so the bar itself is the kit's, unchanged.
//
// The caps themselves are settings (AI_MONTHLY_BUDGET_USD, AI_AGENT_BUDGETS_USD),
// changed under Settings → AI. `compact` drops the per-budget hints, for the strip
// at the top of that settings category.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import StatRow, { type Stat } from '@/components/ui/StatRow.vue'
import {
  BUDGET_HINT,
  BUDGET_LABEL,
  levelOf,
  num,
  orderedBudgets,
  resetsOn,
  usd,
  type AiUsage,
} from '@/ai/costs'

const props = defineProps<{ usage: AiUsage; compact?: boolean; settingsLink?: boolean }>()
const router = useRouter()

const monthLevel = computed(() => levelOf(props.usage.spent_usd, props.usage.limit_usd))
const resets = computed(() => resetsOn(props.usage.resets_at))
const stats = computed<Stat[]>(() => [
  {
    label: 'Spent',
    value: usd(props.usage.spent_usd),
    note: num(props.usage.limit_usd) > 0 ? `of ${usd(props.usage.limit_usd)}` : 'no cap',
  },
  {
    label: 'Left',
    value: usd(props.usage.remaining_usd),
    tone: monthLevel.value === 'over' ? 'negative' : undefined,
    note: resets.value ? `resets ${resets.value}` : undefined,
  },
  { label: 'Calls', value: props.usage.calls.toLocaleString() },
])
const budgets = computed(() =>
  orderedBudgets(props.usage).map((b) => ({
    ...b,
    label: BUDGET_LABEL[b.budget] ?? b.budget,
    hint: BUDGET_HINT[b.budget] ?? '',
    level: levelOf(b.spent_usd, b.limit_usd),
  })),
)
/** A ProgressBar's value and max; a zero cap with spend shows full. */
const bar = (spent: string, limit: string) => {
  const cap = num(limit)
  return cap > 0
    ? { value: Math.min(num(spent), cap), max: cap }
    : { value: num(spent) > 0 ? 1 : 0, max: 1 }
}
</script>

<template>
  <Card title="AI spend this month" data-testid="budget">
    <p v-if="!usage.configured" class="tp-note" role="status" data-testid="not-configured">
      Claude is not set up yet (no ANTHROPIC_API_KEY), so nothing is being spent.
    </p>

    <div class="bc__month" :class="`is-${monthLevel}`">
      <div class="bc__head">
        <span class="tp-strong" data-testid="month-spend"
          >Month to date: {{ usd(usage.spent_usd) }} of
          {{ num(usage.limit_usd) > 0 ? usd(usage.limit_usd) : 'no cap' }}</span
        >
        <Badge v-if="monthLevel === 'over'" tone="danger" label="Budget reached" />
        <Badge v-else-if="monthLevel === 'warn'" tone="warning" label="Over 80 %" />
      </div>
      <StatRow :stats="stats" />
      <ProgressBar
        v-bind="bar(usage.spent_usd, usage.limit_usd)"
        size="lg"
        label="Spent this month"
      />
    </div>

    <ul class="bc__rows" aria-label="Spend by budget">
      <li
        v-for="b in budgets"
        :key="b.budget"
        class="bc__row"
        :class="`is-${b.level}`"
        :data-budget="b.budget"
      >
        <div class="bc__head">
          <span class="tp-strong">{{ b.label }}</span>
          <span class="tp-num bc__amt">{{ usd(b.spent_usd) }} / {{ usd(b.limit_usd) }}</span>
        </div>
        <ProgressBar
          v-bind="bar(b.spent_usd, b.limit_usd)"
          size="sm"
          :label="`${b.label} spent this month`"
        />
        <span v-if="!compact && b.hint" class="tp-note">{{ b.hint }}</span>
        <Badge v-if="b.level === 'over'" tone="danger" label="Cap reached: calls stop" />
        <Badge v-else-if="b.level === 'warn'" tone="warning" label="Over 80 % used" />
      </li>
    </ul>

    <div v-if="settingsLink" class="tp-row">
      <Button size="sm" variant="ghost" @click="router.push('/dev/settings?category=ai')"
        >Change the caps in Settings → AI</Button
      >
    </div>
  </Card>
</template>

<style scoped>
.bc__month {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.bc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.bc__amt {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.bc__rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-4);
  min-width: 0;
  margin: var(--sp-4) 0 0;
  padding: 0;
  list-style: none;
}
.bc__row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
.bc__row > * {
  max-width: 100%;
}
.bc__row .bc__head,
.bc__row :deep(.ui-progress) {
  align-self: stretch;
}
/* The kit's ProgressBar draws its fill from the accent tokens: re-pointed here. */
.is-warn {
  --accent-grad-from: var(--theme-warning);
  --accent-grad-to: var(--theme-warning);
}
.is-over {
  --accent-grad-from: var(--theme-danger);
  --accent-grad-to: var(--theme-danger);
}
</style>

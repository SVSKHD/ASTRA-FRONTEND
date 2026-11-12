<script setup lang="ts">
// This month's AI spend (GET /api/ai/usage, src/ai/costs.ts): one meter for the
// month against AI_MONTHLY_BUDGET_USD and one per budget (investments, business,
// chat, reserve) against its own cap. A meter turns to a warning at 80 % and to
// danger at the cap — where the server refuses the next call (`budget_exceeded`).
//
// The caps themselves are settings (AI_MONTHLY_BUDGET_USD, AI_AGENT_BUDGETS_USD),
// changed under Settings → AI. `compact` drops the per-budget hints, for the strip
// at the top of that settings category.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import {
  BUDGET_HINT,
  BUDGET_LABEL,
  levelOf,
  num,
  orderedBudgets,
  resetsOn,
  usd,
  usedPct,
  type AiUsage,
} from '@/ai/costs'

const props = defineProps<{ usage: AiUsage; compact?: boolean; settingsLink?: boolean }>()
const router = useRouter()

const monthPct = computed(() => usedPct(props.usage.spent_usd, props.usage.limit_usd))
const monthLevel = computed(() => levelOf(props.usage.spent_usd, props.usage.limit_usd))
const budgets = computed(() =>
  orderedBudgets(props.usage).map((b) => ({
    ...b,
    label: BUDGET_LABEL[b.budget] ?? b.budget,
    hint: BUDGET_HINT[b.budget] ?? '',
    pct: usedPct(b.spent_usd, b.limit_usd),
    level: levelOf(b.spent_usd, b.limit_usd),
  })),
)
const resets = computed(() => resetsOn(props.usage.resets_at))
</script>

<template>
  <Card title="AI spend this month" data-testid="budget">
    <p v-if="!usage.configured" class="cc-notice" role="status" data-testid="not-configured">
      Claude is not set up yet (no ANTHROPIC_API_KEY), so nothing is being spent.
    </p>

    <div class="bc__month" :class="`is-${monthLevel}`">
      <div class="bc__head">
        <span class="tp-strong">Month to date</span>
        <Badge v-if="monthLevel === 'over'" tone="danger" label="Budget reached" />
        <Badge v-else-if="monthLevel === 'warn'" tone="warning" label="Over 80 %" />
      </div>
      <span class="bc__big tp-num" data-testid="month-spend"
        >{{ usd(usage.spent_usd) }}
        <span class="bc__of"
          >of {{ num(usage.limit_usd) > 0 ? usd(usage.limit_usd) : 'no cap' }}</span
        >
      </span>
      <div
        v-if="monthPct !== null"
        class="bc__bar bc__bar--lg"
        role="meter"
        aria-label="Spent this month"
        :aria-valuenow="monthPct"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuetext="`${usd(usage.spent_usd)} of ${usd(usage.limit_usd)}`"
      >
        <span class="bc__fill" :style="{ width: `${monthPct}%` }" />
      </div>
      <span class="tp-note"
        >{{ usd(usage.remaining_usd) }} left · {{ usage.calls.toLocaleString() }} call{{
          usage.calls === 1 ? '' : 's'
        }}{{ resets ? ` · resets ${resets}` : '' }}</span
      >
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
        <div
          class="bc__bar"
          role="meter"
          :aria-label="`${b.label} spent this month`"
          :aria-valuenow="b.pct ?? 0"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            class="bc__fill"
            :style="{ width: `${b.pct ?? (num(b.spent_usd) > 0 ? 100 : 0)}%` }"
          />
        </div>
        <span v-if="!compact && b.hint" class="tp-note">{{ b.hint }}</span>
        <span v-if="b.level === 'over'" class="bc__warn" role="status"
          >Cap reached: calls stop</span
        >
        <span v-else-if="b.level === 'warn'" class="bc__warn" role="status">Over 80 % used</span>
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
  gap: 4px;
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
.bc__big {
  font-size: var(--text-2xl, var(--text-xl));
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.bc__of {
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  color: var(--text-secondary);
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
  gap: 4px;
  min-width: 0;
}
.bc__bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: color-mix(in oklch, var(--text-secondary) 20%, transparent);
}
.bc__bar--lg {
  height: 10px;
}
.bc__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  transition: width 0.3s ease;
}
.is-warn .bc__fill {
  background: var(--theme-warning);
}
.is-over .bc__fill {
  background: var(--theme-danger);
}
.bc__warn {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.is-warn .bc__warn {
  color: var(--theme-warning);
}
.is-over .bc__warn {
  color: var(--theme-danger);
}
@media (prefers-reduced-motion: reduce) {
  .bc__fill {
    transition: none;
  }
}
</style>

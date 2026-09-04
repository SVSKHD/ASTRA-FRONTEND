<script setup lang="ts">
// The same account grammar, on the other side of the desk (section 35).
//
// It reads as `AccountBlock` because it IS the same sentence in a different
// tense: three figures, three glyphs, three meanings that must not be confused,
// on the raised layer with the same roll and the same tabular numerals. A
// second visual language for the cheaper half of the same desk would be a
// second thing to learn for nothing.
//
// Two differences, both from the model rather than from taste. The figures are
// never signed, because an expense is a size. And the fourth cell — trading
// profit less what was spent — appears only when the user has said expenses net
// against profit: with the setting off, "money spent" and "money made trading"
// are two answers and adding them produces a third that answers neither.
import { computed } from 'vue'
import IconBalance from '@/components/icons/IconBalance.vue'
import IconSecured from '@/components/icons/IconSecured.vue'
import IconProfit from '@/components/icons/IconProfit.vue'
import { useCountUp } from '@/composables/useCountUp'
import { amount2, signed2 } from '@/utils/format'
import { signOf } from '@/utils/tradeMath'
import type { ExpenseTotals } from '@/utils/expenseMath'

const props = defineProps<{
  totals: ExpenseTotals
  netAfter: number
  netExpenses: boolean
  /** What the figures are scoped to — "September 2026". */
  period: string
}>()

const spent = useCountUp(() => props.totals.spent)
const remaining = useCountUp(() => props.totals.remaining)
const perDay = useCountUp(() => props.totals.perDay)
const net = useCountUp(() => props.netAfter)
const netSign = computed(() => signOf(props.netAfter))
/** Over budget is a fact about the remainder, and it is the only red here. */
const over = computed(() => props.totals.budget > 0 && props.totals.remaining < 0)
</script>

<template>
  <dl class="acct">
    <div class="acct__cell">
      <dt class="acct__label">
        <IconBalance :size="16" />
        <span>Spent this month</span>
      </dt>
      <dd class="acct__value ui-tabular">{{ amount2(spent) }}</dd>
      <dd class="acct__note">{{ period }}</dd>
    </div>

    <div class="acct__cell">
      <dt class="acct__label">
        <IconSecured :size="16" />
        <span>Budget remaining</span>
      </dt>
      <dd class="acct__value ui-tabular" :class="{ 'is-neg': over }">
        {{ totals.budget > 0 ? amount2(remaining) : '—' }}
      </dd>
      <dd class="acct__note">
        {{
          totals.budget > 0
            ? over
              ? 'over budget'
              : `of ${amount2(totals.budget)}`
            : 'no budget set'
        }}
      </dd>
    </div>

    <div class="acct__cell">
      <dt class="acct__label">
        <IconProfit :size="16" />
        <span>Average per day</span>
      </dt>
      <dd class="acct__value ui-tabular">{{ amount2(perDay) }}</dd>
      <!-- Days ELAPSED, said out loud: divided by the days in the month it
           would flatter every month that is only a week old. -->
      <dd class="acct__note">days so far</dd>
    </div>

    <div v-if="netExpenses" class="acct__cell">
      <dt class="acct__label">
        <IconProfit :size="16" />
        <span>Net after expenses</span>
      </dt>
      <!-- The one signed figure on the tab, and it is signed because it is a
           net: it can genuinely go either way. -->
      <dd class="acct__value ui-tabular" :class="`is-${netSign}`">{{ signed2(net) }}</dd>
      <dd class="acct__note">trades less spend</dd>
    </div>
  </dl>
</template>

<style scoped>
.acct {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-3);
  margin: 0;
  min-width: 0;
  padding: var(--sp-4);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.acct__cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.acct__label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  /* Secondary, not muted: the label is the half of the pair that says what the
     number means, so it clears the contrast floor. */
  color: var(--text-secondary, var(--theme-dim));
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.acct__value {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  line-height: var(--lh-xl);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
  font-variant-numeric: tabular-nums;
}
.acct__value.is-pos {
  color: var(--theme-success);
}
.acct__value.is-neg {
  color: var(--theme-danger);
}
.acct__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>

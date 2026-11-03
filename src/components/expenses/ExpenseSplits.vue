<script setup lang="ts">
// Where the money went, three ways (section 35b).
//
//   • PAID WITH — credit card against the bank and cash, because card spend is
//     money still owed and is the figure the statement will ask for.
//   • NEED — essential, lifestyle, avoidable. The avoidable band is the wasted
//     money, and it is the only red one.
//   • 50/30/20 — the month against the usual split of income. Only with an
//     income; a share of nothing is not a figure.
//
// Each band is a stacked bar with the figures beside it in words, so the bar is
// a glance and the list is the reading.
import { computed } from 'vue'
import { amount2 } from '@/utils/format'
import { byMethod, byNeed, ruleSplit, RULE_TARGET, type SplitPart } from '@/utils/expensePlan'
import type { Expense } from '@/types'

const props = defineProps<{ expenses: Expense[]; income: number }>()

const methods = computed(() => byMethod(props.expenses))
const needs = computed(() => byNeed(props.expenses))
const rule = computed(() => ruleSplit(props.expenses, props.income))
const empty = computed(() => props.expenses.length === 0)

function segments<K extends string>(parts: SplitPart<K>[]) {
  return parts.filter((p) => p.amount > 0)
}
</script>

<template>
  <section class="split">
    <div class="split__card">
      <h3 class="ui-label">Paid with</h3>
      <div v-if="!empty" class="split__bar" aria-hidden="true">
        <span
          v-for="p in segments(methods)"
          :key="p.key"
          class="split__seg"
          :class="`is-${p.key}`"
          :style="{ flexGrow: p.amount }"
        ></span>
      </div>
      <ul class="split__list">
        <li v-for="p in methods" :key="p.key" class="split__row">
          <span class="split__key" :class="`is-${p.key}`" aria-hidden="true"></span>
          <span class="split__name">{{ p.label }}</span>
          <span class="split__share">{{ p.share.toFixed(0) }}%</span>
          <span class="split__amt ui-tabular">{{ amount2(p.amount) }}</span>
        </li>
      </ul>
    </div>

    <div class="split__card">
      <h3 class="ui-label">Was it needed</h3>
      <div v-if="!empty" class="split__bar" aria-hidden="true">
        <span
          v-for="p in segments(needs)"
          :key="p.key"
          class="split__seg"
          :class="`is-${p.key}`"
          :style="{ flexGrow: p.amount }"
        ></span>
      </div>
      <ul class="split__list">
        <li v-for="p in needs" :key="p.key" class="split__row">
          <span class="split__key" :class="`is-${p.key}`" aria-hidden="true"></span>
          <span class="split__name">{{ p.label }}</span>
          <span class="split__share">{{ p.share.toFixed(0) }}%</span>
          <span
            class="split__amt ui-tabular"
            :class="{ 'is-waste': p.key === 'avoidable' && p.amount > 0 }"
          >
            {{ amount2(p.amount) }}
          </span>
        </li>
      </ul>
    </div>

    <div class="split__card">
      <h3 class="ui-label">
        {{ RULE_TARGET.needs }}/{{ RULE_TARGET.wants }}/{{ RULE_TARGET.savings }} of income
      </h3>
      <ul v-if="rule.length" class="split__rule">
        <li v-for="r in rule" :key="r.key" class="split__ruleRow">
          <div class="split__ruleHead">
            <span class="split__name">{{ r.label }}</span>
            <span class="split__amt ui-tabular">
              {{ amount2(r.actual) }} <span class="split__of">of {{ amount2(r.target) }}</span>
            </span>
          </div>
          <div class="split__track">
            <span
              class="split__ruleFill"
              :class="{
                'is-bad': r.key === 'savings' ? r.actual < r.target : r.actual > r.target,
                'is-good': r.key === 'savings' ? r.actual >= r.target : r.actual <= r.target,
              }"
              :style="{ width: `${Math.min(100, (r.actual / (r.target || 1)) * 100)}%` }"
            ></span>
          </div>
          <span class="split__ruleNote">
            {{ r.share.toFixed(0) }}% of income against {{ RULE_TARGET[r.key] }}% —
            {{
              r.key === 'savings'
                ? r.actual >= r.target
                  ? 'on target'
                  : `${amount2(r.target - r.actual)} short`
                : r.actual <= r.target
                  ? 'within'
                  : `${amount2(r.actual - r.target)} over`
            }}
          </span>
        </li>
      </ul>
      <p v-else class="split__empty">
        Set a monthly income in the capital panel to compare needs, wants and savings against it.
      </p>
    </div>
  </section>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
}
.split__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.split__card h3 {
  margin: 0;
}
.split__bar {
  display: flex;
  gap: 2px;
  height: 10px;
  min-width: 0;
  border-radius: 999px;
  overflow: hidden;
}
.split__seg {
  flex-basis: 0;
  min-width: 2px;
}
.split__list,
.split__rule {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.split__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.split__row {
  margin: 0 calc(-1 * var(--sp-2));
  padding: 2px var(--sp-2);
  border-radius: var(--radius-sm);
}
.split__row:hover {
  background: color-mix(in oklch, var(--theme-accent) 7%, transparent);
}
.split__key {
  display: inline-block;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.split__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.split__share {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-muted, var(--theme-dim));
}
.split__amt {
  min-width: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.split__amt.is-waste {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.split__of {
  font-size: var(--text-xs);
  color: var(--text-muted, var(--theme-dim));
}

/* One identity per band. Card is the accent because it is the one that is
   owed; avoidable is the danger token because it is the waste. */
.is-card,
.is-essential {
  background: var(--theme-accent);
}
.is-debit,
.is-lifestyle {
  background: color-mix(in oklch, var(--theme-accent) 45%, var(--theme-dim));
}
.is-cash {
  background: color-mix(in oklch, var(--theme-dim) 55%, transparent);
}
.is-avoidable {
  background: var(--theme-danger);
}

.split__ruleRow {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.split__ruleHead {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.split__track {
  position: relative;
  height: 6px;
  min-width: 0;
  border-radius: 999px;
  background: color-mix(in oklch, var(--theme-dim) 18%, transparent);
  overflow: hidden;
}
.split__ruleFill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--theme-accent);
}
.split__ruleFill.is-good {
  background: var(--theme-success);
}
.split__ruleFill.is-bad {
  background: var(--theme-danger);
}
.split__ruleNote,
.split__empty {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>

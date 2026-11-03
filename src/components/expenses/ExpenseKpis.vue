<script setup lang="ts">
// Every figure the plan produces, one tile each (section 35b).
//
// The account block above answers "how much"; these answer "and is that
// fine". Each tile is a label, a figure and one line saying what the figure is
// measured against — a number with no reference is a number nobody can act on.
//
// Colour is used only where the figure has a direction: kept versus overspent,
// ahead of plan versus behind, and the avoidable spend. Every coloured figure
// also says which way it went in words, so colour carries no information alone.
import { computed } from 'vue'
import { amount2 } from '@/utils/format'
import type { ExpenseKpis } from '@/utils/expensePlan'

const props = defineProps<{ kpis: ExpenseKpis }>()

type Tone = 'pos' | 'neg' | 'warn' | ''

interface Tile {
  key: string
  label: string
  value: string
  note: string
  tone: Tone
}

const tiles = computed<Tile[]>(() => {
  const k = props.kpis
  const hasBudget = k.budget > 0
  const out: Tile[] = [
    {
      key: 'kept',
      label: 'Saved from income',
      value: k.kept === null ? '—' : amount2(k.kept),
      note:
        k.kept === null
          ? 'set an income to see it'
          : k.kept >= 0
            ? `${k.savingsRate?.toFixed(0)}% of ${amount2(k.income)} kept`
            : `overspent income by ${amount2(k.kept)}`,
      tone: k.kept === null ? '' : k.kept >= 0 ? 'pos' : 'neg',
    },
    {
      key: 'pace',
      label: hasBudget ? (k.vsPace >= 0 ? 'Saved vs plan' : 'Over plan') : 'Saved vs plan',
      value: hasBudget ? amount2(k.vsPace) : '—',
      note: hasBudget
        ? k.vsPace >= 0
          ? 'under the even-spend line'
          : 'above the even-spend line'
        : 'needs a budget',
      tone: hasBudget ? (k.vsPace >= 0 ? 'pos' : 'neg') : '',
    },
    {
      key: 'projected',
      label: 'Projected month end',
      value: amount2(k.projected),
      note: hasBudget
        ? k.projected > k.budget
          ? `${amount2(k.projected - k.budget)} over budget`
          : `${amount2(k.budget - k.projected)} under budget`
        : 'recurring once, one-offs at today’s rate',
      tone: hasBudget && k.projected > k.budget ? 'warn' : '',
    },
    {
      key: 'safe',
      label: 'Safe to spend / day',
      value: k.safePerDay === null ? '—' : amount2(k.safePerDay),
      note:
        k.safePerDay === null
          ? k.daysLeft === 0
            ? 'the month is over'
            : 'needs a budget'
          : `for the ${k.daysLeft} days left`,
      tone: '',
    },
    {
      key: 'card',
      label: 'On credit cards',
      value: amount2(k.card),
      note: `${k.cardShare.toFixed(0)}% of spend · still owed`,
      tone: k.cardShare >= 60 ? 'warn' : '',
    },
    {
      key: 'avoidable',
      label: 'Wasted (avoidable)',
      value: amount2(k.avoidable),
      note:
        k.avoidable > 0 ? `${k.avoidableShare.toFixed(0)}% of spend` : 'nothing avoidable logged',
      tone: k.avoidable > 0 ? 'neg' : '',
    },
    {
      key: 'recurring',
      label: 'Recurring commitments',
      value: amount2(k.recurring),
      note: 'monthly rows this month',
      tone: '',
    },
    {
      key: 'allocated',
      label: 'Capital assigned',
      value: amount2(k.allocated),
      note: !hasBudget
        ? 'no budget to assign from'
        : k.unallocated >= 0
          ? `${amount2(k.unallocated)} not assigned`
          : `${amount2(k.unallocated)} more than the budget`,
      tone: hasBudget && k.unallocated < 0 ? 'warn' : '',
    },
    {
      key: 'over',
      label: 'Categories over',
      value: String(k.overCategories),
      note: k.overCategories ? 'over or pacing over capital' : 'all within capital',
      tone: k.overCategories ? 'warn' : '',
    },
    {
      key: 'top',
      label: 'Largest category',
      value: k.largestCategory ? amount2(k.largestCategory.amount) : '—',
      note: k.largestCategory?.category ?? 'nothing spent yet',
      tone: '',
    },
    {
      key: 'biggest',
      label: 'Biggest single spend',
      value: k.biggest ? amount2(k.biggest.amount) : '—',
      note: k.biggest ? `${k.biggest.category} · ${k.biggest.date}` : 'nothing spent yet',
      tone: '',
    },
    {
      key: 'ticket',
      label: 'Average spend',
      value: amount2(k.avgTicket),
      note: `across ${k.count} ${k.count === 1 ? 'expense' : 'expenses'}`,
      tone: '',
    },
  ]
  return out
})
</script>

<template>
  <section class="ekpi" aria-label="Spending indicators">
    <dl class="ekpi__grid">
      <div v-for="t in tiles" :key="t.key" class="ekpi__tile" :data-kpi="t.key">
        <dt class="ekpi__label">{{ t.label }}</dt>
        <dd class="ekpi__value ui-tabular" :class="t.tone && `is-${t.tone}`">{{ t.value }}</dd>
        <dd class="ekpi__note">{{ t.note }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.ekpi {
  min-width: 0;
}
.ekpi__grid {
  display: grid;
  /* Twelve tiles: two even rows of six, then four rows of three, then six of
     two. auto-fill left a ragged seven-and-five. */
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
}
.ekpi__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
}
/* Colour only, over 120ms: a tint and a border in the accent. No lift and no
   shadow change — those repaint, and twelve of them under a moving pointer is
   what made this tab feel slow. */
.ekpi__tile {
  transition:
    background-color 120ms var(--ease-out),
    border-color 120ms var(--ease-out);
}
.ekpi__tile:hover {
  border-color: color-mix(in oklch, var(--theme-accent) 50%, transparent);
  background: color-mix(in oklch, var(--theme-accent) 6%, var(--layer-raised-bg));
}
@media (prefers-reduced-motion: reduce) {
  .ekpi__tile {
    transition: none;
  }
}
.ekpi__label {
  min-width: 0;
  color: var(--text-secondary, var(--theme-dim));
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ekpi__value {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
.ekpi__value.is-pos {
  color: var(--theme-success);
}
.ekpi__value.is-neg {
  color: var(--theme-danger);
}
.ekpi__value.is-warn {
  color: var(--theme-warning);
}
@media (max-width: 1200px) {
  .ekpi__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .ekpi__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.ekpi__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>

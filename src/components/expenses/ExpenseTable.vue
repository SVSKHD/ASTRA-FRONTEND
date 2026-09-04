<script setup lang="ts">
// The month's spending, in the trade table's clothes (section 35).
//
// Same treatment on purpose: sticky header, one date per day, a rail in the
// left channel, the delete revealed on approach. It is the same reading task on
// a different record, and a second table shaped differently would be a second
// thing to learn for no gain.
//
// One difference, and it is the model's: the rail here is not a sign. It is the
// depth of the day's spend on the single-hue ramp, so a heavy day is a darker
// bar rather than a red one. Nothing in this component is green or red.
import { computed } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import IconDelete from '@/components/icons/IconDelete.vue'
import { amount2, orDash } from '@/utils/format'
import { byDay, daysInMonth, spendStep, spendWashVar } from '@/utils/expenseMath'
import type { Expense } from '@/types'

const props = defineProps<{
  expenses: Expense[]
  budget: number
  month: string
  emptyTitle: string
  emptyDescription: string
}>()
defineEmits<{ delete: [string] }>()

const days = computed(() => byDay(props.expenses))

const firstOfDay = computed(() => {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const e of props.expenses) {
    if (seen.has(e.date)) continue
    seen.add(e.date)
    out.add(e.id)
  }
  return out
})

/** The rail: the day's total on the spend ramp, never the row's own sign. */
function railVar(expense: Expense) {
  const cell = days.value.get(expense.date)
  const step = spendStep(cell?.amount ?? expense.amount, props.budget, daysInMonth(props.month))
  return { '--row-rail': spendWashVar(step) }
}
</script>

<template>
  <div v-if="expenses.length" class="etable__wrap">
    <table class="etable">
      <caption class="ui-sr-only">
        Expenses, oldest first, grouped by date
      </caption>
      <thead>
        <tr>
          <th scope="col" class="etable__rail"><span class="ui-sr-only">Weight</span></th>
          <th scope="col">Date</th>
          <th scope="col">Category</th>
          <th scope="col">Note</th>
          <th scope="col">Repeats</th>
          <th scope="col" class="is-num">Amount</th>
          <th scope="col"><span class="ui-sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="e in expenses"
          :key="e.id"
          :class="{ 'is-dayStart': firstOfDay.has(e.id) }"
          :style="railVar(e)"
        >
          <td class="etable__rail" aria-hidden="true"></td>
          <td class="is-mono etable__date">
            <span v-if="firstOfDay.has(e.id)">{{ e.date }}</span>
            <span v-else class="ui-sr-only">{{ e.date }}</span>
          </td>
          <td>{{ e.category }}</td>
          <td class="etable__note" :title="e.note">{{ orDash(e.note) }}</td>
          <!-- Stated in words: a row that repeats is a commitment, and an icon
               alone leaves the reader guessing which kind. -->
          <td class="etable__kind">
            {{ e.kind === 'recurring' ? `Monthly, day ${e.recurDay ?? '—'}` : 'One-off' }}
          </td>
          <!-- Never signed. An expense is a size. -->
          <td class="is-num is-mono">{{ amount2(e.amount) }}</td>
          <td class="etable__act">
            <IconButton
              class="etable__del"
              :label="`Delete the ${e.category} expense on ${e.date}`"
              size="sm"
              @click="$emit('delete', e.id)"
            >
              <IconDelete :size="14" />
            </IconButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <EmptyState v-else :title="emptyTitle" :description="emptyDescription" />
</template>

<style scoped>
/* The page carries the height (section 42). No `max-height` and no vertical
   overflow: a list in a 420px window inside a page that could not scroll was
   two broken things agreeing with each other. Sideways only, and only where a
   phone needs it — an overflow of any kind makes this the scrollport a sticky
   header sticks to, which is the header's whole job undone. */
.etable__wrap {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.etable {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.etable th,
.etable td {
  padding: var(--sp-2) var(--sp-3);
  white-space: nowrap;
  text-align: left;
}
.etable thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  /* Opaque, and the one surface in the system that must be (section 43,
     item 3): rows scroll UNDER this, so a translucent header is a header
     with figures moving through it at exactly the moment it is read. */
  background: var(--glass-solid, var(--layer-overlay-bg));
  border-bottom: 1px solid var(--layer-raised-border);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.etable tbody tr.is-dayStart td {
  border-top: 1px solid var(--layer-raised-border);
}
.etable tbody tr:first-child td {
  border-top: none;
}
.etable tbody tr:hover td {
  background: color-mix(in oklch, var(--text-primary, currentcolor) 5%, transparent);
}
.etable th.etable__rail,
.etable td.etable__rail {
  width: 3px;
  min-width: 3px;
  padding: 0;
}
.etable tbody td.etable__rail {
  background: var(--row-rail);
}
.etable tbody tr.is-dayStart td.etable__rail {
  border-top: none;
}
.etable__date,
.etable__kind,
.etable__note {
  color: var(--text-secondary, var(--theme-dim));
}
/* The one column that may be long: it clamps rather than widening the table. */
.etable__note {
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.etable .is-num {
  text-align: right;
}
.etable .is-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.etable__act {
  width: 1%;
  text-align: right;
}
.etable__del {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.etable tbody tr:hover .etable__del,
.etable tbody tr:focus-within .etable__del {
  opacity: 1;
}
@media (hover: none) {
  .etable__del {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .etable__del {
    transition: none;
  }
}

/* The phone's bargain: sideways scrolling instead of a page-sticky header. */
@media (max-width: 700px) {
  .etable__wrap {
    overflow-x: auto;
  }
}
</style>

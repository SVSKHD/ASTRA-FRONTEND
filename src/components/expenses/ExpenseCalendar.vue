<script setup lang="ts">
// The same calendar, keyed to what was spent (section 35).
//
// Deliberately not a calendar of its own: this is `GlassDatePicker` inline, the
// same component the trade log paints its month with, handed a different
// `dayMeta`. One tone rather than two, because an expense has no sign — the
// depth is the amount against the day's share of the budget, and every day that
// spent anything takes the same hue.
import { computed } from 'vue'
import GlassDatePicker, { type DayMeta } from '@/components/ui/GlassDatePicker.vue'
import { amount2 } from '@/utils/format'
import {
  byDay,
  dayTitle,
  daysInMonth,
  spendInkVar,
  spendStep,
  spendWashVar,
} from '@/utils/expenseMath'
import type { Expense } from '@/types'

const props = defineProps<{
  expenses: Expense[]
  budget: number
  month: string
  /** '' means the whole month; a date filters the table to that day. */
  selected: string
}>()
const emit = defineEmits<{ 'update:selected': [string]; month: [string] }>()

const days = computed(() => byDay(props.expenses))

const dayMeta = computed<Record<string, DayMeta>>(() => {
  const out: Record<string, DayMeta> = {}
  const monthDays = daysInMonth(props.month)
  for (const cell of days.value.values()) {
    const step = spendStep(cell.amount, props.budget, monthDays)
    out[cell.date] = {
      // The picker's pos/neg edges are not used here at all: there is nothing
      // for them to mean, so every spending day is 'flat' and the wash carries
      // the whole of the information.
      tone: 'flat',
      intensity: step / 5,
      title: dayTitle(cell),
      wash: spendWashVar(step),
      ink: spendInkVar(step),
    }
  }
  return out
})

function spent(ymd: string): string {
  const cell = days.value.get(ymd)
  return cell ? amount2(cell.amount) : ''
}

/** Picking the selected day again clears the filter, as on the trade log. */
function onPick(next: unknown) {
  const ymd = typeof next === 'string' ? next : ''
  emit('update:selected', ymd === props.selected ? '' : ymd)
}
</script>

<template>
  <section class="ecal">
    <GlassDatePicker
      :model-value="selected"
      :month="month"
      inline
      mode="date"
      :quick-entry="false"
      :day-meta="dayMeta"
      label="Spending month"
      @update:model-value="onPick"
      @month="emit('month', $event)"
    >
      <template #day="{ cell }">
        <span class="ecal__day">
          <span class="ecal__num">{{ cell.day }}</span>
          <!-- The figure itself. A day's spend is one number and the cell is
               big enough to print it, so there is no bar to decode. -->
          <span v-if="spent(cell.ymd)" class="ecal__amount ui-mono">{{ spent(cell.ymd) }}</span>
        </span>
      </template>
    </GlassDatePicker>
  </section>
</template>

<style scoped>
.ecal {
  min-width: 0;
}
.ecal__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  width: 100%;
}
.ecal__num {
  min-width: 0;
}
.ecal__amount {
  display: block;
  max-width: 100%;
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-variant-numeric: tabular-nums;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

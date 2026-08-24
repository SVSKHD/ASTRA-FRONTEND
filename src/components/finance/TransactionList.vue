<script setup lang="ts">
// The transactions list (section 27b): grouped by day with a subtotal, a sticky
// month header, and a running balance down the right.
//
// The month header is sticky rather than repeated because a list scrolled for
// a minute stops saying which month it is in — and "the 14th" is only useful
// with the month attached. It sticks under the day header rather than over it,
// so the two never overlap into an unreadable stack.
import { computed } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Button from '@/components/ui/Button.vue'
import TxnRow from '@/components/finance/TxnRow.vue'
import { formatMinor, valueColor } from '@/utils/money'
import { monthLabel } from '@/utils/budget'
import { groupTransactions } from '@/utils/txnList'
import type { Txn, TxnCategory } from '@/types'

const props = withDefaults(
  defineProps<{
    transactions: Txn[]
    categories: TxnCategory[]
    /** Carried in from before this window, so a filtered month is not implied empty. */
    openingMinor?: number
    showBalance?: boolean
    showScope?: boolean
    /** True when a filter is narrowing the list — changes what the empty state says. */
    filtered?: boolean
    /** Transaction id currently uploading, so only that row shows a busy state. */
    uploadingId?: number | null
  }>(),
  { openingMinor: 0, showBalance: true },
)
const emit = defineEmits<{
  edit: [id: number]
  remove: [id: number]
  tag: [name: string]
  attach: [payload: { id: number; files: File[] }]
  detach: [payload: { id: number; attachmentId: string }]
  'clear-filters': []
  add: []
}>()

const months = computed(() => groupTransactions(props.transactions, props.openingMinor))

// A weekday and a day number. The month is on the sticky header above, so
// repeating it on every day heading is noise that pushes the subtotal off the
// edge on a phone.
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' })
function dayLabel(date: string): string {
  const parsed = Date.parse(date + 'T00:00:00')
  return Number.isNaN(parsed) ? date : dayFormat.format(new Date(parsed))
}
</script>

<template>
  <div class="txl">
    <template v-if="months.length">
      <section v-for="month in months" :key="month.monthKey" class="txl__month">
        <header class="txl__monthhead">
          <h3 class="txl__monthtitle">{{ monthLabel(month.monthKey) }}</h3>
          <span
            class="txl__monthnet ui-tabular"
            :style="{ color: valueColor(month.subtotalMinor) }"
          >
            {{ formatMinor(month.subtotalMinor, { signed: true }) }}
          </span>
        </header>

        <div v-for="day in month.days" :key="day.date" class="txl__day">
          <header class="txl__dayhead">
            <span class="txl__daylabel">{{ dayLabel(day.date) }}</span>
            <span class="txl__daynet ui-tabular" :style="{ color: valueColor(day.subtotalMinor) }">
              {{ formatMinor(day.subtotalMinor, { signed: true }) }}
            </span>
          </header>
          <ul class="txl__rows">
            <TxnRow
              v-for="row in day.rows"
              :key="row.txn.id"
              :txn="row.txn"
              :categories="categories"
              :balance-minor="showBalance ? row.balanceMinor : undefined"
              :show-scope="showScope"
              :uploading="uploadingId === row.txn.id"
              @edit="emit('edit', $event)"
              @remove="emit('remove', $event)"
              @tag="emit('tag', $event)"
              @attach="emit('attach', { id: row.txn.id, files: $event })"
              @detach="emit('detach', { id: row.txn.id, attachmentId: $event })"
            />
          </ul>
        </div>
      </section>
    </template>

    <!-- Two different empty states, because they call for two different
         actions. "Nothing matches" is a filter problem; "nothing yet" is an
         invitation. A grid of zeros for either would be neither. -->
    <EmptyState
      v-else-if="filtered"
      title="No transactions match these filters"
      description="Try a wider date range, or clear the filters to see everything again."
    >
      <template #action>
        <Button size="sm" variant="secondary" @click="emit('clear-filters')">Clear filters</Button>
      </template>
    </EmptyState>
    <EmptyState
      v-else
      title="No transactions yet"
      description="Add the first one above — an amount is enough, everything else has a sensible default."
    >
      <template #action>
        <Button size="sm" @click="emit('add')">Add transaction</Button>
      </template>
    </EmptyState>
  </div>
</template>

<style scoped>
.txl {
  display: grid;
  gap: var(--sp-4);
  min-width: 0;
}
.txl__month {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}
.txl__monthhead {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  /* Opaque, not a tint: a translucent sticky header lets the rows it is meant
     to cover read straight through it. */
  background: var(--bg-base, var(--theme-bg));
  border-bottom: 1px solid var(--border-subtle, var(--glass-border));
}
.txl__monthtitle {
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.txl__monthnet {
  flex-shrink: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
}
.txl__day {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}
.txl__dayhead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-1) var(--sp-3);
}
.txl__daylabel {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.txl__daynet {
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.txl__rows {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

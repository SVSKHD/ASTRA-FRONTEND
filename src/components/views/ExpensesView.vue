<script setup lang="ts">
// The Expenses tab (section 35).
//
// Everything here is the Trades tab's furniture with one thing changed: the
// scale. Same calendar component, same table treatment, same surfaces, same
// tokens, same account grammar in the header — because they are two views of
// one desk, and a second visual language for the cheaper half would be a second
// thing to learn for nothing.
//
// The one intentional difference is that expenses are single-signed, so the
// green/red P/L scale is replaced by one hue deepening with the amount against
// the month's budget. Nothing on this screen is green and nothing is red.
import { computed, ref } from 'vue'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import ExpenseCalendar from '@/components/expenses/ExpenseCalendar.vue'
import ExpenseForm from '@/components/expenses/ExpenseForm.vue'
import ExpenseTable from '@/components/expenses/ExpenseTable.vue'
import ExpenseHeader from '@/components/expenses/ExpenseHeader.vue'
import TradeSkeleton from '@/components/trades/TradeSkeleton.vue'
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { useExpenses } from '@/composables/useExpenses'
import { useSettings } from '@/composables/useSettings'
import { useTrades } from '@/composables/useTrades'
import { useTradeRoute } from '@/composables/useTradeRoute'
import { amount2, monthName } from '@/utils/format'
import { byCategory, elapsedDays, expenseTotals } from '@/utils/expenseMath'
import { round2, todayYmd } from '@/utils/tradeMath'
import type { ExpenseDraft } from '@/services/expenseDoc'

const app = useAppStore()
const { panelStyle } = useStyles()
const route = useTradeRoute()
const { settings, ready } = useSettings()

const log = useExpenses(() => route.month.value)
// The trade log too, but only for one number: the net line. It is the same
// month listener the Trades tab uses, so this costs a query, not a second model.
const trades = useTrades(() => route.month.value)

const visible = computed(() =>
  route.day.value
    ? log.expenses.value.filter((e) => e.date === route.day.value)
    : log.expenses.value,
)

const totals = computed(() =>
  expenseTotals(
    log.expenses.value,
    settings.value.monthlyBudget,
    elapsedDays(route.month.value, todayYmd()),
  ),
)

/** Trading profit less what was spent — shown only when it is asked for. */
const netAfter = computed(() =>
  round2(trades.trades.value.reduce((sum, t) => sum + t.pl, 0) - totals.value.spent),
)

const categories = computed(() => byCategory(log.expenses.value))
const categoryNames = computed(() => categories.value.map((c) => c.category))

const busy = ref(false)

async function onSubmit(draft: ExpenseDraft) {
  busy.value = true
  const id = await log.create(draft)
  busy.value = false
  if (id) app.showToastMsg(`Logged ${amount2(draft.amount)} · ${draft.category}`)
}

const form = ref<{ focus: () => void } | null>(null)
defineExpose({ focus: () => form.value?.focus() })
</script>

<template>
  <div :style="panelStyle" :data-ready="ready && !log.loading.value ? 'true' : 'false'">
    <ListToolbar title="Expenses" new-label="Log expense" @new="form?.focus()" />

    <!-- A write that was refused, and a listener that stopped. Two different
         failures with two different fixes, so they are two messages. -->
    <Alert v-if="log.error.value" tone="danger" dismissible @dismiss="log.error.value = ''">
      {{ log.error.value }}
    </Alert>
    <Alert v-if="log.listenerError.value" tone="danger">{{ log.listenerError.value }}</Alert>

    <TradeSkeleton v-if="log.loading.value" class="ev__scroll" />

    <div v-else class="ev__scroll">
      <ExpenseHeader
        :totals="totals"
        :net-after="netAfter"
        :net-expenses="settings.netExpenses"
        :period="monthName(route.month.value)"
      />

      <section v-if="totals.budget > 0" class="ev__budget">
        <ProgressBar :value="totals.pct" label="Spent against the month's budget" />
        <p class="ev__note">
          <!-- Over budget is stated as a fact, not as an alarm: the figure is
               already on the header and a second red thing adds nothing. -->
          {{
            totals.remaining >= 0
              ? `${amount2(totals.remaining)} left of ${amount2(totals.budget)}`
              : `${amount2(totals.remaining)} over the ${amount2(totals.budget)} budget`
          }}
        </p>
      </section>

      <div class="ev__split">
        <ExpenseCalendar
          :expenses="log.expenses.value"
          :budget="settings.monthlyBudget"
          :month="route.month.value"
          :selected="route.day.value"
          @update:selected="route.set({ day: $event })"
          @month="route.set({ month: $event, day: '' })"
        />
        <ExpenseForm ref="form" :categories="categoryNames" :busy="busy" @submit="onSubmit" />
      </div>

      <ExpenseTable
        :expenses="visible"
        :budget="settings.monthlyBudget"
        :month="route.month.value"
        :empty-title="
          route.day.value ? `Nothing spent on ${route.day.value}` : 'Nothing spent this month'
        "
        empty-description="Log the first one above — the calendar, the budget bar and the header all come from these rows."
        @delete="log.remove($event)"
      />

      <section v-if="categories.length" class="ev__cats">
        <h3 class="ui-label">By category</h3>
        <ul class="ev__catList">
          <li v-for="c in categories" :key="c.category" class="ev__cat">
            <span class="ev__catName">{{ c.category }}</span>
            <span class="ev__catCount">{{ c.count }}</span>
            <span class="ev__catAmount ui-mono">{{ amount2(c.amount) }}</span>
          </li>
        </ul>
      </section>

      <div v-if="log.undoable.value" class="ev__undo" role="status">
        <span>
          Deleted {{ log.undoable.value.expense.category }} on {{ log.undoable.value.expense.date }}
        </span>
        <Button variant="ghost" size="sm" @click="log.undo()">Undo</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ev__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
  padding-bottom: var(--sp-4);
}
.ev__split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-4);
  min-width: 0;
}
.ev__budget {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.ev__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.ev__cats {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.ev__catList {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.ev__cat {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: var(--sp-3);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.ev__catName {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev__catCount {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ev__catAmount {
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.ev__undo {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}

@media (max-width: 900px) {
  .ev__split {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

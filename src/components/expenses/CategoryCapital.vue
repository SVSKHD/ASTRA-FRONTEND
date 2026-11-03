<script setup lang="ts">
// Capital per category, and what has been used of it (section 35b).
//
// The plan lives in the settings document, not in the month: a grocery budget
// is a standing decision, and re-entering it every month is how plans stop
// being kept. So an edit here is saved as soon as the field is left, and every
// month after reads the same capital.
//
// Each row is the category's whole story in one line: capital, used, what is
// left (or over), and where today's rate takes it by month end. A category
// with spending and no capital is listed too — unplanned spending is the row
// most worth seeing — and its capital field is where the fix goes.
import { computed, reactive, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { amount2 } from '@/utils/format'
import { round2 } from '@/utils/tradeMath'
import type { CapitalRow, CapitalStatus } from '@/utils/expensePlan'
import type { AstraSettings } from '@/types'

const props = defineProps<{
  rows: CapitalRow[]
  capital: Record<string, number>
  income: number
  budget: number
  /** The capital assigned in all, for the line under the plan inputs. */
  allocated: number
}>()
const emit = defineEmits<{ save: [Partial<AstraSettings>] }>()

const STATUS: Record<CapitalStatus, string> = {
  unplanned: 'No capital',
  over: 'Over',
  'pacing-over': 'Will run over',
  'on-track': 'On track',
  idle: 'Untouched',
}

// Drafts, so a half-typed number is not saved on every keystroke: the field
// commits when it is left.
const drafts = reactive<Record<string, number | null>>({})
const plan = reactive({ income: null as number | null, budget: null as number | null })

watch(
  () => props.capital,
  (capital) => {
    for (const key of Object.keys(drafts)) delete drafts[key]
    for (const [name, amount] of Object.entries(capital)) drafts[name] = amount
  },
  { immediate: true, deep: true },
)
watch(
  () => [props.income, props.budget] as const,
  ([income, budget]) => {
    plan.income = income || null
    plan.budget = budget || null
  },
  { immediate: true },
)

function commitCapital(category: string) {
  const value = round2(Math.max(0, Number(drafts[category] ?? 0)))
  if (value === round2(props.capital[category] ?? 0)) return
  const next = { ...props.capital }
  if (value > 0) next[category] = value
  else delete next[category]
  emit('save', { categoryBudgets: next })
}

function commitPlan(key: 'income' | 'budget') {
  const value = round2(Math.max(0, Number(plan[key] ?? 0)))
  if (key === 'income' && value !== props.income) emit('save', { monthlyIncome: value })
  if (key === 'budget' && value !== props.budget) emit('save', { monthlyBudget: value })
}

const newName = ref('')
const newAmount = ref<number | null>(null)
const nameTaken = computed(() =>
  props.rows.some((r) => r.category.toLowerCase() === newName.value.trim().toLowerCase()),
)
const canAdd = computed(
  () => newName.value.trim().length > 0 && (newAmount.value ?? 0) > 0 && !nameTaken.value,
)

function addCategory() {
  if (!canAdd.value) return
  emit('save', {
    categoryBudgets: { ...props.capital, [newName.value.trim()]: round2(newAmount.value ?? 0) },
  })
  newName.value = ''
  newAmount.value = null
}

function fillWidth(row: CapitalRow) {
  if (row.capital <= 0) return row.spent > 0 ? '100%' : '0%'
  return `${Math.min(100, row.pct)}%`
}

/** Where the projection lands on the bar, as a tick, when it is inside it. */
function projectionLeft(row: CapitalRow) {
  if (row.capital <= 0 || row.projected <= row.spent) return ''
  return `${Math.min(100, (row.projected / row.capital) * 100)}%`
}

function sideNote(row: CapitalRow) {
  if (row.capital <= 0) return `${amount2(row.spent)} spent with no capital`
  return row.remaining >= 0
    ? `${amount2(row.remaining)} left`
    : `${amount2(row.remaining)} over capital`
}
</script>

<template>
  <section class="cap">
    <header class="cap__head">
      <h3 class="ui-label">Capital by category</h3>
      <p class="cap__lede">
        Assign each category its share of the month. Saved as soon as you leave a field, and kept
        for every month after.
      </p>
    </header>

    <div class="cap__plan">
      <label class="cap__planField">
        <span class="cap__planLabel">Monthly income</span>
        <NumberInput
          v-model="plan.income"
          :min="0"
          :step="1000"
          size="sm"
          placeholder="Not set"
          @blur="commitPlan('income')"
        />
      </label>
      <label class="cap__planField">
        <span class="cap__planLabel">Monthly budget</span>
        <NumberInput
          v-model="plan.budget"
          :min="0"
          :step="1000"
          size="sm"
          placeholder="Sum of categories"
          @blur="commitPlan('budget')"
        />
      </label>
      <p class="cap__planNote">
        {{
          budget > 0
            ? allocated > budget
              ? `${amount2(allocated)} assigned — ${amount2(allocated - budget)} more than the budget.`
              : `${amount2(allocated)} assigned · ${amount2(budget - allocated)} free to assign.`
            : allocated > 0
              ? `No budget set, so the ${amount2(allocated)} assigned is the budget.`
              : 'No budget or capital yet.'
        }}
      </p>
    </div>

    <ul v-if="rows.length" class="cap__list">
      <li v-for="row in rows" :key="row.category" class="cap__row" :class="`is-${row.status}`">
        <div class="cap__name">
          <span class="cap__title">{{ row.category }}</span>
          <span class="cap__status">{{ STATUS[row.status] }}</span>
        </div>

        <div class="cap__meter">
          <div
            class="cap__bar"
            role="meter"
            :aria-label="`${row.category}: ${amount2(row.spent)} used of ${amount2(row.capital)}`"
            :aria-valuenow="row.spent"
            :aria-valuemin="0"
            :aria-valuemax="row.capital || row.spent || 1"
          >
            <span class="cap__fill" :style="{ width: fillWidth(row) }"></span>
            <span
              v-if="projectionLeft(row)"
              class="cap__proj"
              :style="{ left: projectionLeft(row) }"
              :title="`Projected ${amount2(row.projected)}`"
            ></span>
          </div>
          <p class="cap__figures">
            <span class="ui-tabular">{{ amount2(row.spent) }}</span>
            <span v-if="row.capital > 0"> of {{ amount2(row.capital) }}</span>
            · <span class="cap__side">{{ sideNote(row) }}</span>
            <span v-if="row.projected > row.spent"> · projected {{ amount2(row.projected) }}</span>
          </p>
        </div>

        <!-- A wrapping label names the field: NumberInput takes no aria-label,
             and a fallthrough one would name its box rather than its input. -->
        <label class="cap__input" :data-capital-input="row.category">
          <span class="ui-sr-only">Capital for {{ row.category }}</span>
          <NumberInput
            :model-value="drafts[row.category] ?? null"
            @update:model-value="drafts[row.category] = $event"
            :min="0"
            :step="500"
            size="sm"
            placeholder="Capital"
            @blur="commitCapital(row.category)"
          />
        </label>
      </li>
    </ul>
    <p v-else class="cap__empty">
      No categories yet. Add one below, or log an expense and its category appears here.
    </p>

    <form class="cap__add" @submit.prevent="addCategory">
      <TextInput v-model="newName" size="sm" placeholder="New category" aria-label="New category" />
      <label class="cap__input">
        <span class="ui-sr-only">Capital for the new category</span>
        <NumberInput v-model="newAmount" :min="0" :step="500" size="sm" placeholder="Capital" />
      </label>
      <Button type="submit" size="sm" variant="secondary" :disabled="!canAdd">Add</Button>
      <span v-if="nameTaken" class="cap__hint"
        >That category is already listed — set it above.</span
      >
    </form>
  </section>
</template>

<style scoped>
.cap {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.cap__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cap__head h3 {
  margin: 0;
}
.cap__lede,
.cap__planNote,
.cap__empty,
.cap__hint {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.cap__plan {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2) var(--sp-3);
  min-width: 0;
}
.cap__planField {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.cap__planLabel {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.cap__planNote {
  grid-column: 1 / -1;
}
.cap__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cap__row {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 7.5rem;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--layer-raised-border);
}
.cap__row:first-child {
  border-top: none;
}
.cap__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cap__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary, var(--theme-text));
}
.cap__status {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
}
.is-over .cap__status {
  color: var(--theme-danger);
}
.is-pacing-over .cap__status,
.is-unplanned .cap__status {
  color: var(--theme-warning);
}
.is-on-track .cap__status {
  color: var(--theme-success);
}
.cap__meter {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.cap__bar {
  position: relative;
  height: 8px;
  min-width: 0;
  border-radius: 999px;
  background: color-mix(in oklch, var(--theme-dim) 18%, transparent);
  overflow: hidden;
}
.cap__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--theme-accent);
  transition: width var(--dur-med, 240ms) var(--ease-out);
}
.is-over .cap__fill {
  background: var(--theme-danger);
}
.is-pacing-over .cap__fill,
.is-unplanned .cap__fill {
  background: var(--theme-warning);
}
.cap__proj {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text-primary, var(--theme-text));
  opacity: 0.6;
}
.cap__figures {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.is-over .cap__side {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.cap__input {
  min-width: 0;
}
.cap__add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7.5rem auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.cap__hint {
  grid-column: 1 / -1;
  color: var(--theme-warning);
}

@media (prefers-reduced-motion: reduce) {
  .cap__fill {
    transition: none;
  }
}
@media (max-width: 600px) {
  .cap__row {
    grid-template-columns: minmax(0, 1fr) 7rem;
  }
  .cap__meter {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>

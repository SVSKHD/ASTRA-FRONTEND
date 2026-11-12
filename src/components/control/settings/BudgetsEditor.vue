<script setup lang="ts">
// AI_AGENT_BUDGETS_USD: the four budgets' monthly caps, with a live total
// compared against the monthly budget. Starts from the caps the server reports
// in use (GET /api/ai/usage) when they are known, since the setting itself is
// never sent back; the value is written whole on save.
import { computed, reactive, watch } from 'vue'
import TextInput from '@/components/ui/TextInput.vue'
import {
  BUDGET_KEYS,
  budgetsError,
  budgetsTotal,
  serializeBudgets,
  type BudgetDraft,
} from '@/control/settingEditors'
import { BUDGET_LABEL } from '@/ai/costs'

const props = defineProps<{
  id: string
  /** The caps in use now, when known. */
  seed: BudgetDraft | null
  /** The monthly budget to compare against (the typed draft, else the one in use). */
  monthly: number | null
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [value: string | null] }>()

const d = reactive<BudgetDraft>({ investments: '', business: '', chat: '', reserve: '' })
let touched = false
watch(
  () => props.seed,
  (s) => {
    if (s && !touched) Object.assign(d, s)
  },
  { immediate: true },
)

function set(k: keyof BudgetDraft, v: string) {
  touched = true
  d[k] = v
  emit('change', serializeBudgets(d))
}

const total = computed(() => budgetsTotal(d))
const error = computed(() => (touched ? budgetsError(d) : null))
const over = computed(() => props.monthly != null && total.value > props.monthly + 1e-9)
defineExpose({ error })
</script>

<template>
  <div class="be" :id="id" role="group" aria-label="Budget per agent">
    <div class="be__grid">
      <TextInput
        v-for="k in BUDGET_KEYS"
        :key="k"
        :model-value="d[k]"
        :label="BUDGET_LABEL[k] ?? k"
        inputmode="decimal"
        suffix="USD"
        size="sm"
        :disabled="disabled"
        :data-budget="k"
        @update:model-value="set(k, String($event ?? ''))"
      />
    </div>
    <p class="be__total" :class="{ 'is-over': over }" aria-live="polite" data-testid="budget-total">
      Total {{ `$${total.toFixed(2)}` }}
      <template v-if="monthly != null">
        of the {{ `$${monthly.toFixed(2)}` }} monthly budget<template v-if="over">
          — more than the monthly budget, so the monthly cap is what stops spending</template
        ></template
      >
    </p>
    <p v-if="error" class="be__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.be {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.be__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--sp-2);
  min-width: 0;
}
.be__total {
  margin: 0;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
.be__total.is-over {
  color: var(--theme-warning);
  font-weight: var(--weight-semibold);
}
.be__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-danger);
}
</style>

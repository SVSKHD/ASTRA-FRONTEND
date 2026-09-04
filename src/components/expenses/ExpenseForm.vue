<script setup lang="ts">
// Logging one expense (section 35).
//
// Five fields, and only two of them ever need thought: the amount and what it
// was for. The date is today, the category is the last one used, and the kind
// is one-off until somebody says otherwise — because the commonest expense is
// a one-off and a form that asks about recurrence first is a form that gets
// abandoned.
//
// The amount has no sign and no side control. That is the model showing
// through: an expense is a size.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import FormField from '@/components/ui/FormField.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Alert from '@/components/ui/Alert.vue'
import { useForm } from '@/composables/useForm'
import { expenseFormSchema } from '@/utils/formSchemas'
import { todayYmd } from '@/utils/tradeMath'
import type { ExpenseDraft } from '@/services/expenseDoc'
import type { ExpenseKind } from '@/types'

const props = defineProps<{ categories: string[]; busy?: boolean }>()
const emit = defineEmits<{ submit: [ExpenseDraft] }>()

const KINDS = [
  { value: 'one-off', label: 'One-off' },
  { value: 'recurring', label: 'Monthly' },
]

const lastCategory = ref('')

const form = useForm({
  initial: {
    date: todayYmd(),
    amount: null as number | null,
    category: '',
    note: '',
    kind: 'one-off' as ExpenseKind,
  },
  schema: expenseFormSchema,
  onSubmit: async (values) => {
    lastCategory.value = values.category
    emit('submit', {
      date: values.date,
      amount: Number(values.amount),
      category: values.category,
      note: values.note,
      kind: values.kind,
      // The day of the month it repeats on, from the date it was logged on.
      recurDay: values.kind === 'recurring' ? Number(values.date.slice(8)) : undefined,
    })
  },
})

// The categories already in use, so the second grocery bill is one keystroke.
const options = computed(() => props.categories.map((value) => ({ value, label: value })))

watch(
  () => props.categories,
  (list) => {
    if (!form.dirty.value && !form.values.category && list.length) {
      form.values.category = lastCategory.value || list[0]
    }
  },
  { immediate: true },
)

const amountField = ref<HTMLElement | null>(null)
defineExpose({ focus: () => amountField.value?.querySelector('input')?.focus() })

async function onSubmit() {
  const ok = await form.submit()
  if (!ok) return
  const { date, category, kind } = form.values
  // The context stays, the amount goes: the next expense is usually another
  // one of the same kind on the same day.
  form.reset({ date, category, kind, amount: null, note: '' })
  amountField.value?.querySelector('input')?.focus()
}
</script>

<template>
  <form class="eform" novalidate @submit.prevent="onSubmit">
    <div class="eform__grid">
      <FormField label="Date" :error="form.errorFor('date')" v-slot="f">
        <div data-field="date">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :disabled="f.disabled"
            v-model="form.values.date"
            mode="date"
            :clearable="false"
            @update:model-value="form.change('date')"
          />
        </div>
      </FormField>

      <FormField label="Amount" :error="form.errorFor('amount')" v-slot="f">
        <div ref="amountField" data-field="amount">
          <NumberInput
            v-bind="f"
            v-model="form.values.amount"
            :step="0.01"
            :min="0"
            @update:model-value="form.change('amount')"
            @blur="form.blur('amount')"
          />
        </div>
      </FormField>

      <FormField label="Category" :error="form.errorFor('category')" v-slot="f">
        <div data-field="category">
          <Combobox
            v-bind="f"
            :model-value="form.values.category"
            :options="options"
            creatable
            placeholder="Data feed"
            empty-text="New category — pick Create to use it"
            @update:model-value="((form.values.category = String($event)), form.change('category'))"
            @create="((form.values.category = String($event)), form.change('category'))"
          />
        </div>
      </FormField>

      <FormField label="Repeats" :error="form.errorFor('kind')" v-slot="f">
        <div data-field="kind">
          <SegmentedControl
            :size="f.size"
            :disabled="f.disabled"
            :model-value="form.values.kind"
            :options="KINDS"
            aria-label="Repeats"
            @update:model-value="((form.values.kind = $event as ExpenseKind), form.change('kind'))"
          />
        </div>
      </FormField>

      <FormField label="Note" :error="form.errorFor('note')" v-slot="f">
        <div data-field="note">
          <TextInput
            v-bind="f"
            v-model="form.values.note"
            placeholder="What it was for"
            @update:model-value="form.change('note')"
          />
        </div>
      </FormField>
    </div>

    <Alert v-if="form.formError.value" tone="danger">{{ form.formError.value }}</Alert>

    <div class="eform__foot">
      <p class="eform__note">
        {{
          form.values.kind === 'recurring'
            ? 'Stored on this date and marked monthly — later months are logged when they happen, never invented.'
            : 'A one-off, on the date above.'
        }}
      </p>
      <Button type="submit" :loading="busy || form.submitting.value">Log expense</Button>
    </div>
  </form>
</template>

<style scoped>
.eform {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
.eform__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
}
.eform__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
}
.eform__note {
  flex: 1;
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>

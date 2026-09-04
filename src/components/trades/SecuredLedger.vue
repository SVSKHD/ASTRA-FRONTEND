<script setup lang="ts">
// The secured ledger (section 28).
//
// Money taken off the table. It is deliberately its own list and its own total:
// a withdrawal is not a losing trade, and netting the two would make "how did I
// trade this month" and "how much have I taken out" into one number that
// answers neither. It comes out of the balance and nothing else.
import { computed, ref } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import IconSecured from '@/components/icons/IconSecured.vue'
import IconDelete from '@/components/icons/IconDelete.vue'
import { useForm } from '@/composables/useForm'
import { securedFormSchema } from '@/utils/formSchemas'
import { fmt2, todayYmd } from '@/utils/tradeMath'
import type { NewSecured } from '@/composables/useTradeLog'
import type { SecuredEntry } from '@/types'

const props = defineProps<{ entries: SecuredEntry[]; total: number }>()
const emit = defineEmits<{ add: [NewSecured]; delete: [string] }>()

const open = ref(false)

const form = useForm({
  initial: { date: todayYmd(), amt: null as number | null, note: '' },
  schema: securedFormSchema,
  onSubmit: async (values) => {
    emit('add', { date: values.date, amt: Number(values.amt), note: values.note })
  },
})

const count = computed(() => props.entries.length)

async function onSubmit() {
  if (await form.submit()) form.reset({ date: form.values.date })
}
</script>

<template>
  <section class="sled">
    <header class="sled__head">
      <div class="sled__title">
        <span class="ui-label">
          <IconSecured :size="14" />
          Secured
        </span>
        <span class="sled__total ui-mono">{{ fmt2(total) }}</span>
        <span class="sled__count">
          {{ count }} withdrawal{{ count === 1 ? '' : 's' }} this month
        </span>
      </div>
      <Button variant="ghost" size="sm" @click="open = !open">
        {{ open ? 'Close' : 'Secure profit' }}
      </Button>
    </header>

    <form v-if="open" class="sled__form" novalidate @submit.prevent="onSubmit">
      <FormField label="Date" :error="form.errorFor('date')" v-slot="f">
        <div data-field="date">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            v-model="form.values.date"
            mode="date"
            :clearable="false"
            @update:model-value="form.change('date')"
          />
        </div>
      </FormField>
      <FormField label="Amount" :error="form.errorFor('amt')" v-slot="f">
        <div data-field="amt">
          <NumberInput
            v-bind="f"
            v-model="form.values.amt"
            :min="0"
            :step="0.01"
            @update:model-value="form.change('amt')"
            @blur="form.blur('amt')"
          />
        </div>
      </FormField>
      <FormField label="Note" hint="Optional" :error="form.errorFor('note')" v-slot="f">
        <div data-field="note">
          <TextInput
            v-bind="f"
            v-model="form.values.note"
            placeholder="Withdrawn to bank"
            @update:model-value="form.change('note')"
            @blur="form.blur('note')"
          />
        </div>
      </FormField>
      <Button type="submit" size="sm" :loading="form.submitting.value">Record</Button>
    </form>

    <ul v-if="entries.length" class="sled__list">
      <li v-for="entry in entries" :key="entry.id" class="sled__row">
        <span class="sled__date ui-mono">{{ entry.date }}</span>
        <span class="sled__amt ui-mono">{{ fmt2(entry.amt) }}</span>
        <span class="sled__note">{{ entry.note || '—' }}</span>
        <IconButton
          :label="`Delete the withdrawal on ${entry.date}`"
          size="sm"
          @click="$emit('delete', entry.id)"
        >
          <IconDelete :size="14" />
        </IconButton>
      </li>
    </ul>
    <p v-else class="sled__empty">
      Nothing secured this month. Profit stays in the traded balance until it is taken out here.
    </p>
  </section>
</template>

<style scoped>
.sled {
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
.sled__title .ui-label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
/* Same rule as the trade table: the destructive action appears on approach,
   and comes back for the keyboard as well as the pointer. */
.sled__row .ui-iconbtn {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.sled__row:hover .ui-iconbtn,
.sled__row:focus-within .ui-iconbtn {
  opacity: 1;
}
@media (hover: none) {
  .sled__row .ui-iconbtn {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sled__row .ui-iconbtn {
    transition: none;
  }
}
.sled__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.sled__title {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
  flex-wrap: wrap;
}
.sled__total {
  font-size: var(--text-md);
  line-height: var(--lh-md);
  color: var(--text-primary, var(--theme-text));
}
.sled__count {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.sled__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  align-items: end;
  gap: var(--sp-3);
  min-width: 0;
}
.sled__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.sled__row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-1) 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  border-bottom: 1px solid var(--border-subtle, var(--glass-border));
}
.sled__row:last-child {
  border-bottom: none;
}
.sled__date {
  color: var(--text-secondary, var(--theme-dim));
}
.sled__amt {
  color: var(--text-primary, var(--theme-text));
}
.sled__note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, var(--theme-dim));
}
.sled__empty {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-secondary, var(--theme-dim));
}
</style>

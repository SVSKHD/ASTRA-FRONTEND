<script lang="ts">
import type { TxnCategory, TxnKind, TxnMethod } from '@/types'

/** What the row hands up when it is submitted. Declared in the non-setup block
 *  so a parent can `import type { QuickAddDraft }` from this component. */
export interface QuickAddDraft {
  amountMinor: number
  kind: TxnKind
  category: string
  method: TxnMethod | null
  date: string
  note: string
  tags: string[]
}

// A field's name as the chip says it. Outside setup because it is a constant
// lookup table, not state.
export const FIELD_LABEL: Record<string, string> = {
  amount: 'Amount',
  direction: 'Direction',
  category: 'Category',
  method: 'Method',
  date: 'Date',
  tag: 'Tag',
  note: 'Note',
}
</script>

<script setup lang="ts">
// The row that is always there (section 27b).
//
// The design goal is one number and Enter. Everything except the amount has a
// default — Out, the last category used, today — because a form that asks five
// questions to record a ₹40 chai gets used twice and then abandoned, and an
// expense log nobody adds to is worse than none at all.
//
// So: the amount is autofocused, Enter submits, and focus returns to the amount
// with the field cleared. Adding five things in a row is five numbers and five
// Enters. The other controls are there for when the default is wrong, not to be
// visited each time.
//
// The second mode is one field: "450 groceries upi yesterday". It parses to
// chips shown BEFORE the commit, so an aggressive parser stays safe — a wrong
// guess is visible and one click from fixed rather than silently written.
import { computed, nextTick, ref, watch } from 'vue'
import TextInput from '@/components/ui/TextInput.vue'
import Button from '@/components/ui/Button.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Combobox from '@/components/ui/Combobox.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Select from '@/components/ui/Select.vue'
import Chip from '@/components/ui/Chip.vue'
import { parseMoney } from '@/utils/money'
import { parseTxnInput, type ParsedTxn } from '@/utils/txnParse'
import { pickerCategories } from '@/utils/txnCategories'
import { ymdOf } from '@/utils/dateParse'
import { TXN_METHODS } from '@/types'

const props = defineProps<{
  categories: TxnCategory[]
  /** Remembered from the last row added, so the common case needs no choosing. */
  lastCategory?: string
  lastMethod?: TxnMethod | null
}>()

const emit = defineEmits<{ add: [draft: QuickAddDraft]; 'create-category': [name: string] }>()

const mode = ref<'fields' | 'sentence'>('fields')
const amountEl = ref<InstanceType<typeof TextInput> | null>(null)

const amount = ref('')
const kind = ref<TxnKind>('expense')
const category = ref(props.lastCategory ?? '')
const method = ref<TxnMethod | null>(props.lastMethod ?? null)
const date = ref(ymdOf(new Date()))
const note = ref('')
const sentence = ref('')

const categoryOptions = computed(() =>
  pickerCategories(props.categories, kind.value).map((c) => ({
    value: c.name,
    label: c.name,
    color: c.color,
  })),
)
const methodOptions = [
  { value: '', label: 'Method' },
  ...TXN_METHODS.map((m) => ({ value: m, label: m.toUpperCase() })),
]

const parsed = computed<ParsedTxn>(() =>
  parseTxnInput(sentence.value, {
    categories: props.categories.filter((c) => !c.archived).map((c) => c.name),
    defaultKind: 'expense',
  }),
)

const amountMinor = computed(() => parseMoney(amount.value))
const canSubmit = computed(() =>
  mode.value === 'sentence' ? parsed.value.valid : amountMinor.value > 0,
)

function focusAmount(): void {
  void nextTick(() => amountEl.value?.focus())
}

function submit(): void {
  if (!canSubmit.value) return
  const draft: QuickAddDraft =
    mode.value === 'sentence'
      ? {
          amountMinor: parsed.value.amountMinor,
          kind: parsed.value.kind,
          // An unrecognised category stays empty rather than becoming the note's
          // first word: inventing a bucket the user did not ask for is how a
          // category list turns into a list of typos.
          category: parsed.value.category ?? '',
          method: parsed.value.method,
          date: parsed.value.date,
          note: parsed.value.note,
          tags: parsed.value.tags,
        }
      : {
          amountMinor: amountMinor.value,
          kind: kind.value,
          category: category.value,
          method: method.value,
          date: date.value,
          note: note.value.trim(),
          tags: [],
        }
  emit('add', draft)

  // Only the amount, the note and the sentence clear. The direction, category,
  // date and method persist, because entering three things from the same
  // afternoon should not mean setting the date three times.
  amount.value = ''
  note.value = ''
  sentence.value = ''
  focusAmount()
}

// Switching modes returns focus where the typing goes, so the toggle costs one
// click rather than a click and a hunt.
watch(mode, () => focusAmount())

defineExpose({ focus: focusAmount })
</script>

<template>
  <form class="qadd" @submit.prevent="submit">
    <div class="qadd__modes">
      <SegmentedControl
        v-model="mode"
        size="sm"
        :options="[
          { value: 'fields', label: 'Fields' },
          { value: 'sentence', label: 'One line' },
        ]"
        aria-label="Entry mode"
      />
    </div>

    <template v-if="mode === 'fields'">
      <div class="qadd__row">
        <TextInput
          ref="amountEl"
          v-model="amount"
          class="qadd__amount"
          size="sm"
          placeholder="Amount"
          aria-label="Amount"
          inputmode="decimal"
        />
        <SegmentedControl
          v-model="kind"
          size="sm"
          :options="[
            { value: 'expense', label: 'Out' },
            { value: 'income', label: 'In' },
          ]"
          aria-label="Direction"
        />
        <Combobox
          v-model="category"
          class="qadd__category"
          :options="categoryOptions"
          placeholder="Category"
          size="sm"
          creatable
          @create="emit('create-category', $event)"
        />
        <GlassDatePicker v-model="date" class="qadd__date" />
        <Select
          :model-value="method ?? ''"
          class="qadd__method"
          size="sm"
          :options="methodOptions"
          @update:model-value="method = ($event as TxnMethod) || null"
        />
        <TextInput
          v-model="note"
          class="qadd__note"
          size="sm"
          placeholder="Note"
          aria-label="Note"
        />
        <Button type="submit" size="sm" :disabled="!canSubmit">Add</Button>
      </div>
    </template>

    <template v-else>
      <div class="qadd__row qadd__row--sentence">
        <TextInput
          ref="amountEl"
          v-model="sentence"
          class="qadd__sentence"
          size="sm"
          placeholder="450 groceries upi yesterday"
          aria-label="Transaction"
        />
        <Button type="submit" size="sm" :disabled="!canSubmit">Add</Button>
      </div>
      <!-- What the parser understood, before it is written. Each chip names its
           field, so "Out" is legibly a direction and not a category. -->
      <ul v-if="sentence.trim()" class="qadd__chips" aria-label="Parsed so far">
        <li v-for="chip in parsed.chips" :key="chip.field + chip.source">
          <Chip :label="`${FIELD_LABEL[chip.field]}: ${chip.label}`" size="sm" />
        </li>
        <li v-if="!parsed.valid" class="qadd__hint">Start with an amount — “450 coffee”.</li>
      </ul>
    </template>
  </form>
</template>

<style scoped>
.qadd {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-card, 10px);
  background: var(--bg-elevated, var(--glass-card));
}
.qadd__modes {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}
.qadd__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.qadd__amount {
  flex: 0 0 120px;
  min-width: 0;
}
.qadd__category {
  flex: 0 0 180px;
  min-width: 0;
}
.qadd__date {
  flex: 0 0 150px;
  min-width: 0;
}
.qadd__method {
  flex: 0 0 120px;
  min-width: 0;
}
/* The note takes what is left: it is the field with no natural width, and
   giving it a fixed one is how a row ends up with a 90px note box beside 200px
   of empty space. */
.qadd__note {
  flex: 1 1 180px;
  min-width: 0;
}
.qadd__sentence {
  flex: 1 1 auto;
  min-width: 0;
}
.qadd__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.qadd__hint {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
@media (max-width: 720px) {
  /* On a phone the amount takes the full first line, so the numeric keypad has
     something to aim at that is not 120px wide. */
  .qadd__amount {
    flex: 1 1 100%;
  }
}
</style>

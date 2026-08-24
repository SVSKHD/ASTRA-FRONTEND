<script setup lang="ts">
// The filter bar (section 27b).
//
// Collapsed to a summary by default. Nine controls permanently occupying the
// top of the list would cost more screen than the list they filter, and the
// common case is no filter at all — so what shows is a search box, the
// direction, and a button that says how many filters are on.
//
// Every control comes from src/components/ui/. There is no native <select>
// anywhere: an OS dropdown renders its popup outside the page's styling and
// flashes white on a dark theme, which is 26a's root cause and has no CSS fix.
import { computed, ref } from 'vue'
import SearchField from '@/components/ui/SearchField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import MultiSelect from '@/components/ui/MultiSelect.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Button from '@/components/ui/Button.vue'
import Chip from '@/components/ui/Chip.vue'
import { formatMinor, parseMoney } from '@/utils/money'
import { isFiltered, type TxnFilters } from '@/utils/txnList'
import { TXN_METHODS, type TxnCategory, type TxnMethod } from '@/types'
import type { DateRange } from '@/utils/datePicker'

const props = defineProps<{
  modelValue: TxnFilters
  categories: TxnCategory[]
  tags: string[]
  /** Hidden when the workspace has only one scope in play. */
  showScope?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [TxnFilters]; clear: [] }>()

const open = ref(false)

function patch(fields: Partial<TxnFilters>): void {
  emit('update:modelValue', { ...props.modelValue, ...fields })
}

const range = computed<DateRange>(() => ({
  start: props.modelValue.from || null,
  end: props.modelValue.to || null,
}))
function setRange(value: string | DateRange | null): void {
  const r = (value ?? { start: null, end: null }) as DateRange
  patch({ from: r.start ?? '', to: r.end ?? '' })
}

const categoryOptions = computed(() =>
  props.categories
    .filter((c) => !c.archived)
    .map((c) => ({ value: c.name, label: c.name, color: c.color })),
)
const methodOptions = TXN_METHODS.map((m) => ({ value: m, label: m.toUpperCase() }))
const tagOptions = computed(() => props.tags.map((t) => ({ value: t, label: `#${t}` })))

// The amount bounds are held as text while being typed, so a half-entered
// "1" does not filter the list down to nothing on the first keystroke and
// then back up on the second.
const minText = ref(props.modelValue.minMinor ? formatMinor(props.modelValue.minMinor) : '')
const maxText = ref(props.modelValue.maxMinor ? formatMinor(props.modelValue.maxMinor) : '')

/**
 * How many filters are on. Counted rather than listed, because the summary line
 * has to fit on a phone — and "3 filters" plus a click is more useful than a
 * truncated list of what they are.
 */
const activeCount = computed(() => {
  const f = props.modelValue
  return [
    f.from || f.to,
    f.categories.length,
    f.methods.length,
    f.tags.length,
    f.minMinor || f.maxMinor,
    f.scope !== 'all',
  ].filter(Boolean).length
})

const narrowed = computed(() => isFiltered(props.modelValue))

function clearAll(): void {
  minText.value = ''
  maxText.value = ''
  emit('clear')
}
</script>

<template>
  <div class="txf">
    <div class="txf__bar">
      <SearchField
        :model-value="modelValue.search"
        class="txf__search"
        placeholder="Search notes, people, categories"
        @update:model-value="patch({ search: $event })"
      />
      <SegmentedControl
        :model-value="modelValue.kind"
        size="sm"
        :options="[
          { value: 'all', label: 'All' },
          { value: 'expense', label: 'Out' },
          { value: 'income', label: 'In' },
        ]"
        aria-label="Direction"
        @update:model-value="patch({ kind: $event as TxnFilters['kind'] })"
      />
      <Button size="sm" variant="secondary" :aria-expanded="open" @click="open = !open">
        Filters<template v-if="activeCount"> · {{ activeCount }}</template>
      </Button>
      <Button v-if="narrowed" size="sm" variant="ghost" @click="clearAll">Clear</Button>
    </div>

    <div v-if="open" class="txf__panel">
      <label class="txf__field">
        <span class="txf__label">Date range</span>
        <GlassDatePicker
          :model-value="range"
          mode="range"
          size="sm"
          @update:model-value="setRange"
        />
      </label>

      <label class="txf__field">
        <span class="txf__label">Categories</span>
        <MultiSelect
          :model-value="modelValue.categories"
          :options="categoryOptions"
          size="sm"
          placeholder="Any category"
          @update:model-value="patch({ categories: $event })"
        />
      </label>

      <label class="txf__field">
        <span class="txf__label">Method</span>
        <MultiSelect
          :model-value="modelValue.methods"
          :options="methodOptions"
          size="sm"
          placeholder="Any method"
          @update:model-value="patch({ methods: $event as TxnMethod[] })"
        />
      </label>

      <label class="txf__field">
        <span class="txf__label">Tags</span>
        <MultiSelect
          :model-value="modelValue.tags"
          :options="tagOptions"
          size="sm"
          placeholder="Any tag"
          @update:model-value="patch({ tags: $event })"
        />
      </label>

      <div class="txf__field">
        <span class="txf__label">Amount between</span>
        <div class="txf__pair">
          <TextInput
            v-model="minText"
            size="sm"
            placeholder="Min"
            aria-label="Minimum amount"
            inputmode="decimal"
            @blur="patch({ minMinor: parseMoney(minText) })"
          />
          <TextInput
            v-model="maxText"
            size="sm"
            placeholder="Max"
            aria-label="Maximum amount"
            inputmode="decimal"
            @blur="patch({ maxMinor: parseMoney(maxText) })"
          />
        </div>
      </div>

      <label v-if="showScope" class="txf__field">
        <span class="txf__label">Scope</span>
        <SegmentedControl
          :model-value="modelValue.scope"
          size="sm"
          :options="[
            { value: 'all', label: 'All' },
            { value: 'personal', label: 'Personal' },
            { value: 'business', label: 'Business' },
          ]"
          aria-label="Scope"
          @update:model-value="patch({ scope: $event as TxnFilters['scope'] })"
        />
      </label>
    </div>

    <!-- What is on, when the panel is shut. Without this a filtered list looks
         like a short list, and the reader concludes their data is missing. -->
    <ul v-if="!open && narrowed" class="txf__active" aria-label="Active filters">
      <li v-if="modelValue.from || modelValue.to">
        <Chip :label="`${modelValue.from || '…'} → ${modelValue.to || '…'}`" size="sm" />
      </li>
      <li v-for="name in modelValue.categories" :key="name"><Chip :label="name" size="sm" /></li>
      <li v-for="m in modelValue.methods" :key="m"><Chip :label="m.toUpperCase()" size="sm" /></li>
      <li v-for="t in modelValue.tags" :key="t"><Chip :label="`#${t}`" size="sm" /></li>
      <li v-if="modelValue.minMinor || modelValue.maxMinor">
        <Chip
          :label="`${modelValue.minMinor ? formatMinor(modelValue.minMinor) : '…'} – ${
            modelValue.maxMinor ? formatMinor(modelValue.maxMinor) : '…'
          }`"
          size="sm"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.txf {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}
.txf__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.txf__search {
  flex: 1 1 220px;
  min-width: 0;
}
.txf__panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-card, 10px);
  background: var(--bg-elevated, var(--glass-card));
}
.txf__field {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}
.txf__label {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.txf__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
  min-width: 0;
}
.txf__active {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

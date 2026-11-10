<script setup lang="ts">
// Search the backend's instrument master and pick one (src/trading/instruments.ts).
// Shared by the Market Explorer, the chart and the strategy builder, so no form
// asks for a comma-separated list of instrument ids again.
//
// The search runs on the server (debounced); the list shows what came back,
// with exchange, kind, expiry and strike so two "NIFTY" contracts read apart.
// Picking emits the whole instrument, not just an id.
import { computed, onBeforeUnmount, ref } from 'vue'
import Combobox from '@/components/ui/Combobox.vue'
import { describe, searchInstruments, type Broker, type Instrument } from '@/trading/instruments'
import { ApiFailure } from '@/trading/useLoad'

const props = withDefaults(
  defineProps<{
    /** The picked instrument id, as a string ('' for none). */
    modelValue?: string
    broker?: Broker
    /** Limit to one backend instrument_type (e.g. 'OPTIDX'). */
    instrumentType?: string
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    id?: string
    /** What the field shows for an instrument picked before this mounted (a deep link). */
    selectedLabel?: string
  }>(),
  { modelValue: '', broker: 'dhan', placeholder: 'Search symbol or name…', size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [string]; pick: [Instrument] }>()

const SEARCH_DEBOUNCE_MS = 250

// The field's TEXT is this component's own. Combobox reports typing and picking
// through the same event — typed text, or the picked option's value — and shows
// its model whenever it is not focused, so binding the instrument id straight
// through would emit half-typed text as an "id" and leave "123" in the field
// after a pick. Only a pick that matches a search result is passed on.
const text = ref(props.selectedLabel ?? '')

const found = ref<Instrument[]>([])
const loading = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const options = computed(() => found.value.map((i) => ({ value: String(i.id), label: labelOf(i) })))
const emptyText = computed(
  () => error.value || 'No instruments match. Check the instrument master is synced.',
)

function onQuery(q: string) {
  clearTimeout(timer)
  timer = setTimeout(() => void run(q), SEARCH_DEBOUNCE_MS)
}
async function run(q: string) {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const page = await searchInstruments({
      broker: props.broker,
      q,
      instrumentType: props.instrumentType,
      limit: 25,
    })
    if (mine === seq) found.value = page.items
  } catch (e) {
    if (mine !== seq) return
    found.value = []
    error.value =
      e instanceof ApiFailure
        ? `Search failed: ${e.message}`
        : 'Search failed. Check the connection.'
  } finally {
    if (mine === seq) loading.value = false
  }
}
function labelOf(i: Instrument): string {
  return `${i.symbol} — ${describe(i)}`
}
function onUpdate(value: string) {
  const hit = found.value.find((i) => String(i.id) === value)
  if (!hit) {
    text.value = value
    return
  }
  text.value = labelOf(hit)
  emit('update:modelValue', value)
  emit('pick', hit)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Combobox
    :id="id"
    :model-value="text"
    :options="options"
    :placeholder="placeholder"
    :size="size"
    :loading="loading"
    :empty-text="emptyText"
    external-filter
    @query="onQuery"
    @update:model-value="onUpdate"
  />
</template>

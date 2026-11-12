<script setup lang="ts">
// AI_MODEL_PRICES: the base kit's Table, one row per model — a TextInput for the
// model and NumberInputs for input / output / cache-read, USD per million
// tokens. Overrides the server's built-in prices; the current table is never
// sent back, so it is entered in full and saved whole.
import { computed, reactive } from 'vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Table, { type Column } from '@/components/ui/Table.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { pricesError, serializePrices, type PriceRow } from '@/control/settingEditors'

defineProps<{ id: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [value: string | null] }>()

type Row = PriceRow & { id: number }
let nextId = 1
const blank = (): Row => ({ id: nextId++, model: '', input: '', output: '', cacheRead: '' })
const rows = reactive<Row[]>([blank()])
let touched = false
function changed() {
  touched = true
  emit('change', serializePrices(rows))
}
function add() {
  rows.push(blank())
}
function remove(id: number) {
  const i = rows.findIndex((r) => r.id === id)
  if (i >= 0) rows.splice(i, 1)
  if (!rows.length) rows.push(blank())
  changed()
}
const rowOf = (r: Record<string, unknown>) => rows.find((x) => x.id === r.id)!
function setModel(r: Record<string, unknown>, v: string) {
  rowOf(r).model = v
  changed()
}
function setPrice(
  r: Record<string, unknown>,
  f: 'input' | 'output' | 'cacheRead',
  v: number | null,
) {
  rowOf(r)[f] = v === null ? '' : String(v)
  changed()
}
const num = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

const columns: Column[] = [
  { key: 'model', label: 'Model' },
  { key: 'input', label: 'Input $/M', align: 'right' },
  { key: 'output', label: 'Output $/M', align: 'right' },
  { key: 'cacheRead', label: 'Cache read $/M', align: 'right' },
  { key: 'remove', label: '' },
]
const error = computed(() => (touched ? pricesError(rows) : null))
defineExpose({ error })
</script>

<template>
  <div :id="id" class="pe" role="group" aria-label="Model prices, USD per million tokens">
    <Table :columns="columns" :rows="rows" caption="Model prices, USD per million tokens">
      <template #cell-model="{ row }">
        <TextInput
          :model-value="String(row.model)"
          size="sm"
          placeholder="claude-opus-5-5"
          :aria-label="`Model ${rows.indexOf(rowOf(row)) + 1}`"
          :disabled="disabled"
          autocomplete="off"
          @update:model-value="setModel(row, String($event ?? ''))"
        />
      </template>
      <template
        v-for="f in ['input', 'output', 'cacheRead'] as const"
        :key="f"
        #[`cell-${f}`]="{ row }"
      >
        <NumberInput
          :model-value="num(String(row[f]))"
          :min="0"
          :step="0.01"
          size="sm"
          :placeholder="f === 'cacheRead' ? 'built-in' : '0.00'"
          :aria-label="`${f === 'cacheRead' ? 'Cache read' : f === 'input' ? 'Input' : 'Output'} price for model ${rows.indexOf(rowOf(row)) + 1}`"
          :disabled="disabled"
          @update:model-value="setPrice(row, f, $event)"
        />
      </template>
      <template #cell-remove="{ row }">
        <IconButton
          size="sm"
          variant="ghost"
          :label="`Remove model ${rows.indexOf(rowOf(row)) + 1}`"
          :disabled="disabled"
          @click="remove(Number(row.id))"
        >
          <Icon name="x" size="xs" />
        </IconButton>
      </template>
    </Table>
    <div class="tp-row">
      <Button size="sm" variant="secondary" :disabled="disabled" @click="add">Add model</Button>
    </div>
    <p v-if="error" class="pe__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.pe {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.pe__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-danger);
}
</style>

<script setup lang="ts">
// AI_MODEL_PRICES: a small table of model → input / output / cache-read price,
// USD per million tokens. Overrides the server's built-in prices; the current
// table is never sent back, so it is entered in full and saved whole.
import { computed, reactive } from 'vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { pricesError, serializePrices, type PriceRow } from '@/control/settingEditors'

defineProps<{ id: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [value: string | null] }>()

const rows = reactive<PriceRow[]>([{ model: '', input: '', output: '', cacheRead: '' }])
let touched = false
function changed() {
  touched = true
  emit('change', serializePrices(rows))
}
function add() {
  rows.push({ model: '', input: '', output: '', cacheRead: '' })
}
function remove(i: number) {
  rows.splice(i, 1)
  if (!rows.length) add()
  changed()
}
const error = computed(() => (touched ? pricesError(rows) : null))
defineExpose({ error })
const fields = ['input', 'output', 'cacheRead'] as const
const HEAD: Record<(typeof fields)[number], string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
}
</script>

<template>
  <div :id="id" class="pe" role="group" aria-label="Model prices, USD per million tokens">
    <div class="pe__scroll">
      <table class="pe__table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th v-for="f in fields" :key="f" scope="col">{{ HEAD[f] }} <span>$/M</span></th>
            <th scope="col"><span class="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td>
              <TextInput
                v-model="r.model"
                size="sm"
                placeholder="claude-opus-5-5"
                :aria-label="`Model ${i + 1}`"
                :disabled="disabled"
                autocomplete="off"
                @update:model-value="changed"
              />
            </td>
            <td v-for="f in fields" :key="f">
              <TextInput
                v-model="r[f]"
                size="sm"
                inputmode="decimal"
                :placeholder="f === 'cacheRead' ? 'built-in' : '0.00'"
                :aria-label="`${HEAD[f]} price for model ${i + 1}`"
                :disabled="disabled"
                @update:model-value="changed"
              />
            </td>
            <td>
              <Button
                size="sm"
                variant="ghost"
                :aria-label="`Remove model ${i + 1}`"
                :disabled="disabled"
                @click="remove(i)"
                >×</Button
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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
/* The table scrolls inside its own box on a phone; the page never does. */
.pe__scroll {
  max-width: 100%;
  overflow-x: auto;
}
.pe__table {
  width: 100%;
  min-width: 30rem;
  border-collapse: collapse;
}
.pe__table th {
  padding: 0 var(--sp-1) var(--sp-1);
  text-align: left;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
}
.pe__table th span {
  font-weight: var(--weight-normal);
}
.pe__table td {
  padding: 2px var(--sp-1);
  vertical-align: top;
}
.pe__table td:first-child {
  min-width: 10rem;
}
.pe__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-danger);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>

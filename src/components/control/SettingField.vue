<script setup lang="ts">
// One runtime setting: its key, where its value comes from, the mask, and the
// editor that fits it (src/control/aiSettings.ts):
//
//   switch  bool keys (OPENROUTER_ENABLED, ANTHROPIC_ENABLED, …)
//   select  the provider choices (AI_DEFAULT_EXTERNAL_PROVIDER, AGENT_*_PROVIDER)
//   prices  ANTHROPIC_MODEL_PRICES / GEMINI_MODEL_PRICES as a table
//   text    everything else, a password field for secrets
//
// Writes go through the shared writer (useSettingWriter), so a secret still asks
// for the admin's password and nothing typed outlives the send.
import { computed, reactive, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import TextInput from '@/components/ui/TextInput.vue'
import type { AiProvider, ModelCatalog } from '@/ai/aureonChat'
import {
  choicesFor,
  editorFor,
  enabledNow,
  keyNote,
  priceError,
  priceSeed,
  serializePrices,
  type PriceRow,
} from '@/control/aiSettings'
import { expiryChip, sourceChip, type SettingRow } from '@/control/settings'
import type { SettingWriter } from '@/control/useSettingWriter'
import { when } from '@/trading/format'

const props = defineProps<{
  row: SettingRow
  writer: SettingWriter
  encryptionReady: boolean
  catalog?: ModelCatalog | null
}>()

const w = props.writer
const editor = computed(() => editorFor(props.row))
const note = computed(() => keyNote(props.row.key))
const busy = computed(() => w.busy.value === props.row.key && !w.pending.value)
const canWrite = computed(() => props.encryptionReady)

function inputType(row: SettingRow): 'password' | 'text' {
  return row.is_secret ? 'password' : 'text'
}

function placeholder(row: SettingRow): string {
  if (row.kind === 'json_list') return '["owner/name"]'
  if (row.kind === 'csv') return 'a, b, c'
  if (row.kind === 'decimal' || row.kind === 'float') return '0.00'
  if (row.kind === 'int') return '0'
  return row.is_set ? 'New value' : 'Value'
}

// --- switch ---------------------------------------------------------------------------------
const nowOn = computed(() => enabledNow(props.catalog ?? null, props.row.key))
function setBool(on: boolean) {
  w.save(props.row, on ? 'true' : 'false')
}

// --- select ---------------------------------------------------------------------------------
const choices = computed(() => choicesFor(props.row.key) ?? [])
const choice = ref('')
function saveChoice() {
  if (choice.value) w.save(props.row, choice.value)
}

// --- prices ---------------------------------------------------------------------------------
const priceProvider = computed<AiProvider | null>(() =>
  props.row.key.startsWith('ANTHROPIC_')
    ? 'anthropic'
    : props.row.key.startsWith('GEMINI_')
      ? 'gemini'
      : null,
)
const seed = computed(() =>
  priceProvider.value ? priceSeed(props.catalog ?? null, priceProvider.value) : null,
)
// Memory only, like every draft.
const prices = reactive<PriceRow[]>([])
function resetPrices() {
  prices.splice(0, prices.length, ...(seed.value?.rows ?? [{ model: '', input: '', output: '' }]))
}
watch(seed, resetPrices, { immediate: true })
const touched = ref(false)
const pricesInvalid = computed(() => priceError(prices))
function addPrice() {
  prices.push({ model: '', input: '', output: '' })
}
function removePrice(i: number) {
  prices.splice(i, 1)
  if (!prices.length) addPrice()
}
function savePrices() {
  touched.value = true
  if (pricesInvalid.value) return
  w.save(props.row, serializePrices(prices))
}
watch(
  () => w.message.key === props.row.key && w.message.tone === 'ok',
  (saved) => {
    if (saved && editor.value === 'prices') {
      touched.value = false
      resetPrices()
    }
  },
)
</script>

<template>
  <li class="cc-set__row" :data-key="row.key">
    <div class="cc-set__head">
      <code class="cc-set__key">{{ row.key }}</code>
      <Badge v-bind="sourceChip(row)" />
      <Badge v-if="expiryChip(row)" v-bind="expiryChip(row)!" />
      <!-- A mask only ("••••abcd"): the server never sends a value. -->
      <span v-if="row.masked" class="cc-set__mask" aria-label="Masked value">{{ row.masked }}</span>
    </div>
    <p class="tp-note">
      {{ row.description }}
      <span v-if="row.updated_at"> · changed {{ when(row.updated_at) }}</span>
      <span v-if="row.expires_at"> · expires {{ when(row.expires_at) }}</span>
    </p>
    <p v-if="note" class="tp-note" data-testid="key-note">{{ note }}</p>

    <p v-if="row.managed" class="tp-note">
      Set by <strong>Connect</strong> in the Dhan connection above; it cannot be typed in.
    </p>

    <div v-else-if="editor === 'switch'" class="tp-row cc-set__form">
      <Switch
        v-if="nowOn !== null"
        :model-value="nowOn"
        :label="nowOn ? 'On' : 'Off'"
        :disabled="!canWrite || busy"
        @update:model-value="setBool($event)"
      />
      <template v-else>
        <Button size="sm" :disabled="!canWrite" :loading="busy" @click="setBool(true)"
          >Turn on</Button
        >
        <Button
          size="sm"
          variant="secondary"
          :disabled="!canWrite"
          :loading="busy"
          @click="setBool(false)"
          >Turn off</Button
        >
      </template>
    </div>

    <form v-else-if="editor === 'select'" class="tp-row cc-set__form" @submit.prevent="saveChoice">
      <Select
        v-model="choice"
        :options="choices"
        size="sm"
        placeholder="Choose…"
        :aria-label="`New value for ${row.key}`"
      />
      <Button type="submit" size="sm" :loading="busy" :disabled="!canWrite || !choice">{{
        row.source === 'db' ? 'Replace' : 'Set'
      }}</Button>
    </form>

    <form
      v-else-if="editor === 'prices'"
      class="cc-prices"
      data-testid="price-table"
      @submit.prevent="savePrices"
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Input $/M</th>
            <th scope="col">Output $/M</th>
            <th scope="col"><span class="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in prices" :key="i">
            <td>
              <TextInput
                v-model="p.model"
                placeholder="model id"
                :aria-label="`Model ${i + 1}`"
                autocomplete="off"
              />
              <span
                v-if="p.model && seed?.priced[p.model] !== undefined"
                class="cc-prices__state"
                :class="{ 'is-missing': !seed?.priced[p.model] }"
                >{{ seed?.priced[p.model] ? 'priced now' : 'no price — never used' }}</span
              >
            </td>
            <td>
              <TextInput
                v-model="p.input"
                placeholder="0.00"
                inputmode="decimal"
                :aria-label="`Input price for model ${i + 1}`"
              />
            </td>
            <td>
              <TextInput
                v-model="p.output"
                placeholder="0.00"
                inputmode="decimal"
                :aria-label="`Output price for model ${i + 1}`"
              />
            </td>
            <td>
              <Button
                size="sm"
                variant="ghost"
                :aria-label="`Remove model ${i + 1}`"
                @click="removePrice(i)"
                >×</Button
              >
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="touched && pricesInvalid" class="tp-note" role="alert">{{ pricesInvalid }}</p>
      <div class="tp-row">
        <Button size="sm" variant="secondary" @click="addPrice">Add model</Button>
        <Button type="submit" size="sm" :loading="busy" :disabled="!canWrite">{{
          row.source === 'db' ? 'Replace prices' : 'Set prices'
        }}</Button>
      </div>
    </form>

    <form v-else class="tp-row cc-set__form" @submit.prevent="w.save(row)">
      <TextInput
        v-model="w.drafts[row.key]"
        :type="inputType(row)"
        :placeholder="placeholder(row)"
        :aria-label="`New value for ${row.key}`"
        autocomplete="off"
      />
      <Button type="submit" size="sm" :loading="busy" :disabled="!canWrite">{{
        row.source === 'db' ? 'Replace' : 'Set'
      }}</Button>
    </form>

    <div v-if="!row.managed && row.source === 'db'" class="tp-row">
      <Button size="sm" variant="secondary" :loading="busy" @click="w.revert(row)"
        >Revert to .env</Button
      >
    </div>
    <p
      v-if="w.message.key === row.key && w.message.text"
      class="tp-note"
      :role="w.message.tone === 'error' ? 'alert' : 'status'"
    >
      {{ w.message.text }}
    </p>
  </li>
</template>

<style scoped>
.cc-set__row {
  display: grid;
  gap: var(--sp-2);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--glass-border);
  min-width: 0;
}

.cc-set__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
}

.cc-set__key {
  min-width: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.cc-set__mask {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.cc-set__form {
  flex-wrap: wrap;
}

.cc-set__form > :first-child {
  flex: 1 1 16rem;
  min-width: 0;
}

.cc-prices {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
  overflow-x: auto;
}

.cc-prices table {
  width: 100%;
  border-collapse: collapse;
}

.cc-prices th {
  text-align: left;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  padding: 0 var(--sp-1) var(--sp-1);
}

.cc-prices td {
  padding: 2px var(--sp-1);
  vertical-align: top;
  min-width: 0;
}

.cc-prices td:first-child {
  min-width: 10rem;
}

.cc-prices td:nth-child(2),
.cc-prices td:nth-child(3) {
  width: 7rem;
  min-width: 5rem;
}

.cc-prices__state {
  display: block;
  margin-top: 2px;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}

.cc-prices__state.is-missing {
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

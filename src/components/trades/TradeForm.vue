<script setup lang="ts">
// The entry form (section 28).
//
// Two typed prices and everything else is a default: the date is today, the lot
// is the one from settings, the symbol is the last one traded and the session
// and side keep whatever they were. What the form will store — the move and the
// P/L — is shown live above the button, because those are the two numbers the
// trader is actually checking, and finding out after submitting is finding out
// too late.
//
// The symbol is asked for on every entry rather than being pinned to the tab:
// a month is usually one instrument, but the day it is not is the day a P/L
// silently computed at the wrong contract size would be worst.
import { computed, ref, watch } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import Combobox from '@/components/ui/Combobox.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Button from '@/components/ui/Button.vue'
import Alert from '@/components/ui/Alert.vue'
import Modal from '@/components/ui/Modal.vue'
import IconSymbol from '@/components/icons/IconSymbol.vue'
import IconBuy from '@/components/icons/IconBuy.vue'
import IconSell from '@/components/icons/IconSell.vue'
import { useForm } from '@/composables/useForm'
import { tradeFormSchema } from '@/utils/formSchemas'
import {
  TRADE_SESSIONS,
  contractSizeFor,
  isKnownSymbol,
  signOf,
  signed2,
  todayYmd,
  tradeMove,
  tradePl,
} from '@/utils/tradeMath'
import type { NewTrade } from '@/composables/useTradeLog'
import type { LoggerSettings, TradeSession, TradeSide } from '@/types'

const props = defineProps<{ settings: LoggerSettings; busy?: boolean }>()
const emit = defineEmits<{
  submit: [NewTrade]
  /** A symbol nobody has sized yet, with the size the trader gave for it. */
  sizeSymbol: [{ symbol: string; size: number }]
}>()

const SESSION_SEGMENTS = TRADE_SESSIONS.map((s) => ({ value: s, label: s }))
const SIDE_SEGMENTS = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
]

const form = useForm({
  initial: {
    date: todayYmd(),
    symbol: props.settings.lastSymbol,
    session: 'London' as TradeSession,
    side: 'buy' as TradeSide,
    lot: props.settings.defaultLot as number | null,
    entry: null as number | null,
    exit: null as number | null,
    note: '',
  },
  schema: tradeFormSchema,
  onSubmit: async (values) => {
    emit('submit', {
      date: values.date,
      symbol: String(values.symbol).trim().toUpperCase(),
      session: values.session,
      side: values.side,
      lot: Number(values.lot),
      entry: Number(values.entry),
      exit: Number(values.exit),
      note: values.note,
    })
  },
})

// The stored defaults arrive after the first paint (the settings document is
// read over the network), so the untouched fields follow them in. Guarded on
// `dirty` so this never overwrites something half-typed.
watch(
  () => [props.settings.lastSymbol, props.settings.defaultLot] as const,
  ([symbol, lot]) => {
    if (form.dirty.value) return
    form.values.symbol = symbol
    form.values.lot = lot
  },
)

const symbolOptions = computed(() =>
  Object.keys(props.settings.contractSizes)
    .sort()
    .map((value) => ({ value, label: value })),
)

const contractSize = computed(() =>
  contractSizeFor(props.settings.contractSizes, String(form.values.symbol)),
)

// The live preview. Nulls read as nothing rather than as zero: "0.00" before a
// price has been typed is a number the form is inventing.
const preview = computed(() => {
  const { entry, exit, lot, side } = form.values
  if (entry == null || exit == null || lot == null) return null
  const move = tradeMove(side, entry, exit)
  return { move, pl: tradePl(move, lot, contractSize.value) }
})

/** The class suffix for a figure: its own sign, never which figure it is. */
function sign(value: number | null | undefined): 'pos' | 'neg' | 'flat' {
  return value == null ? 'flat' : signOf(value)
}

// --- an unknown symbol ------------------------------------------------------
// Asked once, the first time a symbol is used, because the contract size is the
// difference between a P/L and a number that looks like one.
const sizingSymbol = ref('')
const sizingValue = ref<number | null>(null)
const sizingError = ref('')

function onSymbol(next: string) {
  form.values.symbol = next.trim().toUpperCase()
  form.change('symbol')
  askIfUnknown()
}

function onCreateSymbol(query: string) {
  onSymbol(query)
}

function askIfUnknown() {
  const symbol = String(form.values.symbol).trim().toUpperCase()
  if (!symbol || isKnownSymbol(props.settings.contractSizes, symbol)) return
  sizingSymbol.value = symbol
  sizingValue.value = null
  sizingError.value = ''
}

function confirmSize() {
  if (sizingValue.value == null || sizingValue.value <= 0) {
    sizingError.value = 'Enter the contract size — how much one point is worth per lot.'
    return
  }
  emit('sizeSymbol', { symbol: sizingSymbol.value, size: sizingValue.value })
  sizingSymbol.value = ''
}

/** Focused by ⌘K and by the toolbar's create button. */
const entryField = ref<HTMLElement | null>(null)
defineExpose({
  focus: () => entryField.value?.querySelector('input')?.focus(),
})

async function onSubmit() {
  const ok = await form.submit()
  if (!ok) return
  // The prices go, the context stays: the next trade is usually the same
  // symbol, session and side, and re-picking all three is why a log stops
  // being kept by the third day. Through `reset` rather than by clearing the
  // fields, so the emptied prices are not immediately marked invalid.
  const { date, symbol, session, side, lot } = form.values
  form.reset({ date, symbol, session, side, lot, entry: null, exit: null, note: '' })
  entryField.value?.querySelector('input')?.focus()
}
</script>

<template>
  <form class="tform" novalidate @submit.prevent="onSubmit">
    <div class="tform__grid">
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

      <FormField
        label="Symbol"
        hint="Asked every time — the contract size depends on it"
        :error="form.errorFor('symbol')"
        v-slot="f"
      >
        <div data-field="symbol">
          <Combobox
            v-bind="f"
            :model-value="String(form.values.symbol)"
            :options="symbolOptions"
            creatable
            placeholder="XAUUSD"
            empty-text="New symbol — pick Create to size it"
            @update:model-value="onSymbol"
            @create="onCreateSymbol"
          />
        </div>
      </FormField>

      <FormField label="Session" :error="form.errorFor('session')" v-slot="f">
        <div data-field="session">
          <SegmentedControl
            :size="f.size"
            :disabled="f.disabled"
            :model-value="form.values.session"
            :options="SESSION_SEGMENTS"
            aria-label="Session"
            @update:model-value="
              ((form.values.session = $event as TradeSession), form.change('session'))
            "
          />
        </div>
      </FormField>

      <FormField label="Side" :error="form.errorFor('side')" v-slot="f">
        <div data-field="side">
          <SegmentedControl
            :size="f.size"
            :disabled="f.disabled"
            :model-value="form.values.side"
            :options="SIDE_SEGMENTS"
            aria-label="Side"
            @update:model-value="((form.values.side = $event as TradeSide), form.change('side'))"
          />
        </div>
      </FormField>

      <FormField label="Lot" :error="form.errorFor('lot')" v-slot="f">
        <div data-field="lot">
          <NumberInput
            v-bind="f"
            v-model="form.values.lot"
            :step="0.01"
            :min="0"
            @update:model-value="form.change('lot')"
            @blur="form.blur('lot')"
          />
        </div>
      </FormField>

      <FormField label="Entry" :error="form.errorFor('entry')" v-slot="f">
        <div ref="entryField" data-field="entry">
          <NumberInput
            v-bind="f"
            v-model="form.values.entry"
            :step="0.01"
            @update:model-value="form.change('entry')"
            @blur="form.blur('entry')"
          />
        </div>
      </FormField>

      <FormField label="Exit" :error="form.errorFor('exit')" v-slot="f">
        <div data-field="exit">
          <NumberInput
            v-bind="f"
            v-model="form.values.exit"
            :step="0.01"
            @update:model-value="form.change('exit')"
            @blur="form.blur('exit')"
          />
        </div>
      </FormField>

      <FormField label="Note" hint="Optional" :error="form.errorFor('note')" v-slot="f">
        <div data-field="note">
          <TextInput
            v-bind="f"
            v-model="form.values.note"
            placeholder="What you saw"
            @update:model-value="form.change('note')"
            @blur="form.blur('note')"
          />
        </div>
      </FormField>
    </div>

    <Alert v-if="form.formError.value" tone="danger">{{ form.formError.value }}</Alert>

    <div class="tform__foot">
      <!-- Live, and labelled: the two numbers the row will carry, before it is
           a row. `aria-live` so a screen-reader user gets them too. -->
      <dl class="tform__preview ui-tabular" aria-live="polite">
        <div class="tform__cell">
          <dt class="ui-label">
            <IconBuy v-if="form.values.side === 'buy'" :size="12" />
            <IconSell v-else :size="12" />
            Move
          </dt>
          <dd class="tform__value" :class="`is-${sign(preview?.move)}`">
            {{ preview ? signed2(preview.move) : '—' }}
          </dd>
        </div>
        <div class="tform__cell">
          <dt class="ui-label">P/L</dt>
          <dd class="tform__value" :class="`is-${sign(preview?.pl)}`">
            {{ preview ? signed2(preview.pl) : '—' }}
          </dd>
        </div>
        <div class="tform__cell">
          <dt class="ui-label">
            <IconSymbol :size="12" />
            Contract
          </dt>
          <dd class="tform__value">×{{ contractSize }}</dd>
        </div>
      </dl>
      <Button type="submit" :loading="busy || form.submitting.value">Log trade</Button>
    </div>

    <Modal
      :open="!!sizingSymbol"
      :title="`Contract size for ${sizingSymbol}`"
      size="sm"
      @close="sizingSymbol = ''"
    >
      <p class="tform__ask">
        How much is one point of {{ sizingSymbol }} worth, per lot? Gold is 100, silver 5000, an
        index 1. It is asked once and then remembered.
      </p>
      <FormField label="Contract size" :error="sizingError" v-slot="f">
        <NumberInput v-bind="f" v-model="sizingValue" :min="0" :step="1" />
      </FormField>
      <template #footer>
        <Button variant="ghost" @click="sizingSymbol = ''">Not now</Button>
        <Button @click="confirmSize">Save</Button>
      </template>
    </Modal>
  </form>
</template>

<style scoped>
/* The raised layer, like every other panel on this tab. */
.tform {
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
.tform__cell .ui-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tform__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
}
.tform__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.tform__preview {
  display: flex;
  gap: var(--sp-5);
  margin: 0;
  min-width: 0;
}
.tform__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tform__value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-md);
  line-height: var(--lh-md);
  color: var(--text-primary, var(--theme-text));
}
/* Sign, not metric: a gain is the success token and a loss the danger one, and
   a flat row stays ordinary text rather than being coloured for having a name. */
.tform__value.is-pos {
  color: var(--theme-success);
}
.tform__value.is-neg {
  color: var(--theme-danger);
}
.tform__ask {
  margin: 0 0 var(--sp-3);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-secondary, var(--theme-dim));
}
</style>

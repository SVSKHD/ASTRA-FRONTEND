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
import { computed, nextTick, ref, watch } from 'vue'
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
  tradeMove,
  tradePl,
} from '@/utils/tradeMath'
import { signed2 } from '@/utils/format'
import {
  IST,
  hhmmOn,
  instantFromWall,
  offsetLabel,
  offsetAt,
  sessionAt,
  ymdOn,
  type Clock,
} from '@/utils/tradeTime'
import type { TradeDraft } from '@/services/tradeDoc'
import type { AstraSettings, TradeSession, TradeSide } from '@/types'

/**
 * What the desk asks the form to become at T-5 (section 34).
 *
 * A request, not a value: it carries the instant it was raised so the same
 * arming cannot be applied twice, and it never touches a field the trader has
 * already typed into.
 */
export interface ArmRequest {
  at: number
  session: TradeSession
  symbol: string
  istDate: string
  istTime: string
  signalId?: string
}

const props = defineProps<{ settings: AstraSettings; busy?: boolean; arm?: ArmRequest | null }>()
const emit = defineEmits<{
  submit: [TradeDraft]
  /** A symbol nobody has sized yet, with the size the trader gave for it. */
  sizeSymbol: [{ symbol: string; size: number }]
}>()

const SESSION_SEGMENTS = TRADE_SESSIONS.map((s) => ({ value: s, label: s }))
const SIDE_SEGMENTS = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
]

// The trader's own clock, and the one the form defaults to. Read through the
// IST zone rather than from the machine's locale: a laptop left on London time
// would otherwise log a 19:42 trade as 14:12 and put it in the wrong session.
const nowIst = Date.now()

const form = useForm({
  initial: {
    istDate: ymdOn(IST, nowIst),
    istTime: hhmmOn(IST, nowIst),
    exitTime: '',
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
      istDate: values.istDate,
      istTime: values.istTime,
      exitTime: values.exitTime,
      signalId: armedSignal.value,
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

// --- the two clocks (section 31) ---------------------------------------------
//
// The form takes ONE reading — the IST wall clock — and everything below is
// derived from the instant it names. Broker time is never the IST string with
// hours added to it: that arithmetic is wrong on the day the broker's clock
// changes and wrong again about which day it is whenever it crosses midnight.
const broker = computed<Clock>(() => ({
  zone: props.settings.brokerTimezone,
  offsetMinutes: props.settings.brokerOffsetMinutes,
}))

const entryAt = computed(() =>
  instantFromWall(IST, String(form.values.istDate), String(form.values.istTime)),
)

const clocks = computed(() => {
  const at = entryAt.value
  if (at == null) return null
  return {
    ist: hhmmOn(IST, at),
    broker: hhmmOn(broker.value, at),
    offset: offsetLabel(offsetAt(broker.value, at)),
  }
})

/** What the boundaries say, read on the broker's clock. `null` = out of hours. */
const derivedSession = computed(() =>
  entryAt.value == null
    ? null
    : sessionAt(broker.value, props.settings.sessionBounds, entryAt.value),
)

// The dropdown is pre-selected from the time and stays that way until somebody
// disagrees with it. After that it is theirs: a control that keeps correcting
// its owner is a control that gets ignored.
const sessionOverridden = ref(false)
watch(derivedSession, (next) => {
  if (next && !sessionOverridden.value) form.values.session = next
})
watch(
  () => form.values.session,
  (next) => {
    if (derivedSession.value && next !== derivedSession.value) sessionOverridden.value = true
  },
)

/** An override, stated rather than silently accepted. */
const sessionMismatch = computed(() =>
  derivedSession.value && derivedSession.value !== form.values.session
    ? `The broker clock puts this in ${derivedSession.value}.`
    : '',
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

// --- arming (section 34) ----------------------------------------------------
//
// Five minutes before the open the desk asks for the form to be ready. Ready
// means the four fields nobody thinks about are already right — date, IST time,
// session and the symbol last traded — so the trade costs one number and Enter.
//
// It never overwrites a price, and never re-arms for the same request: a form
// that keeps refilling itself while somebody is typing in it is worse than one
// that does nothing.
const armedSignal = ref('')
let lastArm = 0

watch(
  () => props.arm,
  (arm) => {
    if (!arm || arm.at === lastArm) return
    lastArm = arm.at
    form.values.istDate = arm.istDate
    form.values.istTime = arm.istTime
    form.values.session = arm.session
    if (arm.symbol) form.values.symbol = arm.symbol
    armedSignal.value = arm.signalId ?? ''
    // The cursor goes where the only unknown is.
    void nextTick(() => entryField.value?.querySelector('input')?.focus())
  },
)

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
  const { istDate, symbol, session, side, lot } = form.values
  // The clock moves on with the trader: the next entry defaults to now, not to
  // the time of the one just logged.
  armedSignal.value = ''
  form.reset({
    istDate,
    istTime: hhmmOn(IST, Date.now()),
    exitTime: '',
    symbol,
    session,
    side,
    lot,
    entry: null,
    exit: null,
    note: '',
  })
  entryField.value?.querySelector('input')?.focus()
}
</script>

<template>
  <form class="tform" novalidate @submit.prevent="onSubmit">
    <div class="tform__grid">
      <FormField label="Date" :error="form.errorFor('istDate')" v-slot="f">
        <div data-field="istDate">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :disabled="f.disabled"
            v-model="form.values.istDate"
            mode="date"
            :clearable="false"
            @update:model-value="form.change('istDate')"
          />
        </div>
      </FormField>

      <FormField label="Entry time (IST)" :error="form.errorFor('istTime')" v-slot="f">
        <div data-field="istTime">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :disabled="f.disabled"
            v-model="form.values.istTime"
            mode="time"
            :clearable="false"
            @update:model-value="form.change('istTime')"
          />
        </div>
      </FormField>

      <FormField
        label="Exit time (IST)"
        hint="Optional — leave it if the trade is still open"
        :error="form.errorFor('exitTime')"
        v-slot="f"
      >
        <div data-field="exitTime">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :disabled="f.disabled"
            v-model="form.values.exitTime"
            mode="time"
            @update:model-value="form.change('exitTime')"
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

      <FormField
        label="Session"
        :hint="sessionMismatch || undefined"
        :error="form.errorFor('session')"
        v-slot="f"
      >
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

    <!-- Both readings of the one instant, before it is stored. The broker time
         is computed from the instant every time it is shown; it is never the
         IST string with an offset added to it. -->
    <p v-if="clocks" class="tform__clocks ui-mono" aria-live="polite">
      IST {{ clocks.ist }} <span class="tform__dot" aria-hidden="true">·</span> Broker
      {{ clocks.broker }}
      <span class="tform__offset">GMT{{ clocks.offset }}</span>
    </p>

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
/* The pair, stated plainly. Mono because they are read against each other, and
   secondary because it is a confirmation of what was typed, not a field. */
.tform__clocks {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.tform__dot {
  padding: 0 var(--sp-1);
  color: var(--text-muted, var(--theme-dim));
}
.tform__offset {
  padding-left: var(--sp-2);
  color: var(--text-muted, var(--theme-dim));
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

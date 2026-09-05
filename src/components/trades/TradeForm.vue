<script setup lang="ts">
// The entry form (section 28, collapsed in 44).
//
// ONE ROW, AND IT EXPANDS WHEN YOU FOCUS IT.
//
// The form had ten fields laid out in a grid, and nine of them were already
// correct before anybody touched the page: the date is today, the entry time is
// now, the symbol is the last one traded, the session is what the broker's clock
// says, the side and the lot are whatever they were last. Showing ten fields to
// collect three is not neutral — it is ten things to read past at the one moment
// there is least time to read anything, which is the open.
//
// So the resting state is a single row: Entry, Exit, Lot and the button, with
// everything the form already knows stated beside them as text. Focus anything
// in it and the rest unfolds underneath, because "already correct" is not
// "never wrong" — the day the symbol is not the last one traded is the day a P/L
// computed at the wrong contract size would be worst, and that day has to be one
// click away rather than a preference.
//
// It collapses again when focus leaves entirely, never while you are in it: a
// panel that folds up mid-edit is worse than one that never folded.
//
// ENTER SUBMITS. The three fields are number inputs inside a real `<form>` with
// a real submit button, so this is the browser's own behaviour rather than a
// key handler — which is why it also works from the lot field, and why a picker
// that swallows Enter for its own panel does not break it.
//
// What the form will store — the move and the P/L — is shown live beside the
// button, because those are the two numbers the trader is actually checking, and
// finding out after submitting is finding out too late.
import { computed, nextTick, ref, watch } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import Combobox from '@/components/ui/Combobox.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Button from '@/components/ui/Button.vue'
import Alert from '@/components/ui/Alert.vue'
import SymbolSizePrompt from '@/components/trades/SymbolSizePrompt.vue'
import TradePreview from '@/components/trades/TradePreview.vue'
import { useForm } from '@/composables/useForm'
import { tradeFormSchema } from '@/utils/formSchemas'
import {
  TRADE_SESSIONS,
  contractSizeFor,
  isKnownSymbol,
  tradeMove,
  tradePl,
} from '@/utils/tradeMath'
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
import type { SaveState as SaveStateValue } from '@/composables/useSaveState'
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

const props = defineProps<{
  settings: AstraSettings
  /** The save's three states, owned by the view that does the writing. */
  saving?: SaveStateValue
  arm?: ArmRequest | null
}>()
const emit = defineEmits<{
  /**
   * The draft, and a way to say whether it was captured (section 42).
   *
   * A callback rather than a bare event because the answer decides whether this
   * form clears itself, and it must not clear before the trade is actually in
   * hand: a rejected write that has already emptied the fields is a trade that
   * has to be typed twice, from memory, at the worst possible moment.
   */
  submit: [draft: TradeDraft, captured: (ok: boolean) => void]
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
    const captured = await new Promise<boolean>((resolve) => {
      emit(
        'submit',
        {
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
        },
        resolve,
      )
    })
    // Thrown, so `useForm` reports it as a form-level failure and `submit()`
    // returns false — which is what keeps the typed values on screen.
    if (!captured) throw new Error('That trade was not captured. The values are still here.')
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
//
// `immediate`, and that is a fix rather than a tidy-up. Without it the watcher
// only fired on a CHANGE to the derived session, so the form opened holding its
// hard-coded 'London' default while the hint underneath said "The broker clock
// puts this in NY" — the control contradicting its own explanation, on the
// resting state of the form, at every hour outside London. It matters more now
// that the field is behind a fold: a trader who never opens the panel is
// trusting the pre-fill, and the pre-fill has to be the pre-fill.
const sessionOverridden = ref(false)
watch(
  derivedSession,
  (next) => {
    if (next && !sessionOverridden.value) form.values.session = next
  },
  { immediate: true },
)
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
    // The cursor goes where the only unknown is. The panel unfolds as a
    // consequence of the focus rather than by being told to, which is the same
    // path a click takes — one behaviour, not two.
    void nextTick(() => entryField.value?.querySelector('input')?.focus())
  },
)

// --- an unknown symbol ------------------------------------------------------
// Asked once, the first time a symbol is used, because the contract size is the
// difference between a P/L and a number that looks like one.
const sizingSymbol = ref('')

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
}

function onSized(answer: { symbol: string; size: number }) {
  emit('sizeSymbol', answer)
  sizingSymbol.value = ''
}

/** Focused by ⌘K and by the toolbar's create button. */
const entryField = ref<HTMLElement | null>(null)
defineExpose({
  focus: () => {
    // Focusing the form is a request to LOG something, so it goes to the first
    // field that actually needs typing rather than to the top of the panel.
    entryField.value?.querySelector('input')?.focus()
  },
})

// --- collapse / expand ------------------------------------------------------
//
// Driven by focus, not by a toggle button, because the request was "expands only
// when I focus it" and because a disclosure control is one more thing between
// the trader and the three numbers.
//
// `focusout` fires before `focusin` on the element being moved to, and its
// `relatedTarget` is where focus is going — which is `null` when focus leaves
// the document entirely (alt-tab, devtools). Collapsing on a null would fold the
// panel up every time the window loses focus with a half-typed trade in it, so
// a null keeps it open and only a move to something OUTSIDE the form closes it.
const expanded = ref(false)
const root = ref<HTMLFormElement | null>(null)

function onFocusIn() {
  expanded.value = true
}
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next) return
  if (root.value?.contains(next)) return
  expanded.value = false
}

/**
 * What the row states rather than asks for.
 *
 * Read as one line — `2026-09-04 · 19:42 · XAUUSD · NY · Buy` — because these
 * are five facts about one trade and five separate chips would read as five
 * controls that happen to be disabled.
 */
const context = computed(() =>
  [
    String(form.values.istDate),
    String(form.values.istTime),
    String(form.values.symbol) || '—',
    form.values.session,
    form.values.side === 'buy' ? 'Buy' : 'Sell',
  ].join(' · '),
)

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
  <form
    ref="root"
    class="tform"
    :class="{ 'is-expanded': expanded }"
    novalidate
    @submit.prevent="onSubmit"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <!-- THE ROW. Three fields, the context it already knows, and the button.
         Everything here is always visible; nothing here is a disclosure. -->
    <div class="tform__row">
      <div class="tform__three">
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
      </div>

      <!-- The state is the button's own icon, in a box that is the same size
           empty, spinning, checked or failed — so pressing this never moves the
           thing under the cursor. -->
      <Button type="submit" :state="saving ?? (form.submitting.value ? 'working' : 'idle')">
        Log trade
      </Button>
    </div>

    <!-- What it already knows, on its own line.
         NOT in the row above: the form lives in a half-width column, and five
         facts competing with three number fields and a button for 650px is how
         "2026-09-04 · 19:42 · XAUUSD · NY · Buy" becomes "2026-09-04 · 19…".
         A line of its own is the only width that fits it.
         A button, because it is the way into the fields underneath for anybody
         not reaching for a keyboard — and `aria-expanded` so that is announced
         rather than implied. -->
    <button
      type="button"
      class="tform__context"
      :aria-expanded="expanded"
      aria-controls="tform-details"
      :title="expanded ? 'Hide the pre-filled fields' : 'Edit the pre-filled fields'"
      @click="expanded = !expanded"
    >
      <span class="tform__contextLabel">Filled in</span>
      <span class="tform__contextText ui-mono">{{ context }}</span>
    </button>

    <!-- The live preview stays with the row: it is a reading of what was just
         typed, not one of the fields underneath. -->
    <TradePreview
      :clocks="clocks"
      :preview="preview"
      :side="form.values.side"
      :contract-size="contractSize"
    />

    <Alert v-if="form.formError.value" tone="danger">{{ form.formError.value }}</Alert>

    <!-- EVERYTHING THE FORM ALREADY KNOWS. Correct before it is opened, and
         still editable, because "already correct" is not "never wrong".
         `v-show`, not `v-if`: these fields hold the values a submit reads, and
         a panel that unmounts on collapse would take a half-typed note with
         it. -->
    <div v-show="expanded" id="tform-details" class="tform__grid">
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
        hint="Pre-filled from the last trade — the contract size depends on it"
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

    <SymbolSizePrompt :symbol="sizingSymbol" @confirm="onSized" @dismiss="sizingSymbol = ''" />
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
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
/* The row. `align-items: end` so the button and the three fields sit on one
   baseline whatever a field's label wraps to. */
.tform__row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--sp-3);
  min-width: 0;
}
/* The three fields that are actually typed into. A floor of 96px rather than
   the grid's 150: these hold four or five digits, and giving them a text
   field's width is what pushed the button onto its own line at 1440. */
.tform__three {
  display: grid;
  grid-template-columns: repeat(3, minmax(96px, 1fr));
  gap: var(--sp-3);
  flex: 1 1 320px;
  min-width: 0;
}
/* What the form already knows, stated rather than asked. A full-width line
   under the row: five facts do not fit beside three number fields and a button
   in a half-width column, and truncating them to "2026-09-04 · 19…" states
   nothing. It still ellipsises, for the day a symbol is long. */
.tform__context {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  width: 100%;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px dashed var(--layer-raised-border);
  border-radius: var(--radius-control);
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.tform__contextLabel {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.tform__context:hover {
  border-style: solid;
  border-color: var(--accent, var(--theme-accent));
}
.tform__contextText {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
/* Expanded, the context line has nothing left to say that is not on screen
   underneath it — so it becomes the label for the panel rather than a summary
   of it. */
.tform.is-expanded .tform__context {
  border-style: solid;
}
.tform__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
  padding-top: var(--sp-2);
  border-top: 1px solid var(--layer-raised-border);
}

@media (max-width: 560px) {
  /* At 390px three number fields across is three fields of four characters.
     Two and a half is worse than two rows. */
  .tform__three {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* The pair, stated plainly. Mono because they are read against each other, and
   secondary because it is a confirmation of what was typed, not a field. */

/* Sign, not metric: a gain is the success token and a loss the danger one, and
   a flat row stays ordinary text rather than being coloured for having a name. */
</style>

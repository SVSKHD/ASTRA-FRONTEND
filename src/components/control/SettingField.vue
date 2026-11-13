<script setup lang="ts">
// One runtime setting, in the app's FormField shell (/ui → Forms): its name as
// the label, what it does as the hint, an error in the field's own error line,
// and the editor from the base kit that fits it (src/control/settingEditors.ts):
//
//   switch   Switch                        number   NumberInput, with its unit
//   secret   mask + Replace (TextInput)    url      TextInput, validated
//   effort   SegmentedControl              csv      TagInput chips
//   model    Select of the priced Claude models (AI_MODEL_MAIN / _ROUTER)
//   budgets  NumberInputs + live total     prices   Table of NumberInputs
//   cron     TextInput + plain English     json     TextArea, validated
//
// What is picked rather than typed (a model, the effort, a switch) applies at
// once — one click, a toast, no separate Save — since the choice is the whole
// change. Typed values keep Save (and Enter).
//
// Under it, ONE status line: where the value comes from (Badge), the value in use as
// a small mono chip, when it changed, and the row's actions (Reveal, Edit as text,
// Save only when changed, Discard, Revert to .env, Copy key). The full code block
// appears only where it earns its height: a JSON or long value, and a secret while
// it is revealed.
//
// The server sends the full value of a non-secret: each editor starts from it, and
// the value in use is shown as a code block under the field. "Edit as text" edits
// that exact value directly. A secret comes as a mask; Reveal shows it in full after
// the admin's password, for a minute. A change is anything that differs from the
// value in use (blank included, where blank means "off"). Writes go through the
// shared writer, so a secret still asks for the password and nothing typed
// outlives the send.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import TagInput from '@/components/ui/TagInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import BudgetsEditor from '@/components/control/settings/BudgetsEditor.vue'
import PricesEditor from '@/components/control/settings/PricesEditor.vue'
import ValueBlock from '@/components/control/settings/ValueBlock.vue'
import { cronToWords } from '@/control/cron'
import {
  draftError,
  editorFor,
  EFFORTS,
  keyNote,
  modelName,
  modelNow,
  modelOptions,
  parseBudgets,
  parseCsv,
  serializeCsv,
  type BudgetDraft,
} from '@/control/settingEditors'
import { expiryChip, labelOf, sourceChip, unitOf, type SettingRow } from '@/control/settings'
import { pretty } from '@/control/settingsDiagnostics'
import { blankAllowed, type SettingWriter } from '@/control/useSettingWriter'
import { when } from '@/trading/format'

const props = defineProps<{
  row: SettingRow
  writer: SettingWriter
  encryptionReady: boolean
  /** For AI_AGENT_BUDGETS_USD: the caps in use, and the monthly budget to compare with. */
  budgetSeed?: BudgetDraft | null
  monthlyBudget?: number | null
}>()

const w = props.writer
const TEXT_TOGGLE = ['switch', 'model', 'effort', 'budgets', 'prices', 'number', 'csv']
const editor = computed(() => editorFor(props.row))
const label = computed(() => labelOf(props.row.key))
// The written-out note where there is one (it says what the server's one-line
// description says, and more); the server's description otherwise.
const hint = computed(() => keyNote(props.row.key) || props.row.description)
const unit = computed(() => unitOf(props.row.key, props.row.kind))
const canWrite = computed(() => props.encryptionReady)
const busy = computed(() => w.busy.value === props.row.key && !w.pending.value)

const draft = computed(() => w.drafts[props.row.key])
const dirty = computed(() => draft.value !== undefined)
/** The full value in use (non-secrets; null for a secret or when unset). */
const current = computed(() => props.row.value ?? null)
/** What an editor shows: the draft while editing, else the value in use. */
const shown = computed(() => (dirty.value ? draft.value! : (current.value ?? '')))
const isJson = computed(() => props.row.kind === 'json_object' || props.row.kind === 'json_list')
/** A secret's full values, while revealed. */
const revealed = computed(() => w.revealed[props.row.key] ?? null)
const revealSecondsLeft = ref(0)
let tick: ReturnType<typeof setInterval> | undefined
watch(
  revealed,
  (r) => {
    clearInterval(tick)
    if (!r) return
    const update = () => {
      revealSecondsLeft.value = Math.max(0, Math.round((r.until - Date.now()) / 1000))
    }
    update()
    tick = setInterval(update, 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(tick))
const error = computed(() =>
  dirty.value && draft.value !== '' ? draftError(props.row, draft.value!) : null,
)

// --- structured editors report their own errors --------------------------------------------
const structured = ref<{ error: string | null } | null>(null)
const structuredError = computed(() => structured.value?.error ?? null)

const canSave = computed(
  () =>
    dirty.value &&
    canWrite.value &&
    !error.value &&
    !structuredError.value &&
    (draft.value !== '' || blankAllowed(props.row)),
)

function edit(value: string | null) {
  // Back to the value in use (or its pretty-printed form): nothing to save.
  const same =
    current.value !== null &&
    (value === current.value || (isJson.value && value === pretty(current.value, props.row.kind)))
  if (value === null || same) w.discard(props.row.key)
  else w.edit(props.row.key, value)
}
function save() {
  if (canSave.value) void w.save(props.row)
}

// --- switch: the mask ends with the value's last four characters ("••••true") ----------------
const boolNow = computed(() => {
  if (current.value !== null) return current.value === 'true'
  const m = props.row.masked ?? ''
  return m.endsWith('true') ? true : m.endsWith('alse') ? false : null
})
const boolValue = computed(() => (dirty.value ? draft.value === 'true' : (boolNow.value ?? false)))
/** A pick applies at once: no draft, no Save button — the choice is the whole change. */
function apply(value: string) {
  if (!canWrite.value || busy.value) return
  w.discard(props.row.key)
  void w.save(props.row, value)
}
function toggle(on: boolean) {
  // Back to what the server has: nothing to do.
  if (boolNow.value !== null && on === boolNow.value) return
  apply(on ? 'true' : 'false')
}

// --- model and effort: what is in effect, as far as the mask tells ------------------------
const modelInUse = computed(() => modelNow(props.row))
const modelChoices = computed(() => modelOptions(props.row.key))
const modelNote = computed(() => {
  const now = modelInUse.value
  if (now === null) return props.row.masked ? `In use: ${props.row.masked}` : ''
  const name = now === '' ? 'Off' : modelName(now)
  return props.row.source === 'default' ? `In use: ${name} (server default)` : `In use: ${name}`
})
function pickModel(v: string) {
  if (v === modelInUse.value) return
  apply(v)
}
const effortNow = computed(() => {
  if (current.value !== null) return current.value
  if (props.row.source === 'default') return 'medium'
  const tail = (props.row.masked ?? '').replace(/^•+/, '')
  return EFFORTS.find((e) => tail && e.endsWith(tail)) ?? ''
})
function pickEffort(v: string) {
  if (v === effortNow.value) return
  apply(v)
}

// --- number: NumberInput speaks numbers; the setting is stored as their string -------------
const numberValue = computed(() => {
  if (shown.value === '') return null
  const n = Number(shown.value)
  return Number.isFinite(n) ? n : null
})
function editNumber(v: number | null) {
  edit(v === null ? null : String(v))
}

// --- secret: Replace opens an empty password field; nothing is ever prefilled ---------------
const replacing = ref(false)
function cancelReplace() {
  replacing.value = false
  w.discard(props.row.key)
}
function discard() {
  if (editor.value === 'secret') cancelReplace()
  else w.discard(props.row.key)
}

// --- csv / cron -----------------------------------------------------------------------------
const csvItems = computed(() => parseCsv(shown.value))
const cronWords = computed(() => (shown.value ? cronToWords(shown.value) : ''))
/** The budgets editor starts from the saved split when the server sent it. */
const budgetStart = computed(() =>
  current.value !== null ? (parseBudgets(current.value) ?? props.budgetSeed) : props.budgetSeed,
)

// --- the value in use: a chip on the status line when it is short, else a code block --------
const INLINE_MAX = 80
// The editors start from the value in use, so it is shown separately only while
// there is an unsaved change: then it is what the change is compared against.
const inlineValue = computed<string | null>(() => {
  if (!dirty.value || props.row.is_secret || editor.value === 'model') return null
  const v = current.value
  if (v === null) return ''
  if (props.row.kind === 'json_object' || props.row.kind === 'json_list') return null
  return v.length <= INLINE_MAX && !v.includes('\n') ? v : null
})
const showBlock = computed(
  () =>
    editor.value !== 'managed' &&
    ((props.row.is_secret && !!revealed.value) ||
      (dirty.value &&
        !props.row.is_secret &&
        editor.value !== 'model' &&
        inlineValue.value === null)),
)

// --- edit as text: the exact value in a code editor, for every non-secret --------------------
const asText = ref(false)
const textValue = computed(() =>
  dirty.value ? draft.value! : current.value === null ? '' : pretty(current.value, props.row.kind),
)
function toggleText() {
  asText.value = !asText.value
}

// --- reveal a secret --------------------------------------------------------------------------
function reveal() {
  void w.reveal(props.row)
}
const effortOptions = EFFORTS.map((e) => ({ value: e, label: e }))

// The field is empty because the server never sends the value, so the placeholder
// says what is in effect instead of showing a sample that reads like a value: the
// mask when there is one ("Now ••••100"), else where the value comes from.
const placeholder = computed(() => {
  if (props.row.masked && props.row.is_secret) return `Now ${props.row.masked}`
  const from =
    props.row.source === 'default'
      ? 'Server default'
      : props.row.source === 'env'
        ? 'From .env'
        : 'Not set'
  if (editor.value === 'cron') return `${from} · minute hour day month weekday`
  if (editor.value === 'url') return `${from} · https://…`
  return from
})

// --- revert: two steps, since a saved value cannot be brought back from here --------------
const confirmRevert = ref(false)
async function revert() {
  if (!confirmRevert.value) {
    confirmRevert.value = true
    return
  }
  confirmRevert.value = false
  await w.revert(props.row)
}

// --- copy the key name -------------------------------------------------------------------
const copied = ref(false)
async function copyKey() {
  try {
    await navigator.clipboard?.writeText(props.row.key)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* no clipboard: the key is on screen to select */
  }
}

const shownMessage = computed(() =>
  w.message.key === props.row.key && w.message.text ? w.message : null,
)
</script>

<template>
  <li
    :id="`set-${row.key}`"
    class="sf"
    :class="{ 'is-dirty': dirty }"
    :data-key="row.key"
    tabindex="-1"
  >
    <p v-if="editor === 'managed'" class="sf__managed">
      <strong>{{ label }}</strong> — set by <strong>Connect</strong> in the Dhan connection above;
      it cannot be typed in.
    </p>

    <FormField
      v-else
      v-slot="f"
      :label="label"
      :hint="hint"
      :error="error ?? undefined"
      :disabled="!canWrite"
      size="sm"
    >
      <TextArea
        v-if="asText"
        :id="f.id"
        :model-value="textValue"
        :rows="isJson ? 6 : 2"
        class="sf__raw"
        :disabled="!canWrite"
        spellcheck="false"
        data-testid="raw-editor"
        @update:model-value="edit(String($event ?? ''))"
      />

      <Switch
        v-else-if="editor === 'switch'"
        :id="f.id"
        :model-value="boolValue"
        :label="boolValue ? 'On' : 'Off'"
        :disabled="!canWrite || busy"
        @update:model-value="toggle($event)"
      />

      <template v-else-if="editor === 'secret'">
        <div v-if="!replacing" class="sf__secret">
          <span class="sf__mask" data-testid="mask">{{ row.masked ?? 'Not set' }}</span>
          <Button
            :id="f.id"
            size="sm"
            variant="secondary"
            :disabled="!canWrite"
            data-testid="replace"
            @click="replacing = true"
            >{{ row.is_set ? 'Replace' : 'Set' }}</Button
          >
        </div>
        <TextInput
          v-else
          :id="f.id"
          :described-by="f.describedBy"
          :model-value="draft ?? ''"
          type="password"
          size="sm"
          placeholder="New value"
          autocomplete="new-password"
          :disabled="!canWrite"
          @update:model-value="edit(String($event ?? ''))"
          @keydown.enter.prevent="save"
        />
      </template>

      <Select
        v-else-if="editor === 'model'"
        :id="f.id"
        :described-by="f.describedBy"
        :model-value="modelInUse ?? ''"
        :options="modelChoices"
        size="sm"
        placeholder="Choose a model"
        :aria-label="label"
        :disabled="!canWrite || busy"
        data-testid="model-select"
        @update:model-value="pickModel"
      />

      <SegmentedControl
        v-else-if="editor === 'effort'"
        :id="f.id"
        :model-value="effortNow"
        :options="effortOptions"
        size="sm"
        :aria-label="label"
        :disabled="!canWrite || busy"
        @update:model-value="pickEffort"
      />

      <BudgetsEditor
        v-else-if="editor === 'budgets'"
        :id="f.id"
        ref="structured"
        :seed="budgetStart ?? null"
        :monthly="monthlyBudget ?? null"
        :disabled="!canWrite"
        @change="edit"
      />

      <PricesEditor
        v-else-if="editor === 'prices'"
        :id="f.id"
        ref="structured"
        :seed="current"
        :disabled="!canWrite"
        @change="edit"
      />

      <NumberInput
        v-else-if="editor === 'number'"
        :id="f.id"
        :described-by="f.describedBy"
        :model-value="numberValue"
        :min="0"
        :step="row.kind === 'int' ? 1 : 0.01"
        :suffix="unit || undefined"
        :placeholder="placeholder"
        :invalid="f.invalid"
        size="sm"
        :disabled="!canWrite"
        @update:model-value="editNumber"
        @keydown.enter.prevent="save"
      />

      <TagInput
        v-else-if="editor === 'csv'"
        :id="f.id"
        :described-by="f.describedBy"
        :model-value="csvItems"
        placeholder="Type a value, then Enter"
        size="sm"
        :disabled="!canWrite"
        @update:model-value="edit(serializeCsv($event))"
      />

      <TextArea
        v-else-if="editor === 'json'"
        :id="f.id"
        :model-value="textValue"
        class="sf__raw"
        :rows="4"
        :placeholder="row.kind === 'json_list' ? '[ … ]' : '{ … }'"
        :disabled="!canWrite"
        spellcheck="false"
        @update:model-value="edit(String($event ?? ''))"
      />

      <TextInput
        v-else
        :id="f.id"
        :described-by="f.describedBy"
        :model-value="shown"
        :type="editor === 'url' ? 'url' : 'text'"
        :placeholder="placeholder"
        :invalid="f.invalid"
        size="sm"
        :disabled="!canWrite"
        autocomplete="off"
        @update:model-value="edit(String($event ?? ''))"
        @keydown.enter.prevent="save"
      />
    </FormField>

    <p v-if="editor === 'model' && modelNote" class="sf__preview" data-testid="model-now">
      <Icon name="sparkles" size="xs" /> {{ modelNote }}
    </p>
    <p v-if="busy && !dirty" class="sf__preview" role="status">Saving…</p>
    <p v-if="editor === 'cron' && cronWords && !error" class="sf__preview" data-testid="cron-words">
      <Icon name="calendar-clock" size="xs" /> {{ cronWords }}
    </p>

    <div v-if="showBlock" class="sf__value" data-testid="value-in-use">
      <ValueBlock
        :value="row.is_secret ? (revealed?.live ?? null) : current"
        :masked="row.is_secret ? row.masked : null"
        :kind="row.kind"
        :label="row.is_secret && revealed ? `In use · hidden in ${revealSecondsLeft}s` : 'In use'"
        :empty="row.source === 'unset' ? 'Not set' : 'Empty'"
      />
    </div>

    <div v-if="editor !== 'managed'" class="sf__meta">
      <Badge v-bind="sourceChip(row)" />
      <Badge v-if="expiryChip(row)" v-bind="expiryChip(row)!" />
      <Badge v-if="dirty" tone="info" label="Unsaved" data-testid="unsaved-dot" />
      <span
        v-if="inlineValue !== null"
        class="sf__chip ui-mono"
        :class="{ 'is-empty': !inlineValue }"
        :title="inlineValue ? `In use: ${inlineValue}` : 'Nothing in use'"
        data-testid="value-in-use"
        >{{ inlineValue || (row.source === 'unset' ? 'Not set' : 'Empty') }}</span
      >
      <span v-if="row.updated_at" class="sf__when">changed {{ when(row.updated_at) }}</span>
      <span class="sf__actions">
        <Button
          v-if="row.is_secret && row.is_set && !revealed"
          size="sm"
          variant="ghost"
          :loading="w.busy.value === row.key && w.pending.value === null"
          data-testid="reveal"
          @click="reveal"
          ><Icon name="eye" size="xs" />Reveal</Button
        >
        <Button
          v-if="revealed"
          size="sm"
          variant="ghost"
          data-testid="hide"
          @click="w.hide(row.key)"
          ><Icon name="eye-off" size="xs" />Hide</Button
        >
        <Button
          v-if="!row.is_secret && TEXT_TOGGLE.includes(editor)"
          size="sm"
          variant="ghost"
          :aria-pressed="asText"
          data-testid="edit-as-text"
          @click="toggleText"
          ><Icon name="code" size="xs" />{{ asText ? 'Use the editor' : 'Edit as text' }}</Button
        >
        <Button
          v-if="dirty"
          size="sm"
          :loading="busy"
          :disabled="!canSave"
          data-testid="save"
          @click="save"
          >Save</Button
        >
        <Button v-if="dirty" size="sm" variant="ghost" @click="discard">Discard</Button>
        <Button
          v-if="!dirty && row.source === 'db'"
          size="sm"
          :variant="confirmRevert ? 'danger' : 'ghost'"
          :loading="busy"
          data-testid="revert"
          @click="revert"
          >{{ confirmRevert ? 'Confirm: revert to .env' : 'Revert to .env' }}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          :aria-label="copied ? 'Copied' : `Copy key name ${row.key}`"
          :title="`Copy ${row.key}`"
          @click="copyKey"
          ><Icon :name="copied ? 'check' : 'copy'" size="xs" /><span class="sr-only">{{
            row.key
          }}</span></Button
        >
      </span>
    </div>
    <p v-if="confirmRevert" class="sf__note" role="status">
      The saved value is removed and the .env value applies. Copy the value above first if you may
      need it again.
      <Button size="sm" variant="ghost" @click="confirmRevert = false">Keep it</Button>
    </p>
    <p
      v-if="shownMessage"
      class="sf__msg"
      :class="`is-${shownMessage.tone}`"
      :role="shownMessage.tone === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      {{ shownMessage.text }}
    </p>
  </li>
</template>

<style scoped>
.sf {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  padding: var(--sp-3) 0;
  border-top: 1px solid var(--glass-border);
  scroll-margin-top: 4rem;
}
.sf:first-child {
  border-top: none;
}
.sf:focus-visible,
.sf.is-flash {
  outline: none;
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
}
.sf__managed,
.sf__note,
.sf__preview,
.sf__when {
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sf__preview {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}
.sf__secret {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.sf__mask {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.sf__value {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.sf__raw :deep(textarea) {
  font-family: var(--font-mono);
}
/* The value in use, small and copyable by selection: home's mono for data. */
.sf__chip {
  max-width: min(100%, 26rem);
  min-width: 0;
  padding: 1px var(--sp-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-primary, var(--theme-text));
  user-select: all;
}
.sf__chip.is-empty {
  color: var(--text-secondary, var(--theme-dim));
  font-style: italic;
  user-select: none;
}
.sf__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.sf__actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  margin-left: auto;
  min-width: 0;
}
.sf__msg {
  margin: 0;
  font-size: var(--text-sm);
}
.sf__msg.is-ok {
  color: var(--theme-success, var(--text-secondary));
}
.sf__msg.is-error {
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

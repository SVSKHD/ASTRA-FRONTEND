<script setup lang="ts">
// One runtime setting, as a calm row: its name, what it does, where its value
// comes from, and the editor that fits it (src/control/settingEditors.ts):
//
//   switch   bool                         number   decimal / int / float, with its unit
//   secret   mask + Replace (never shown)  url      validated address
//   effort   low … max (AI_EFFORT)         csv      chips
//   budgets  four caps + live total        prices   model price table
//   cron     schedule + plain-English      json     validated JSON
//
// The server never sends a value, only a mask, so an editor starts empty and a
// change is anything typed (blank included, where blank means "off"). Save shows
// only then. Writes go through the shared writer, so a secret still asks for the
// admin's password and nothing typed outlives the send.
import { computed, ref, useId } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Switch from '@/components/ui/Switch.vue'
import TagInput from '@/components/ui/TagInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import BudgetsEditor from '@/components/control/settings/BudgetsEditor.vue'
import PricesEditor from '@/components/control/settings/PricesEditor.vue'
import { cronToWords } from '@/control/cron'
import {
  draftError,
  editorFor,
  EFFORTS,
  keyNote,
  parseCsv,
  serializeCsv,
  type BudgetDraft,
} from '@/control/settingEditors'
import { expiryChip, labelOf, sourceChip, unitOf, type SettingRow } from '@/control/settings'
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
const inputId = `sf-${useId()}`
const editor = computed(() => editorFor(props.row))
const label = computed(() => labelOf(props.row.key))
const note = computed(() => keyNote(props.row.key))
const unit = computed(() => unitOf(props.row.key, props.row.kind))
const canWrite = computed(() => props.encryptionReady)
const busy = computed(() => w.busy.value === props.row.key && !w.pending.value)

const draft = computed(() => w.drafts[props.row.key])
const dirty = computed(() => draft.value !== undefined)
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
  if (value === null) w.discard(props.row.key)
  else w.edit(props.row.key, value)
}
function save() {
  if (canSave.value) void w.save(props.row)
}

// --- switch: the mask ends with the value's last four characters ("••••true") ----------------
const boolNow = computed(() => {
  const m = props.row.masked ?? ''
  return m.endsWith('true') ? true : m.endsWith('alse') ? false : null
})
const boolValue = computed(() => (dirty.value ? draft.value === 'true' : (boolNow.value ?? false)))
function toggle(on: boolean) {
  // Back to what the server has: nothing to save.
  if (boolNow.value !== null && on === boolNow.value) w.discard(props.row.key)
  else edit(on ? 'true' : 'false')
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
const csvItems = computed(() => (dirty.value ? parseCsv(draft.value!) : []))
const cronWords = computed(() => (dirty.value ? cronToWords(draft.value!) : ''))
const effortOptions = EFFORTS.map((e) => ({ value: e, label: e }))

// The field is empty because the server never sends the value, so the placeholder
// says what is in effect instead of showing a sample that reads like a value: the
// mask when there is one ("Now ••••100"), else where the value comes from.
const placeholder = computed(() => {
  if (props.row.masked) return `Now ${props.row.masked}`
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
    <div class="sf__text">
      <div class="sf__head">
        <label :for="inputId" class="sf__label">{{ label }}</label>
        <span v-if="dirty" class="sf__dot" title="Unsaved change" data-testid="unsaved-dot"
          ><span class="sr-only">Unsaved change</span></span
        >
        <Badge v-bind="sourceChip(row)" />
        <Badge v-if="expiryChip(row)" v-bind="expiryChip(row)!" />
      </div>
      <p class="sf__desc">
        {{ row.description }}
        <span v-if="row.updated_at" class="sf__when"> · changed {{ when(row.updated_at) }}</span>
        <span v-if="row.expires_at" class="sf__when"> · expires {{ when(row.expires_at) }}</span>
      </p>
      <p v-if="note" class="sf__note" data-testid="key-note">{{ note }}</p>
    </div>

    <div class="sf__control">
      <p v-if="editor === 'managed'" class="sf__note">
        Set by <strong>Connect</strong> in the Dhan connection above; it cannot be typed in.
      </p>

      <Switch
        v-else-if="editor === 'switch'"
        :id="inputId"
        :model-value="boolValue"
        :label="boolValue ? 'On' : 'Off'"
        :disabled="!canWrite || busy"
        @update:model-value="toggle($event)"
      />

      <template v-else-if="editor === 'secret'">
        <div v-if="!replacing" class="sf__secret">
          <span class="sf__mask" data-testid="mask">{{ row.masked ?? 'Not set' }}</span>
          <Button
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
          :id="inputId"
          :model-value="draft ?? ''"
          type="password"
          placeholder="New value"
          autocomplete="new-password"
          :disabled="!canWrite"
          @update:model-value="edit(String($event ?? ''))"
          @keydown.enter.prevent="save"
        />
      </template>

      <SegmentedControl
        v-else-if="editor === 'effort'"
        :model-value="draft ?? ''"
        :options="effortOptions"
        size="sm"
        :aria-label="label"
        :disabled="!canWrite"
        @update:model-value="edit($event)"
      />

      <BudgetsEditor
        v-else-if="editor === 'budgets'"
        :id="inputId"
        ref="structured"
        :seed="budgetSeed ?? null"
        :monthly="monthlyBudget ?? null"
        :disabled="!canWrite"
        @change="edit"
      />

      <PricesEditor
        v-else-if="editor === 'prices'"
        :id="inputId"
        ref="structured"
        :disabled="!canWrite"
        @change="edit"
      />

      <TagInput
        v-else-if="editor === 'csv'"
        :id="inputId"
        :model-value="csvItems"
        placeholder="Type a value, then Enter"
        size="sm"
        :disabled="!canWrite"
        @update:model-value="edit(serializeCsv($event))"
      />

      <TextArea
        v-else-if="editor === 'json'"
        :id="inputId"
        :model-value="draft ?? ''"
        :rows="4"
        :placeholder="row.kind === 'json_list' ? '[ … ]' : '{ … }'"
        :disabled="!canWrite"
        spellcheck="false"
        @update:model-value="edit(String($event ?? ''))"
      />

      <TextInput
        v-else
        :id="inputId"
        :model-value="draft ?? ''"
        :type="editor === 'url' ? 'url' : 'text'"
        :inputmode="editor === 'number' ? (row.kind === 'int' ? 'numeric' : 'decimal') : undefined"
        :suffix="unit || undefined"
        :placeholder="placeholder"
        :invalid="!!error"
        :disabled="!canWrite"
        autocomplete="off"
        @update:model-value="edit(String($event ?? ''))"
        @keydown.enter.prevent="save"
      />
      <p v-if="editor === 'cron' && dirty && !error" class="sf__preview" data-testid="cron-words">
        <Icon name="calendar-clock" size="xs" /> {{ cronWords }}
      </p>
      <p v-if="error" class="sf__error" role="alert">{{ error }}</p>
    </div>

    <div v-if="editor !== 'managed'" class="sf__actions">
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
        class="sf__copy"
        :aria-label="copied ? 'Copied' : `Copy key name ${row.key}`"
        :title="row.key"
        @click="copyKey"
        ><Icon :name="copied ? 'check' : 'copy'" size="xs" /><code class="sf__key">{{
          row.key
        }}</code></Button
      >
    </div>
    <p v-if="confirmRevert" class="sf__note sf__wide" role="status">
      The saved value is removed and the .env value applies. It cannot be brought back from here:
      the server never sends a value back.
      <Button size="sm" variant="ghost" @click="confirmRevert = false">Keep it</Button>
    </p>
    <p
      v-if="shownMessage"
      class="sf__msg sf__wide"
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  grid-template-areas:
    'text control'
    'text actions';
  gap: var(--sp-2) var(--sp-4);
  min-width: 0;
  padding: var(--sp-4) 0;
  border-top: 1px solid var(--glass-border);
  scroll-margin-top: 4rem;
  transition: background-color 0.2s ease;
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
.sf__wide {
  grid-column: 1 / -1;
}
.sf__text {
  grid-area: text;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.sf__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.sf__label {
  min-width: 0;
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.sf__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-accent);
}
.sf__desc,
.sf__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sf__note {
  font-size: var(--text-xs);
}
.sf__when {
  white-space: nowrap;
}
.sf__control {
  grid-area: control;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
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
.sf__preview {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.sf__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-danger);
}
.sf__actions {
  grid-area: actions;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.sf__copy {
  max-width: 100%;
}
.sf__key {
  min-width: 0;
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
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
/* One column on a phone: the name and description, then the control, then actions. */
@media (max-width: 720px) {
  .sf {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'text'
      'control'
      'actions';
  }
}
@media (prefers-reduced-motion: reduce) {
  .sf {
    transition: none;
  }
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

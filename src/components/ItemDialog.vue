<script setup lang="ts">
// One dialog for creating — and, for the simpler types, editing — every kind of
// item. It renders whatever ITEM_FORMS says the type's fields are, which is why
// the tab views no longer carry an add-form of their own: that space now
// belongs to the content.
//
// Create mode edits the store's dialogDraft and commits on save (so a mistyped
// entry is never silently lost). Edit mode writes through on each keystroke, so
// its button only dismisses — the same split the task dialog already used.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useDraft } from '@/composables/useDraft'
import { dialogCard, pxify, typeStep } from '@/styles'
import { ITEM_FORMS, type FieldDef } from '@/utils/itemForms'
import TagPicker from '@/components/TagPicker.vue'
import ShareGlobeButton from '@/components/ShareGlobeButton.vue'
import LinkedItemsPanel from '@/components/LinkedItemsPanel.vue'
import DraftBanner from '@/components/DraftBanner.vue'
import NotesSection from '@/components/detail/NotesSection.vue'
import type { NoteDraft } from '@/utils/notesSection'
import type { ItemType, NoteOwnerType, Todo } from '@/types'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const app = useAppStore()
const { c, s } = useStyles()
const { itemDialog, dialogDraft, dialogClosing } = storeToRefs(app)

// Tasks and reminders keep their own richer edit dialogs; this one only creates
// them. Trips own both create and edit (places, maps, timeline live there), so
// this dialog stands aside for them entirely. Their state rides the same slot.
const OWN_EDIT_DIALOG = ['task', 'reminder']
const OWN_DIALOG = ['trip']
const active = computed(() => {
  const d = itemDialog.value
  if (!d) return null
  if (OWN_DIALOG.indexOf(d.type) !== -1) return null
  if (d.mode === 'edit' && OWN_EDIT_DIALOG.indexOf(d.type) !== -1) return null
  return d
})
const form = computed(() => (active.value ? ITEM_FORMS[active.value.type] : null))
const isCreate = computed(() => active.value?.mode === 'create')
const heading = computed(() =>
  !form.value ? '' : isCreate.value ? form.value.newTitle : form.value.editTitle,
)

// In create mode the values live in the draft; in edit mode they are read
// straight off the stored item, so the dialog always shows the truth.
const values = computed<Record<string, unknown>>(() => {
  const d = active.value
  if (!d) return {}
  if (d.mode === 'create') return dialogDraft.value
  return (d.id != null && app.itemById(d.type, d.id)) || {}
})
const fields = computed<FieldDef[]>(() =>
  (form.value?.fields ?? []).filter((f) => !f.when || f.when(values.value)),
)

// Draft resume (section 8) for create mode only. Edit mode writes through to the
// stored item on each keystroke, so there is never an unsaved draft to protect;
// create mode holds its work in the ephemeral dialogDraft, which is exactly what
// a killed tab or an accidental close would lose. useDraft autosaves that draft
// under `${type}:new`, restores a newer one on open, and clears it on a
// successful add. The target type follows whichever create dialog is open; an
// empty ('') type (edit mode / no dialog) makes the composable inert.
const createType = () => (isCreate.value && active.value ? active.value.type : '')
const blankFor = () => {
  const t = createType()
  return t ? app.blankDraft(t as ItemType) : {}
}
const draft = useDraft(createType, null, dialogDraft, {
  // Create forms have no saved entity, so any stored draft is newer.
  entityUpdatedAt: () => 0,
  // Discard reverts to the type's pristine blank form.
  baseline: blankFor,
  // An untouched form (still equal to its blank) is not worth a draft; typing
  // anything makes it differ and it starts autosaving.
  isEmpty: (p) => JSON.stringify(p) === JSON.stringify(blankFor()),
})

// The share globe belongs to a saved item, so it only appears when editing an
// existing todo — never in create mode, where there is nothing to share yet.
const shareTarget = computed<Todo | null>(() => {
  const d = active.value
  if (!d || d.type !== 'todo' || d.mode !== 'edit' || d.id == null) return null
  return (app.itemById('todo', d.id) as unknown as Todo) ?? null
})

function val(f: FieldDef): string {
  const v = values.value[f.key]
  return v == null ? '' : String(v)
}
function set(f: FieldDef, value: unknown) {
  const d = active.value
  if (!d) return
  if (d.mode === 'create') app.setDialogDraft(f.key, value)
  else if (d.id != null) app.updateItem(d.type, d.id, f.key, value)
}
function onInput(f: FieldDef, e: Event) {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  set(f, f.kind === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value)
}
function onCheck(f: FieldDef, e: Event) {
  set(f, (e.target as HTMLInputElement).checked)
}

const weekdayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
function selectedWeekdays(f: FieldDef): number[] {
  const v = values.value[f.key]
  return Array.isArray(v) ? (v as number[]) : []
}
function toggleWeekday(f: FieldDef, i: number) {
  const wd = selectedWeekdays(f).slice()
  const idx = wd.indexOf(i)
  if (idx === -1) wd.push(i)
  else wd.splice(idx, 1)
  set(f, wd)
}
function weekdayBtnStyle(f: FieldDef, i: number) {
  const on = selectedWeekdays(f).indexOf(i) !== -1
  return pxify({
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '1px solid ' + c.value.border,
    ...typeStep('2xs'),
    cursor: 'pointer',
    background: on ? c.value.accent : 'transparent',
    color: on ? c.value.onAccent : c.value.dim,
  })
}

// --- the notes section (section 22a) ---------------------------------------
// The same component the detail dialogs use, in create mode: it holds the ids
// the reader has queued up and the dialog writes them on ADD. In edit mode
// there is a saved item, so it writes through to the store like any other
// surface and this dialog only tells it which item it is looking at.
function attachedIds(f: FieldDef): number[] {
  const v = values.value[f.key]
  return Array.isArray(v) ? (v as number[]) : []
}
// Only these four carry a notes field; the rest never render the section.
const noteOwnerType = computed<NoteOwnerType | null>(() => {
  const t = active.value?.type
  return t === 'task' || t === 'todo' || t === 'idea' || t === 'stock' ? t : null
})
// The draft note rides in the dialog's draft object rather than in state of its
// own, so the section 8 resume covers it and Cancel drops it with everything
// else — nothing is written until commitCreate writes the item.
const noteDraft = computed<NoteDraft | null>(
  () => (values.value.noteDraft as NoteDraft | null) ?? null,
)

function save() {
  if (isCreate.value) {
    // Persist the draft first so a rejected commit (a missing required field)
    // leaves the work stored; on success the item exists, so the draft is
    // redundant and gets cleared.
    if (app.commitCreate()) draft.clear()
  } else app.closeItemDialog()
}
// Any manual dismissal of a create dialog flushes the draft synchronously while
// dialogDraft still holds its content — the close teardown blanks it a beat
// later, so without this an in-flight (un-debounced) draft would be lost.
function close() {
  if (isCreate.value) draft.flush()
  app.closeItemDialog()
}
// Enter confirms from any single-line field; a textarea keeps its newlines and
// a focused button keeps its own activation.
function onEnter(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'TEXTAREA' || tag === 'BUTTON') return
  e.preventDefault()
  save()
}

const cardStyle = computed(() => pxify(dialogCard(c.value, dialogClosing.value)))
// `field-label` carries no styling — the style below does. It is a structural
// marker so "the sections are in this order" (section 22e) can be asserted
// against the labels rather than against every span on the dialog.
const labelStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
// Section 22e: one scrolling column, a consistent 20px between sections, and
// `min-width: 0` on every child — without it a long tag or a wide picker sets
// the column's width and pushes its neighbours off the dialog.
const sectionsStyle = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-5)',
  minWidth: 0,
})
const fieldStyle = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  minWidth: 0,
})
const prefixWrap = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    overflow: 'hidden',
  }),
)
const prefixAdornment = computed(() =>
  pxify({
    padding: '9px 4px 9px 12px',
    color: c.value.dim,
    ...typeStep('base'),
    flexShrink: 0,
  }),
)
const prefixInput = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    padding: '9px 12px 9px 4px',
    border: 'none',
    background: 'transparent',
    color: c.value.text,
    ...typeStep('base'),
    outline: 'none',
  }),
)
const checkRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    ...typeStep('xs'),
    color: c.value.dim,
  }),
)
</script>

<template>
  <template v-if="active && form">
    <div :style="s.dialogOverlay" @click="close()"></div>
    <div :style="cardStyle" @keydown.enter="onEnter" @keydown.esc="close()">
      <div :style="s.dialogHeader">
        <span :style="s.dialogHeading">{{ heading }}</span>
        <ShareGlobeButton
          v-if="shareTarget"
          entity-type="todo"
          :item="shareTarget"
          variant="dialog"
        />
        <button :style="s.del" aria-label="Close" @click="close()">×</button>
      </div>

      <!-- Unsaved-work resume for create mode (section 8). -->
      <DraftBanner
        v-if="isCreate && draft.hasDraft.value"
        :restored-at="draft.restoredAt.value"
        :from-other-device="draft.fromOtherDevice.value"
        @use="draft.applyDraft()"
        @ignore="draft.ignore()"
        @discard="draft.discard()"
      />

      <div :style="sectionsStyle">
        <div v-for="f in fields" :key="f.key" :style="fieldStyle">
          <TagPicker
            v-if="f.kind === 'tag'"
            :model-value="val(f)"
            :label="f.label"
            @update:model-value="set(f, $event)"
          />
          <label v-else-if="f.kind === 'checkbox'" :style="checkRow">
            <input type="checkbox" :checked="values[f.key] === true" @change="onCheck(f, $event)" />
            <span>{{ f.label }}</span>
          </label>
          <NotesSection
            v-else-if="f.kind === 'notes' && noteOwnerType"
            :type="noteOwnerType"
            :id="isCreate ? null : (active!.id ?? null)"
            :mode="isCreate ? 'create' : 'detail'"
            :draft-ids="attachedIds(f)"
            :draft="noteDraft"
            @update:draft-ids="set(f, $event)"
            @update:draft="app.setDialogDraft('noteDraft', $event)"
          />
          <template v-else>
            <span class="field-label" :style="labelStyle">{{ f.label }}</span>
            <textarea
              v-if="f.kind === 'textarea'"
              :style="s.dialogNotes"
              :placeholder="f.placeholder"
              :value="val(f)"
              @input="onInput(f, $event)"
            ></textarea>
            <select
              v-else-if="f.kind === 'select'"
              :style="s.select"
              :value="val(f)"
              @change="onInput(f, $event)"
            >
              <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <div v-else-if="f.kind === 'weekdays'" :style="s.weekdayRow">
              <button
                v-for="(nm, i) in weekdayNames"
                :key="i"
                :style="weekdayBtnStyle(f, i)"
                @click="toggleWeekday(f, i)"
              >
                {{ nm }}
              </button>
            </div>
            <!-- Prefixed input (e.g. a ₹ money field): the adornment sits inside
               the same bordered box as the input for one seamless control. -->
            <div v-else-if="f.prefix" :style="prefixWrap">
              <span :style="prefixAdornment">{{ f.prefix }}</span>
              <input
                :style="prefixInput"
                :type="f.kind === 'number' ? 'number' : 'text'"
                :min="f.min"
                :placeholder="f.placeholder"
                :value="val(f)"
                @input="onInput(f, $event)"
              />
            </div>
            <!-- Dates go through the one picker; everything else stays a plain
               input, so there is no native date field left in the app. -->
            <GlassDatePicker
              v-else-if="f.kind === 'date' || f.kind === 'datetime'"
              :mode="f.kind === 'date' ? 'date' : 'datetime'"
              :model-value="String(val(f) ?? '')"
              :placeholder="f.placeholder || f.label"
              @update:model-value="set(f, String($event ?? ''))"
            />
            <input
              v-else
              :style="s.input"
              :type="f.kind === 'number' ? 'number' : 'text'"
              :min="f.min"
              :placeholder="f.placeholder"
              :value="val(f)"
              @input="onInput(f, $event)"
            />
          </template>
        </div>
      </div>

      <!-- Linked items — only for a saved todo (tasks use their own dialog). -->
      <LinkedItemsPanel
        v-if="active && active.type === 'todo' && active.mode === 'edit' && active.id != null"
        collection="todos"
        :doc-id="active.id"
      />

      <div :style="s.dialogActions">
        <button :style="s.cancelBtn" @click="close()">
          {{ isCreate ? 'Cancel' : 'Close' }}
        </button>
        <button :style="s.saveBtn" @click="save">{{ isCreate ? 'Add' : 'Done' }}</button>
      </div>
    </div>
  </template>
</template>

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
import { pxify, dialogCard } from '@/styles'
import { ITEM_FORMS, type FieldDef } from '@/utils/itemForms'
import { noteTitle } from '@/utils/notes'
import TagPicker from '@/components/TagPicker.vue'
import type { Note } from '@/types'

const app = useAppStore()
const { c, s } = useStyles()
const { itemDialog, dialogDraft, dialogClosing } = storeToRefs(app)

// Tasks and reminders keep their own richer edit dialogs; this one only creates
// them. Their edit state lives in the same slot, so stand aside for it.
const OWN_EDIT_DIALOG = ['task', 'reminder']
const active = computed(() => {
  const d = itemDialog.value
  if (!d) return null
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
    fontSize: 10,
    cursor: 'pointer',
    background: on ? c.value.accent : 'transparent',
    color: on ? c.value.onAccent : c.value.dim,
  })
}

// --- attached-notes field (ideas / stocks) ---------------------------------
// The value is a number[] of note ids; notes are referenced, never copied.
function attachedIds(f: FieldDef): number[] {
  const v = values.value[f.key]
  return Array.isArray(v) ? (v as number[]) : []
}
function attachedNotes(f: FieldDef): Note[] {
  const ids = attachedIds(f)
  return app.notes.filter((n) => ids.includes(n.id))
}
function unattachedNotes(f: FieldDef): Note[] {
  const ids = attachedIds(f)
  return app.notes.filter((n) => !ids.includes(n.id))
}
function noteLabel(n: Note): string {
  return noteTitle(n.text)
}
function attachNote(f: FieldDef, e: Event) {
  const el = e.target as HTMLSelectElement
  const nid = Number(el.value)
  el.value = ''
  if (!nid) return
  const ids = attachedIds(f)
  if (!ids.includes(nid)) set(f, [...ids, nid])
}
function detachNote(f: FieldDef, nid: number) {
  set(
    f,
    attachedIds(f).filter((x) => x !== nid),
  )
}

function save() {
  if (isCreate.value) app.commitCreate()
  else app.closeItemDialog()
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
const labelStyle = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const fieldStyle = pxify({ display: 'flex', flexDirection: 'column', gap: 6 })
const chipsRow = pxify({ display: 'flex', flexWrap: 'wrap', gap: 6 })
const noteChip = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.text,
    cursor: 'pointer',
  }),
)
const noteChipX = computed(() =>
  pxify({ cursor: 'pointer', color: c.value.dim, fontSize: 13, lineHeight: 1 }),
)
const checkRow = computed(() =>
  pxify({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: c.value.dim }),
)
</script>

<template>
  <template v-if="active && form">
    <div :style="s.dialogOverlay" @click="app.closeItemDialog()"></div>
    <div :style="cardStyle" @keydown.enter="onEnter" @keydown.esc="app.closeItemDialog()">
      <div :style="s.dialogHeader">
        <span :style="s.dialogHeading">{{ heading }}</span>
        <button :style="s.del" aria-label="Close" @click="app.closeItemDialog()">×</button>
      </div>

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
        <template v-else-if="f.kind === 'notes'">
          <span :style="labelStyle">{{ f.label }}</span>
          <div v-if="attachedNotes(f).length" :style="chipsRow">
            <span
              v-for="n in attachedNotes(f)"
              :key="n.id"
              :style="noteChip"
              :title="'Open note'"
              @click="app.openNoteView(n.id)"
            >
              {{ noteLabel(n) }}
              <span :style="noteChipX" title="Detach" @click.stop="detachNote(f, n.id)">×</span>
            </span>
          </div>
          <select :style="s.select" @change="attachNote(f, $event)">
            <option value="">
              {{ unattachedNotes(f).length ? 'Attach a note…' : 'No more notes to attach' }}
            </option>
            <option v-for="n in unattachedNotes(f)" :key="n.id" :value="n.id">
              {{ noteLabel(n) }}
            </option>
          </select>
        </template>
        <template v-else>
          <span :style="labelStyle">{{ f.label }}</span>
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
          <input
            v-else
            :style="s.input"
            :type="
              f.kind === 'date'
                ? 'date'
                : f.kind === 'datetime'
                  ? 'datetime-local'
                  : f.kind === 'number'
                    ? 'number'
                    : 'text'
            "
            :min="f.min"
            :placeholder="f.placeholder"
            :value="val(f)"
            @input="onInput(f, $event)"
          />
        </template>
      </div>

      <div :style="s.dialogActions">
        <button :style="s.cancelBtn" @click="app.closeItemDialog()">
          {{ isCreate ? 'Cancel' : 'Close' }}
        </button>
        <button :style="s.saveBtn" @click="save">{{ isCreate ? 'Add' : 'Done' }}</button>
      </div>
    </div>
  </template>
</template>

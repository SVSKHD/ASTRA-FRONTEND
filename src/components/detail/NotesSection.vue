<script setup lang="ts">
// The notes on a task, a todo or a goal (sections 22a–22c, 22f).
//
// One component for all three. It takes `{ type, id }` and works out the rest —
// which notes are attached, and what "+ New note" means here. Forking it per
// entity would be three copies of a surface whose whole point is that a note
// attached to a task and a note attached to a goal are the same thing.
//
// The two modes are not two designs, they are one design at two moments. In a
// DETAIL dialog the item exists, so a new note is a document written now and
// opened in the column beside it (section 21b). In a CREATE dialog there is
// nothing to attach to yet, so the note is held as a draft and written on ADD,
// in the same pass as the item (acceptance 113) — and the editor expands inline
// rather than widening a create dialog into two columns.
//
// Rows are one line each, on purpose. A note in this list is an index entry,
// not the note: three lines of preview would push REPO and the footer off the
// dialog and still not be enough to read.
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import {
  blankNoteDraft,
  noteRow,
  overflowLabel,
  visibleRows,
  type NoteDraft,
  type NoteRowModel,
} from '@/utils/notesSection'
import DetailSection from '@/components/detail/DetailSection.vue'
import NotePicker from '@/components/detail/NotePicker.vue'
import NoteDraftEditor from '@/components/detail/NoteDraftEditor.vue'
import Icon from '@/components/ui/Icon.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import type { Note, NoteOwnerType } from '@/types'

// The rendered note is only ever wanted once a row is actually opened, and it
// drags the markdown pipeline and its highlighter in with it (section 22d's
// lazy-mount rule). Every dialog that never touches a note pays nothing.
const MarkdownView = defineAsyncComponent(() => import('@/components/notes/MarkdownView.vue'))

const props = withDefaults(
  defineProps<{
    type: NoteOwnerType
    // Null in a create dialog: there is nothing to attach to yet.
    id: number | null
    // 'create' holds its attachments in the dialog draft and writes on ADD.
    mode?: 'detail' | 'create'
    // The ids a create dialog has queued up. Ignored in detail mode, where the
    // item itself is the record of what is attached.
    draftIds?: number[]
    // The one note being written in this creation flow, or null. Owned by the
    // dialog so that cancelling it writes nothing.
    draft?: NoteDraft | null
  }>(),
  { mode: 'detail', draftIds: () => [], draft: null },
)
const emit = defineEmits<{
  // Create mode writes nothing itself; the dialog owns both of these.
  'update:draftIds': [number[]]
  'update:draft': [NoteDraft | null]
}>()

const app = useAppStore()
const { notes, noteColumnId } = storeToRefs(app)

const isCreate = computed(() => props.mode === 'create')

// Read through `notes` rather than a snapshot, so a title typed in the column
// beside this one shows up in the row as it is typed.
const attached = computed<Note[]>(() => {
  void notes.value
  if (isCreate.value) {
    const byId = new Map(notes.value.map((n) => [n.id, n]))
    return props.draftIds.map((nid) => byId.get(nid)).filter((n): n is Note => !!n)
  }
  return props.id == null ? [] : app.notesFor(props.type, props.id)
})
const attachedIds = computed(() => attached.value.map((n) => n.id))

const rows = computed<NoteRowModel[]>(() => attached.value.map((note) => noteRow(note)))

const expanded = ref(false)
const shown = computed(() => visibleRows(rows.value, { expanded: expanded.value }))

// --- what the section is currently doing ------------------------------------
const picking = ref(false)
// Which row is open inline. Create mode only — in a detail dialog a row opens
// in the column beside it, which is the whole point of section 21b.
const openInline = ref<number | null>(null)

watch(
  () => `${props.type}:${props.id}`,
  () => {
    picking.value = false
    openInline.value = null
    expanded.value = false
  },
)

const inlineNote = computed(() =>
  openInline.value == null ? null : (notes.value.find((n) => n.id === openInline.value) ?? null),
)

function rowMenu() {
  return [
    { value: 'open', label: isCreate.value ? 'Preview' : 'Open' },
    { value: 'detach', label: 'Detach' },
    { value: 'delete', label: 'Delete' },
  ]
}

function open(row: NoteRowModel) {
  if (isCreate.value) {
    // A create dialog never widens into two columns (section 22c): the row
    // expands where it is, read-only, and opens properly after saving.
    openInline.value = openInline.value === row.id ? null : row.id
    return
  }
  app.openNoteColumn(row.id)
}

function detach(row: NoteRowModel) {
  if (isCreate.value) {
    emit(
      'update:draftIds',
      props.draftIds.filter((nid) => nid !== row.id),
    )
  } else if (props.id != null) {
    // The reference only — the note survives and stays findable in the notes
    // view (acceptance 116).
    app.detachNote(props.type, props.id, row.id)
  }
  if (openInline.value === row.id) openInline.value = null
}

function remove(row: NoteRowModel) {
  if (openInline.value === row.id) openInline.value = null
  if (isCreate.value)
    emit(
      'update:draftIds',
      props.draftIds.filter((nid) => nid !== row.id),
    )
  app.deleteWithUndo('notes', 'note', row.id)
}

function onMenu(row: NoteRowModel, action: string) {
  if (action === 'open') open(row)
  else if (action === 'detach') detach(row)
  else if (action === 'delete') remove(row)
}

// --- creating ----------------------------------------------------------------
// One draft per creation flow (section 22b): a second "+ New note" before the
// first is saved or discarded would be two unsaved notes and one ADD.
const draftOpen = computed(() => isCreate.value && props.draft != null)

function newNote() {
  if (isCreate.value) {
    // No navigation, no second modal: the editor expands below this section
    // and the dialog keeps its width.
    if (props.draft == null) emit('update:draft', blankNoteDraft())
    return
  }
  if (props.id == null) return
  // Created, attached and opened in the right column in one move, with focus in
  // the title (acceptance 114).
  app.newNoteInColumn(props.type, props.id)
}

async function startPicking() {
  picking.value = true
  await nextTick()
}
function onAttach(ids: number[]) {
  picking.value = false
  if (isCreate.value) {
    const next = props.draftIds.slice()
    for (const nid of ids) if (!next.includes(nid)) next.push(nid)
    emit('update:draftIds', next)
    return
  }
  if (props.id == null) return
  // Both sides in one pass (acceptance 115).
  app.attachNotes(props.type, props.id, ids)
}
</script>

<template>
  <DetailSection label="Notes" :hint="rows.length ? String(rows.length) : ''">
    <template #actions>
      <button type="button" class="nsec__ghost" :disabled="draftOpen" @click="newNote">
        + New note
      </button>
      <button type="button" class="nsec__ghost" :disabled="picking" @click="startPicking">
        Attach existing
      </button>
    </template>

    <!-- Empty is two buttons and a sentence, never an empty box to type in
         (acceptance 112). -->
    <p v-if="!rows.length && !picking && !draftOpen" class="nsec__empty">
      No notes yet. A note attached here stays in your notes list — attaching it does not move it.
    </p>

    <div
      v-for="row in shown.rows"
      :key="row.id"
      class="nsec__row"
      :class="{ 'nsec__row--open': row.id === noteColumnId || row.id === openInline }"
    >
      <button type="button" class="nsec__open" :title="row.title" @click="open(row)">
        <Icon :name="row.pinned ? 'star' : 'notebook'" size="xs" />
        <span class="nsec__label">{{ row.title }}</span>
        <span v-if="row.ago" class="nsec__ago">{{ row.ago }}</span>
      </button>
      <Dropdown label="⋯" :items="rowMenu()" @select="onMenu(row, $event)" />
    </div>

    <button v-if="shown.hidden" type="button" class="nsec__more" @click="expanded = true">
      {{ overflowLabel(shown.hidden) }}
    </button>

    <!-- A row opened inside a create dialog: read-only, in the flow, no second
         column (section 22c). -->
    <div v-if="inlineNote" class="nsec__read">
      <MarkdownView :source="inlineNote.text ?? ''" />
      <p v-if="isCreate" class="nsec__hint">
        Open after saving — this note opens beside the item once it exists.
      </p>
    </div>

    <NotePicker
      v-if="picking"
      :attached-ids="attachedIds"
      @attach="onAttach"
      @cancel="picking = false"
    />

    <!-- The note being written in this creation flow. It expands inline, below
         the list, and becomes a document on ADD (section 22b). -->
    <NoteDraftEditor
      v-if="draftOpen && draft"
      :model-value="draft"
      @update:model-value="emit('update:draft', $event)"
      @discard="emit('update:draft', null)"
    />
  </DetailSection>
</template>

<style scoped>
.nsec__ghost {
  padding: 2px var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  white-space: nowrap;
  cursor: pointer;
}
.nsec__ghost:hover:not(:disabled) {
  color: var(--theme-text);
  border-color: var(--theme-accent);
}
.nsec__ghost:disabled {
  opacity: 0.45;
  cursor: default;
}
.nsec__empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
/* Grid, not flex-with-margins: the label is the only track that flexes, and it
   is the only one allowed to shrink (section 21c). */
.nsec__row {
  color: var(--theme-text);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  border-bottom: 1px solid var(--glass-border);
}
.nsec__open {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2) var(--sp-1);
  border: none;
  background: transparent;
  color: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.nsec__row:hover {
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.nsec__row--open .nsec__open {
  color: var(--theme-accent);
}
/* One line, always: this is the index, and the note is one click away. */
.nsec__label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nsec__ago {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  white-space: nowrap;
}
.nsec__more {
  align-self: flex-start;
  padding: var(--sp-1) 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  cursor: pointer;
}
.nsec__more:hover {
  color: var(--theme-accent);
}
.nsec__read {
  min-width: 0;
  max-height: 45vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
.nsec__hint {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
</style>

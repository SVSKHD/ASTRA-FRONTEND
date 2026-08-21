<script setup lang="ts">
// The attached notes, listed in the left column of the detail dialog
// (section 21b).
//
// One line each, on purpose. A note in this list is an index entry, not the
// note — a preview of three lines would push the sections under it off the
// screen and still not be enough to read. Clicking one opens it in the column
// beside this one, which is where a note is actually read.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { noteRowLabel } from '@/utils/noteColumn'
import DetailSection from '@/components/detail/DetailSection.vue'
import type { NoteOwnerType } from '@/types'

const props = defineProps<{ type: NoteOwnerType; itemId: number }>()

const app = useAppStore()
const { notes, noteColumnId } = storeToRefs(app)

// Reads through `notes` rather than a snapshot, so a title typed in the column
// beside this one shows up in the row as it is typed.
const rows = computed(() => {
  void notes.value
  return app.notesFor(props.type, props.itemId).map((note) => ({
    id: note.id,
    label: noteRowLabel(note),
    pinned: note.pinned === true,
  }))
})

function open(noteId: number) {
  app.openNoteColumn(noteId)
}
function create() {
  app.newNoteInColumn(props.type, props.itemId)
}
</script>

<template>
  <DetailSection label="Notes" :hint="rows.length ? String(rows.length) : ''">
    <template #actions>
      <button type="button" class="nsec__add" @click="create">+ New note</button>
    </template>

    <p v-if="!rows.length" class="nsec__empty">
      No notes yet. A note here stays in your notes list — attaching it does not move it.
    </p>

    <div
      v-for="row in rows"
      :key="row.id"
      class="nsec__row"
      :class="row.id === noteColumnId && 'nsec__row--open'"
    >
      <button type="button" class="nsec__open" :title="row.label" @click="open(row.id)">
        <span class="nsec__pin" aria-hidden="true">{{ row.pinned ? '★' : '·' }}</span>
        <span class="nsec__label">{{ row.label }}</span>
      </button>
      <button
        type="button"
        class="nsec__detach"
        aria-label="Detach note"
        title="Detach (the note itself is kept)"
        @click="app.detachNote(type, itemId, row.id)"
      >
        ×
      </button>
    </div>
  </DetailSection>
</template>

<style scoped>
.nsec__add {
  padding: 2px var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  cursor: pointer;
}
.nsec__add:hover {
  color: var(--theme-text);
  border-color: var(--theme-accent);
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
  border-bottom: 1px solid var(--glass-border);
}
.nsec__open {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
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
.nsec__pin {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
/* One line, always: this is the index, and the note is one click away. */
.nsec__label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nsec__detach {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  line-height: 1;
  cursor: pointer;
  opacity: 0;
}
.nsec__row:hover .nsec__detach,
.nsec__detach:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .nsec__detach {
    opacity: 1;
  }
}
</style>

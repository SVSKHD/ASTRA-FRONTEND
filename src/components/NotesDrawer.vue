<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
// The notes index. Each note is a card — title, two lines of preview, its
// checklist progress — and opening one hands off to NoteView, which owns both
// reading and the rich-text editing. The drawer no longer turns into an editor
// itself: a note deserves the full screen, not a 340px column.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { noteChecks, notePreview, noteText, noteTitle } from '@/utils/notes'
import CommandHelp from '@/components/CommandHelp.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import type { Note } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const { c, s } = useStyles()
const { drawerOpen } = storeToRefs(ui)
const { notes } = storeToRefs(app)
const { now } = storeToRefs(ui)

const query = ref('')
// The Commands help overlay, opened from the header's ? button.
const helpOpen = ref(false)
const helpBtn = computed(() =>
  pxify({
    width: 27,
    height: 27,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: helpOpen.value ? c.value.input : 'transparent',
    color: helpOpen.value ? c.value.accent : c.value.dim,
    cursor: 'pointer',
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
  }),
)
// Newest first, and searchable by the plain text behind the markup — the list
// grows faster than any other, and scrolling it was the only way to find one.
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = [...notes.value].sort((a, b) => (b.updatedAt ?? b.ts) - (a.updatedAt ?? a.ts))
  if (!q) return list
  return list.filter((n) => noteText(n.text).toLowerCase().indexOf(q) !== -1)
})

const drawerStyle = computed(() =>
  pxify({
    position: 'fixed',
    top: 16,
    right: 16,
    bottom: 16,
    width: 'min(84vw,340px)',
    zIndex: 7,
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 'var(--radius-dialog)',
    boxShadow: c.value.shadow,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-4)',
    transform: 'translateX(' + (drawerOpen.value ? '0' : '150%') + ')',
    opacity: drawerOpen.value ? 1 : 0,
    pointerEvents: drawerOpen.value ? 'auto' : 'none',
    transition: 'transform .45s cubic-bezier(.5,1.3,.4,1), opacity .3s ease',
    overflow: 'hidden',
    color: c.value.text,
  }),
)
const listStyle = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
  paddingRight: 2,
})

// The card used to BE the button. It cannot stay one: a pencil and a bin inside
// a button is a button inside a button, which is invalid markup and which no
// browser agrees on how to click. So the card is a plain box carrying the
// chrome — padding, border, the hover lift — and this is the part that opens
// the note: no box of its own, and the column layout the card used to hold.
const openStyle = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  width: '100%',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
})

function timeLabel(n: Note) {
  const mins = Math.round((now.value - (n.updatedAt ?? n.ts)) / 60000)
  return mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago' : Math.round(mins / 60) + 'h ago'
}
function checkLabel(n: Note) {
  const { done, total } = noteChecks(n.text)
  return total ? done + '/' + total : ''
}
</script>

<template>
  <div v-if="drawerOpen" :style="s.overlay" @click="ui.toggleDrawer()"></div>
  <div :style="drawerStyle">
    <div :style="s.drawerHeader">
      <span :style="s.drawerTitle">Notes</span>
      <span style="display: flex; align-items: center; gap: 8px">
        <button
          :style="helpBtn"
          aria-label="Command help"
          title="Command help"
          @click="helpOpen = !helpOpen"
        >
          ?
        </button>
        <button :style="s.del" aria-label="Close notes" @click="ui.toggleDrawer()">×</button>
      </span>
    </div>

    <CommandHelp v-if="helpOpen" @close="helpOpen = false" />

    <button :style="s.addBtn2" v-hover-style="s.addBtnHover" @click="app.newNote()">
      + New Note
    </button>
    <TextInput v-if="notes.length > 3" type="search" placeholder="Search notes…" v-model="query" />

    <div v-if="shown.length === 0" :style="s.empty">
      {{ notes.length === 0 ? 'No notes yet.' : 'No note matches that.' }}
    </div>
    <div :style="listStyle">
      <div
        v-for="n in shown"
        :key="n.id"
        class="ncard"
        :style="s.noteCard"
        v-hover-style="s.noteCardHover"
      >
        <button :style="openStyle" @click="app.openNoteView(n.id, query)">
          <span :style="s.noteCardTitle">{{ noteTitle(n.text) }}</span>
          <span v-if="notePreview(n.text)" :style="s.noteCardPreview">{{
            notePreview(n.text)
          }}</span>
        </button>
        <span :style="s.noteCardFoot">
          <span :style="s.finMeta">{{ timeLabel(n) }}</span>
          <span v-if="checkLabel(n)" :style="s.finMeta">☑ {{ checkLabel(n) }}</span>
          <OfflineChip :pending="app.isItemPending('note', n.id)" />
          <!-- Read is the card itself, and Create is the button above the list,
               so what a card needs is the other two. -->
          <span class="ncard__actions" :style="s.noteCardActions">
            <IconButton label="Edit note" size="sm" @click="app.editNoteView(n.id)">
              <Icon name="pencil" size="xs" />
            </IconButton>
            <IconButton
              label="Delete note"
              size="sm"
              @click="app.deleteWithUndo('notes', 'note', n.id)"
            >
              <Icon name="trash" size="xs" />
            </IconButton>
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The actions arrive on approach, the way the trades table's delete and the
   goal card's grip do: a pencil and a bin sitting on every card is a column of
   permanent invitations to click the wrong one, and delete is the one action
   here that spends something.

   Opacity rather than `display`, so the foot row never reflows when they
   appear, and `focus-within` brings them back for a keyboard — which has no
   pointer to approach with. */
.ncard__actions {
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) var(--ease-out, ease);
}
.ncard:hover .ncard__actions,
.ncard:focus-within .ncard__actions {
  opacity: 1;
}
/* A touch device has no hover, so hiding them there would hide them for good. */
@media (hover: none) {
  .ncard__actions {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ncard__actions {
    transition: none;
  }
}
</style>

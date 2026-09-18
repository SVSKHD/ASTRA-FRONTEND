<script setup lang="ts">
// One attached note inside a right-hand detail pane (todos, tasks).
//
// Collapsed it is a single line — title and how fresh it is. Opened it reads
// the note rendered in place, under the item's description, so the note and
// the thing it is about sit in one column. Edit swaps the rendering for the
// same markdown editor the notes view uses, autosaving the way every inline
// field in the app does.
//
// Every action is a visible button in one tray rather than a ⋯ menu: a menu
// anchored inside a collapsible, scrolling pane is clipped by it, and five
// actions fit on the row anyway.
import { computed, defineAsyncComponent, nextTick, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useInlineField } from '@/composables/useInlineField'
import { noteRow } from '@/utils/notesSection'
import { noteToMarkdown } from '@/utils/notesCopy'
import { copyText } from '@/utils/clipboard'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import Icon from '@/components/ui/Icon.vue'
import Caret from '@/components/ui/Caret.vue'
import PaneButton from '@/components/detail/PaneButton.vue'
import PaneToolbar from '@/components/detail/PaneToolbar.vue'

// Both load only once a note is actually opened: they pull in the markdown
// pipeline and its highlighter.
const MarkdownView = defineAsyncComponent(() => import('@/components/notes/MarkdownView.vue'))
const NoteEditor = defineAsyncComponent(() => import('@/components/notes/NoteEditor.vue'))

const props = defineProps<{
  noteId: number
  open: boolean
  editing: boolean
  autofocus?: boolean
}>()
const emit = defineEmits<{
  toggle: []
  edit: [on: boolean]
  detach: []
}>()

const app = useAppStore()
const { notes } = storeToRefs(app)

const note = computed(() => notes.value.find((n) => n.id === props.noteId))
const row = computed(() => (note.value ? noteRow(note.value) : null))
const owners = computed(() => app.noteOwners(props.noteId).length)

const title = useInlineField({
  value: () => note.value?.title ?? '',
  commit: (next) => app.setNoteTitle(props.noteId, next),
})
const body = useInlineField({
  value: () => note.value?.text ?? '',
  commit: (next) => app.setNoteText(props.noteId, next),
})

const titleField = ref<InstanceType<typeof AutoTextarea> | null>(null)
onMounted(async () => {
  if (!props.autofocus) return
  await nextTick()
  titleField.value?.focus()
})

function flush() {
  title.flush()
  body.flush()
}
function toggleEdit() {
  if (props.editing) flush()
  emit('edit', !props.editing)
}
async function copy() {
  if (!note.value) return
  flush()
  const ok = await copyText(noteToMarkdown(note.value, 2))
  app.showToastMsg(ok ? 'Note copied' : 'Could not copy the note')
}
function openFull() {
  flush()
  app.openNotePage(props.noteId)
}
function remove() {
  flush()
  app.deleteWithUndo('notes', 'note', props.noteId)
}
</script>

<template>
  <div v-if="note && row" class="pnr" :class="{ 'is-open': open, 'is-editing': editing }">
    <div class="pnr__head">
      <button type="button" class="pnr__toggle" :aria-expanded="open" @click="emit('toggle')">
        <Caret :open="open" size="sm" />
        <span class="pnr__icon"><Icon :name="row.pinned ? 'star' : 'notebook'" size="sm" /></span>
        <span class="pnr__text">
          <span class="pnr__title" :title="row.title">{{ row.title }}</span>
          <span class="pnr__meta">
            <template v-if="editing">Editing · saves as you type</template>
            <template v-else>
              {{ row.ago || 'Note' }}
              <template v-if="owners > 1"> · also on {{ owners - 1 }} other</template>
            </template>
          </span>
        </span>
      </button>
      <PaneToolbar class="pnr__actions">
        <PaneButton icon="copy" label="Copy note" @click="copy" />
        <PaneButton
          :icon="editing ? 'check' : 'pencil'"
          :label="editing ? 'Done editing' : 'Edit note'"
          :active="editing"
          @click="toggleEdit"
        />
        <PaneButton icon="external-link" label="Open in notes" @click="openFull" />
        <PaneButton icon="paperclip" label="Detach from this item" @click="emit('detach')" />
        <PaneButton icon="trash" label="Delete note" tone="danger" @click="remove" />
      </PaneToolbar>
    </div>

    <div v-if="open" class="pnr__body">
      <template v-if="editing">
        <AutoTextarea
          ref="titleField"
          variant="title"
          label="Note title"
          placeholder="Untitled note"
          :model-value="title.draft.value"
          @update:model-value="title.set"
          @focus="title.onFocus"
          @blur="title.onBlur"
        />
        <NoteEditor
          narrow
          compact
          :model-value="body.draft.value"
          placeholder="Write in markdown"
          @update:model-value="body.set"
          @save="body.flush()"
        />
      </template>
      <template v-else>
        <MarkdownView v-if="note.text.trim()" :source="note.text" />
        <div v-else class="pnr__empty">
          <span>This note is empty.</span>
          <PaneButton icon="pencil" label="Write it" show-label tone="accent" @click="toggleEdit" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pnr {
  container-type: inline-size;
  min-width: 0;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-control);
  background: var(--theme-input, transparent);
  transition: border-color var(--dur-fast, 0.15s) ease;
}
.pnr:hover {
  border-color: color-mix(in oklch, var(--theme-text) 22%, var(--glass-border));
}
.pnr.is-open {
  border-color: color-mix(in oklch, var(--theme-accent) 45%, var(--glass-border));
}
.pnr__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: 6px 6px 6px 4px;
}
.pnr__toggle {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-text);
  text-align: left;
  cursor: pointer;
}
.pnr__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-control);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
}
.pnr__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pnr__title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.pnr.is-open .pnr__title {
  color: var(--theme-accent);
}
.pnr__meta {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.pnr__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  max-height: 60vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-3);
  border-top: 1px solid var(--glass-border);
}
.pnr__empty {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
/* On a narrow pane the tray drops under the title rather than squeezing it to
   an ellipsis of three letters. */
@container (max-width: 420px) {
  .pnr__head {
    grid-template-columns: minmax(0, 1fr);
  }
  .pnr__actions {
    justify-self: end;
  }
}
</style>

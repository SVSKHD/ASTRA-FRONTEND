<script setup lang="ts">
// The notes attached to the item in a right-hand detail pane (todos, tasks).
//
// The dialog has NotesSection, which opens a note in a second column beside it.
// A pane is already the second column, so here a note opens in place, under the
// description — read rendered, edited inline. The attachment itself is the same
// record either way (`noteIds` on the item, `attachedTo` on the note), so a note
// attached here shows up in the dialog and the notes view, and vice versa.
//
// Subtasks at any depth open in the same pane, so this is how a sub-subtask
// gets its notes too.
//
// Nothing here is a floating menu. The section body clips (it is what animates
// open and shut) and the pane scrolls, so a popover anchored inside either is
// cut off; every choice expands in the flow instead.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { ancestorsOf, buildIndex, descendantsOf } from '@/utils/taskTree'
import { copyText } from '@/utils/clipboard'
import { noteCount, notesToMarkdown, type NoteGroup } from '@/utils/notesCopy'
import Icon from '@/components/ui/Icon.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import PaneNoteRow from '@/components/detail/PaneNoteRow.vue'
import PaneButton from '@/components/detail/PaneButton.vue'
import NotePicker from '@/components/detail/NotePicker.vue'
import type { Note, NoteOwnerType } from '@/types'

const props = defineProps<{ type: NoteOwnerType; id: number }>()

const app = useAppStore()
const { notes, tasks, todos } = storeToRefs(app)

const attached = computed<Note[]>(() => {
  void notes.value
  return app.notesFor(props.type, props.id)
})
const attachedIds = computed(() => attached.value.map((n) => n.id))
const noun = computed(() => (props.type === 'todo' ? 'todo' : props.type))

// --- copying ------------------------------------------------------------------
// The item's own notes, and the notes on every subtask below it at any depth,
// each group labelled with where it sits under this item.
interface TreeItem {
  id: number
  parentId: number | null
  order: number
  title?: string
  text?: string
}
const tree = computed(() => {
  const list =
    props.type === 'task'
      ? (tasks.value as unknown as TreeItem[])
      : props.type === 'todo'
        ? (todos.value as unknown as TreeItem[])
        : null
  return list ? buildIndex(list) : null
})
const itemTitle = (it: TreeItem | undefined) => (it?.title ?? it?.text ?? '').trim()

const ownGroup = computed<NoteGroup>(() => ({
  title: itemTitle(tree.value?.byId.get(props.id)),
  path: [],
  notes: attached.value,
}))
const subtaskGroups = computed<NoteGroup[]>(() => {
  const index = tree.value
  if (!index) return []
  void notes.value
  return descendantsOf(index, props.id).map((sub) => {
    // ancestorsOf is nearest-first; cut it at this item and read it downwards.
    const up = ancestorsOf(index, sub.id)
    const below = up
      .slice(
        0,
        up.findIndex((a) => a.id === props.id),
      )
      .reverse()
    return {
      title: itemTitle(sub),
      path: below.map((a) => itemTitle(a) || 'Untitled'),
      notes: app.notesFor(props.type, sub.id),
    }
  })
})
const subtaskNoteCount = computed(() => noteCount(subtaskGroups.value))
const subtasksWithNotes = computed(() => subtaskGroups.value.filter((g) => g.notes.length).length)
const totalCount = computed(() => attached.value.length + subtaskNoteCount.value)

type CopyScope = 'own' | 'subtasks' | 'all'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const copyOptions = computed(() => [
  {
    scope: 'own' as CopyScope,
    icon: 'notebook' as const,
    title: `This ${noun.value}`,
    detail: plural(attached.value.length, 'note'),
    count: attached.value.length,
  },
  {
    scope: 'subtasks' as CopyScope,
    icon: 'list' as const,
    title: 'Subtasks only',
    detail: `${plural(subtaskNoteCount.value, 'note')} · ${plural(subtasksWithNotes.value, 'subtask')}`,
    count: subtaskNoteCount.value,
  },
  {
    scope: 'all' as CopyScope,
    icon: 'copy' as const,
    title: 'Everything',
    detail: `${plural(totalCount.value, 'note')}, grouped by subtask`,
    count: totalCount.value,
  },
])

const copyOpen = ref(false)
async function copy(scope: CopyScope) {
  const groups =
    scope === 'own'
      ? [ownGroup.value]
      : scope === 'subtasks'
        ? subtaskGroups.value
        : [ownGroup.value, ...subtaskGroups.value]
  const count = noteCount(groups)
  if (!count) return
  const ok = await copyText(notesToMarkdown(groups, scope !== 'own'))
  app.showToastMsg(ok ? `Copied ${plural(count, 'note')}` : 'Could not copy the notes')
  if (ok) copyOpen.value = false
}
// With no subtask notes there is only one thing Copy can mean, so it does it
// rather than asking.
function onCopyClick() {
  picking.value = false
  if (!subtaskNoteCount.value) void copy('own')
  else copyOpen.value = !copyOpen.value
}

// --- attaching and editing --------------------------------------------------------
const picking = ref(false)
// Several may be open at once — reading two notes side by side in one column is
// the point — but only one is being edited.
const openIds = ref(new Set<number>())
const editingId = ref<number | null>(null)
const focusId = ref<number | null>(null)

watch(
  () => `${props.type}:${props.id}`,
  () => {
    picking.value = false
    copyOpen.value = false
    openIds.value = new Set()
    editingId.value = null
    focusId.value = null
  },
)

function toggle(noteId: number) {
  const next = new Set(openIds.value)
  if (next.has(noteId)) {
    next.delete(noteId)
    if (editingId.value === noteId) editingId.value = null
  } else next.add(noteId)
  openIds.value = next
}
function setEditing(noteId: number, on: boolean) {
  if (on) {
    openIds.value = new Set(openIds.value).add(noteId)
    editingId.value = noteId
  } else if (editingId.value === noteId) editingId.value = null
}

// Created, attached, opened and focused in one move.
function newNote() {
  const noteId = app.createNoteFor(props.type, props.id)
  if (noteId == null) return
  copyOpen.value = false
  picking.value = false
  focusId.value = noteId
  setEditing(noteId, true)
}
function onAttachClick() {
  copyOpen.value = false
  picking.value = !picking.value
}
function onAttach(ids: number[]) {
  picking.value = false
  app.attachNotes(props.type, props.id, ids)
  const next = new Set(openIds.value)
  for (const nid of ids) next.add(nid)
  openIds.value = next
  app.showToastMsg(`Attached ${plural(ids.length, 'note')}`)
}
function detach(noteId: number) {
  // The reference only — the note stays in the notes list.
  app.detachNote(props.type, props.id, noteId)
  if (editingId.value === noteId) editingId.value = null
  app.showToastMsg('Note detached — it is still in your notes')
}
</script>

<template>
  <PaneSection
    title="Notes"
    :storage-key="`${type}:attached-notes`"
    :count="attached.length || undefined"
  >
    <template #actions>
      <PaneButton
        v-if="totalCount"
        icon="copy"
        label="Copy"
        show-label
        :active="copyOpen"
        @click="onCopyClick"
      />
      <PaneButton
        icon="paperclip"
        label="Attach"
        show-label
        :active="picking"
        @click="onAttachClick"
      />
      <PaneButton icon="plus" label="New note" show-label tone="accent" @click="newNote" />
    </template>

    <!-- Copy: three choices, in the flow, each saying what it will copy. -->
    <div v-if="copyOpen" class="pn__panel" role="group" aria-label="Copy notes">
      <div class="pn__panelhead">
        <span>Copy notes as markdown</span>
        <PaneButton icon="x" label="Close" @click="copyOpen = false" />
      </div>
      <div class="pn__choices">
        <button
          v-for="o in copyOptions"
          :key="o.scope"
          type="button"
          class="pn__choice ui-focus-ring"
          :disabled="!o.count"
          @click="copy(o.scope)"
        >
          <span class="pn__choiceicon"><Icon :name="o.icon" size="sm" /></span>
          <span class="pn__choicetext">
            <span class="pn__choicetitle">{{ o.title }}</span>
            <span class="pn__choicedetail">{{ o.detail }}</span>
          </span>
        </button>
      </div>
    </div>

    <NotePicker
      v-if="picking"
      :attached-ids="attachedIds"
      @attach="onAttach"
      @cancel="picking = false"
    />

    <div v-if="!attached.length && !picking" class="pn__empty">
      <span class="pn__emptyicon"><Icon name="notebook" size="md" /></span>
      <span class="pn__emptytext">
        <strong>No notes on this {{ noun }} yet</strong>
        <span>Write a new note, or attach one you already have.</span>
      </span>
    </div>

    <PaneNoteRow
      v-for="n in attached"
      :key="n.id"
      :note-id="n.id"
      :open="openIds.has(n.id)"
      :editing="editingId === n.id"
      :autofocus="focusId === n.id"
      @toggle="toggle(n.id)"
      @edit="setEditing(n.id, $event)"
      @detach="detach(n.id)"
    />
  </PaneSection>
</template>

<style scoped>
.pn__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  border: 1px solid color-mix(in oklch, var(--theme-accent) 40%, var(--glass-border));
  border-radius: var(--radius-control);
  background: color-mix(in oklch, var(--theme-accent) 5%, transparent);
}
.pn__panelhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.pn__choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-2);
}
.pn__choice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-control);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--dur-fast, 0.15s) ease,
    background-color var(--dur-fast, 0.15s) ease;
}
.pn__choice:hover:not(:disabled) {
  border-color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
}
.pn__choice:disabled {
  opacity: 0.4;
  cursor: default;
}
.pn__choiceicon,
.pn__emptyicon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-control);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
}
.pn__choicetext,
.pn__emptytext {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pn__choicetitle {
  min-width: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pn__choicedetail {
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pn__empty {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.pn__emptytext strong {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
</style>

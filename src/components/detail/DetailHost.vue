<script setup lang="ts">
// Mounts the detail dialog over whatever the workspace is showing (section 18).
//
// The host owns the three things that are the same whichever body is open: the
// inline title in the header, the wiring from the shell's events to the store's
// stack, and keeping the URL in step. The bodies are loaded on demand — the
// dialog is a lot of machinery for a workspace that may never open one, and the
// markdown editor it contains is the single heaviest thing in it.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useDetailRoute } from '@/composables/useDetailRoute'
import { useInlineField } from '@/composables/useInlineField'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import DetailDialog from '@/components/detail/DetailDialog.vue'
import DetailPeek from '@/components/detail/DetailPeek.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import { copyAsMarkdown } from '@/utils/noteExport'
import { noteColumnMode, noteRowLabel } from '@/utils/noteColumn'
import { useUiStore } from '@/stores/ui'
import type { DetailKind } from '@/utils/detailUrl'

// `delay: 0` so the stand-in is up on the first frame rather than after the
// usual 200ms grace: the whole point is that the dialog is never empty
// (section 18b).
const TaskDetailBody = defineAsyncComponent({
  loader: () => import('@/components/detail/TaskDetailBody.vue'),
  loadingComponent: DetailPeek,
  delay: 0,
})
const GoalDetailBody = defineAsyncComponent({
  loader: () => import('@/components/detail/GoalDetailBody.vue'),
  loadingComponent: DetailPeek,
  delay: 0,
})
// The note column carries the markdown editor with it, and most dialogs are
// opened without ever attaching a note, so it loads the first time one is.
const NoteColumn = defineAsyncComponent({
  loader: () => import('@/components/detail/NoteColumn.vue'),
  loadingComponent: DetailPeek,
  delay: 0,
})

const app = useAppStore()
const ui = useUiStore()
const router = useRouter()
const { isMobile } = useStyles()
const { vw } = storeToRefs(ui)
const {
  tasks,
  goals,
  notes,
  detailFrame,
  detailDirty,
  detailDirtyFields,
  noteColumnId,
  noteColumnFocusTitle,
  detailSplit,
} = storeToRefs(app)

useDetailRoute()

interface BodyHandle {
  flush?: () => void
  revert?: () => void
}
const body = ref<BodyHandle | null>(null)
const noteBody = ref<BodyHandle | null>(null)

// --- the note extension column (section 21b) --------------------------------
const noteOpen = computed(() => noteColumnId.value != null)
const asideMode = computed(() => noteColumnMode(vw.value, isMobile.value))
const openNote = computed(() => notes.value.find((n) => n.id === noteColumnId.value))
const asideTitle = computed(() => (openNote.value ? noteRowLabel(openNote.value) : 'Note'))
// The note's write goes out before the frame's, then the store's close ordering
// drains what the guard held (section 21b, which is 18e with a note in front).
function onCloseAside() {
  noteBody.value?.flush?.()
  app.closeNoteColumn()
}

// The note's own ⋯ (section 22c). Detach is only offered where there is
// something to detach from — a note can be open in the column of a frame it
// happens not to be attached to, after a step to the next task.
const noteAttachedHere = computed(() => {
  const current = detailFrame.value
  if (!current || noteColumnId.value == null) return false
  return app
    .noteOwners(noteColumnId.value)
    .some((ref) => ref.type === current.kind && ref.id === current.id)
})
const noteMenu = computed(() => [
  { value: 'full', label: 'Open full' },
  { value: 'copy', label: 'Copy as markdown' },
  { value: 'detach', label: 'Detach', disabled: !noteAttachedHere.value },
  { value: 'delete', label: 'Delete' },
])

async function onNoteMenu(action: string) {
  const noteId = noteColumnId.value
  if (noteId == null) return
  // Whatever the action, what is in flight goes out first — including the one
  // that closes this dialog underneath it.
  noteBody.value?.flush?.()
  if (action === 'full') {
    void router.push(`/notes/${noteId}`)
  } else if (action === 'copy') {
    const source = notes.value.find((n) => n.id === noteId)?.text ?? ''
    app.showToastMsg(
      (await copyAsMarkdown(source)) ? 'Copied as markdown' : 'Could not reach the clipboard',
    )
  } else if (action === 'detach') {
    const current = detailFrame.value
    if (!current) return
    // The reference only: the note stays in the notes view (acceptance 116).
    app.detachNote(current.kind, current.id, noteId)
    app.closeNoteColumn()
  } else if (action === 'delete') {
    app.closeNoteColumn()
    app.deleteWithUndo('notes', 'note', noteId)
  }
}

const frame = computed(() => detailFrame.value)
const open = computed(() => app.detailOpen)

const task = computed(() =>
  frame.value?.kind === 'task' ? tasks.value.find((t) => t.id === frame.value?.id) : undefined,
)
const goal = computed(() =>
  frame.value?.kind === 'goal' ? goals.value.find((g) => g.id === frame.value?.id) : undefined,
)
// The plain text of the title, for the dialog's accessible name. An id the
// workspace does not have yet reads as "Loading…" rather than as an empty
// dialog — the shell is up either way (section 18b).
const titleText = computed(() => {
  if (!frame.value) return ''
  if (frame.value.kind === 'task')
    return task.value ? task.value.title || 'Untitled task' : 'Loading…'
  return goal.value ? goal.value.title || 'Untitled goal' : 'Loading…'
})
const exists = computed(() => !!task.value || !!goal.value)

// The header's inline title. One field for both kinds, because "rename the thing
// this dialog is about" is the same interaction either way.
const title = useInlineField({
  value: () =>
    frame.value?.kind === 'goal' ? (goal.value?.title ?? '') : (task.value?.title ?? ''),
  commit: (next) => {
    const current = frame.value
    if (!current) return
    if (current.kind === 'goal') app.updateGoal(current.id, { title: next })
    else app.updateTask(current.id, 'title', next)
  },
  onDirty: (dirty) => app.setDetailDirty(dirty ? ['Title'] : []),
})
// Stepping to a sibling swaps what the field is about, so a pending write goes
// to the item it was typed into rather than the one that just arrived.
watch(
  () => frame.value && `${frame.value.kind}:${frame.value.id}`,
  (_next, previous) => {
    if (previous) title.flush()
  },
)

const backLabel = computed(() => {
  const parent = app.detailParent
  if (!parent) return 'Back'
  const name =
    parent.kind === 'task'
      ? tasks.value.find((t) => t.id === parent.id)?.title
      : goals.value.find((g) => g.id === parent.id)?.title
  return name ? `Back to ${name}` : 'Back'
})

// Every exit flushes what is in flight first: the header title, then whatever
// the body still holds. Only then does the store run its own close ordering.
function flushEverything() {
  // Note first: it is the inner write, and the frame's flush is what releases
  // the guard afterwards.
  noteBody.value?.flush?.()
  title.flush()
  body.value?.flush?.()
}
function onClose() {
  flushEverything()
  app.closeDetail()
}
// The other answer to the unsaved-edits question. Reverting rather than flushing
// is the difference between the two — a reader who said "discard" must not find
// the edit saved anyway.
function onDiscard() {
  noteBody.value?.revert?.()
  title.revert()
  body.value?.revert?.()
  app.setDetailDirty([])
  app.closeDetail()
}
function onBack() {
  flushEverything()
  app.popDetail()
}
function onStep(id: number | null) {
  if (id == null) return
  flushEverything()
  app.stepDetail(id)
}
// Enter in the title writes it and gets out of the way, rather than putting a
// newline into what is a one-line-ish name.
function onTitleCommit() {
  title.flush()
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}
function onOpen(target: { kind: DetailKind; id: number }) {
  flushEverything()
  app.pushDetail(target.kind, target.id)
}
</script>

<template>
  <DetailDialog
    :open="open"
    :title="titleText"
    :dirty="detailDirty"
    :dirty-fields="detailDirtyFields"
    :mobile="isMobile"
    :can-go-back="app.detailCanGoBack"
    :back-label="backLabel"
    :has-prev="app.detailSteps.prevId != null"
    :has-next="app.detailSteps.nextId != null"
    :aside="noteOpen"
    :aside-mode="asideMode"
    :aside-title="asideTitle"
    :split="detailSplit"
    @close="onClose"
    @discard="onDiscard"
    @back="onBack"
    @prev="onStep(app.detailSteps.prevId)"
    @next="onStep(app.detailSteps.nextId)"
    @close-aside="onCloseAside"
    @update:split="app.setDetailSplit"
  >
    <template #title>
      <!-- A textarea, not an input: a long title used to run out of the
           header rather than wrapping onto a second line (section 20b). -->
      <AutoTextarea
        v-if="exists"
        class="dhost__title"
        variant="title"
        :model-value="title.draft.value"
        :label="frame?.kind === 'goal' ? 'Goal title' : 'Task title'"
        @update:model-value="title.set"
        @commit="onTitleCommit"
        @revert="title.revert"
        @focus="title.onFocus"
        @blur="title.onBlur"
      />
      <span v-else>{{ titleText }}</span>
    </template>

    <TaskDetailBody
      v-if="frame?.kind === 'task' && task"
      ref="body"
      :key="frame.id"
      :task-id="frame.id"
      @open="onOpen"
      @close="onClose"
    />
    <GoalDetailBody
      v-else-if="frame?.kind === 'goal' && goal"
      ref="body"
      :key="frame.id"
      :goal-id="frame.id"
      @open="onOpen"
      @close="onClose"
    />
    <p v-else-if="frame" class="dhost__missing">
      This {{ frame.kind }} is not in your workspace. It may have been deleted, or still be loading.
    </p>

    <template v-if="noteOpen" #aside-header>
      <Dropdown label="⋯" :items="noteMenu" @select="onNoteMenu" />
    </template>

    <template v-if="noteOpen" #aside>
      <NoteColumn
        ref="noteBody"
        :key="noteColumnId!"
        :note-id="noteColumnId!"
        :autofocus="noteColumnFocusTitle"
      />
    </template>
  </DetailDialog>
</template>

<style scoped>
.dhost__title {
  width: 100%;
}
.dhost__missing {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
</style>

<script setup lang="ts">
// The tasks list, restructured like the todo list: a single "Carried over · N"
// accordion for overdue tasks, today's active items flat (no per-deadline
// grouping), and completed work in its own window. Drag-to-nest, linked
// accordions, the repo/CI chip and the "Remind me" bell all keep working.
// On desktop the selected task's details and subtasks show in the right-hand
// pane, which is a column of this tab by default and a floating drawer over it
// on request — one setting, three steps, cycled from the pane's own header
// (DetailPane).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { DANGER, SUCCESS, WARNING, doneText, merge, pxify, rowBase, typeStep } from '@/styles'
import { todayKey, isOverdueTask } from '@/utils/rollover'
import { splitList, ageChip, oldestFromLabel } from '@/utils/listSplit'
import { relLabel } from '@/utils/upcoming'
import ListToolbar from '@/components/ListToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import TreeList from '@/components/TreeList.vue'
import TaskDetail from '@/components/TaskDetail.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import Modal from '@/components/ui/Modal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import TaskTransferPasteDialog from '@/components/TaskTransferPasteDialog.vue'
import { useTapOpen } from '@/composables/useTapOpen'
import { usePaneInset } from '@/composables/usePaneInset'
import TitleTagPill from '@/components/TitleTagPill.vue'
import { nestedChildIds } from '@/utils/links'
import { copyToClipboard } from '@/utils/share'
import { downloadText } from '@/utils/noteExport'
import {
  buildTaskTransferUrl,
  exportTaskTransferJson,
  taskTransferFilename,
} from '@/utils/taskTransfer'
import { buildIndex, childrenOf, descendantsOf, progressOf } from '@/utils/taskTree'
import { emptyTagQueryMessage, matchesTagQuery } from '@/utils/tagFilter'
import TagFilterInput from '@/components/TagFilterInput.vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { useDragNest } from '@/composables/useDragNest'
import type { LinkRef, Task } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { startDrag, targetState } = useDragNest()
const { tasks, draggingId } = storeToRefs(app)
const { now } = storeToRefs(ui)

defineExpose({ focus: () => app.openCreate('task') })

const importFile = ref<HTMLInputElement | null>(null)
const pasteDialogOpen = ref(false)
const completedOpen = ref(false)
const deleteConfirmOpen = ref(false)
const bulkDeleting = ref(false)
const transferMenu = computed(() => [
  { value: 'export-json', label: 'Export JSON', disabled: tasks.value.length === 0 },
  { value: 'copy-url', label: 'Copy import URL', disabled: tasks.value.length === 0 },
  { value: 'paste-json', label: 'Paste JSON/link' },
  { value: 'import-file', label: 'Import file' },
  { value: 'sample-json', label: 'Example JSON' },
])

function exportTasksJson() {
  downloadText(
    exportTaskTransferJson('tasks', tasks.value, new Date().toISOString()),
    taskTransferFilename('tasks'),
    'application/json;charset=utf-8',
  )
  app.showToastMsg('Tasks exported')
}

async function copyTasksUrl() {
  try {
    await copyToClipboard(buildTaskTransferUrl('tasks', tasks.value))
    app.showToastMsg('Task import URL copied')
  } catch {
    app.showToastMsg('Could not copy import URL')
  }
}

function onTransfer(action: string) {
  if (action === 'export-json') exportTasksJson()
  else if (action === 'copy-url') void copyTasksUrl()
  else if (action === 'paste-json') pasteDialogOpen.value = true
  else if (action === 'import-file') importFile.value?.click()
  else if (action === 'sample-json') app.openTaskTransferHelp('tasks')
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const result = app.importTaskTransferJson(String(reader.result ?? ''), 'tasks')
    if (result.error) app.showToastMsg('Could not import tasks: ' + result.error)
    else app.showToastMsg(`Imported ${result.count} task${result.count === 1 ? '' : 's'} from JSON`)
  }
  reader.onerror = () => app.showToastMsg('Could not read that JSON file')
  reader.readAsText(file)
}

const todayStr = computed(() => todayKey(new Date(now.value)))
function dayOf(t: Task): string {
  return t.deadline || ''
}

const nestedIds = computed(() => nestedChildIds('tasks', tasks.value))
// Tasks nested under another present task via the flat parentId hierarchy render
// inside their parent's tree, so they drop out of the main (top-level) list.
const treeNestedIds = computed(() => {
  const present = new Set(tasks.value.map((t) => t.id))
  const nested = new Set<number>()
  for (const t of tasks.value) {
    if (t.parentId != null && present.has(t.parentId)) nested.add(t.id)
  }
  return nested
})
const topLevel = computed(() =>
  tasks.value.filter((t) => !nestedIds.value.has(t.id) && !treeNestedIds.value.has(t.id)),
)

// --- tag filter --------------------------------------------------------------
// Same rule as the todo list: a top-level task matches on its own tag or any
// subtask's, and the filter applies before the split so every section narrows.
const tagQuery = ref('')
function treeTags(t: Task): string[] {
  return [t.tag, ...descendantsOf(taskIndex.value, t.id).map((d) => d.tag)]
}
const tagGroups = computed(() => topLevel.value.map(treeTags))
const shownTopLevel = computed(() => {
  if (!tagQuery.value.trim()) return topLevel.value
  const inUse = tagGroups.value.flat()
  return topLevel.value.filter((t) => matchesTagQuery(treeTags(t), tagQuery.value, inUse))
})

const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(shownTopLevel.value, {
    isDone: (t) => t.status === 'done',
    isCarried: (t) => isOverdueTask(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    archivedAt: (t) => t.archivedAt ?? null,
    // No day filter: Completed keeps everything finished until it is cleared
    // or deleted (see the same note in TodoView).
    completedSort: completedSort.value,
  }),
)
const carried = computed(() =>
  [...split.value.carriedOver].sort((a, b) => dayOf(a).localeCompare(dayOf(b))),
)
const active = computed(() => split.value.active)
const activeRootIds = computed(() => active.value.map((t) => t.id))
const completed = computed(() => split.value.completed)
// A completed list is unbounded — it grows for as long as the workspace is
// used. Past 100 rows it renders in windows so opening the section stays
// instant however many years are behind it.
const completedWindow = useLongList(completed)
const carriedSubtitle = computed(() => oldestFromLabel(carried.value.map(dayOf)))

// --- master/detail selection ------------------------------------------------
// Desktop: a tap selects the task into the right-hand pane. Mobile has no room
// for a second column, so a tap keeps opening the task dialog.
const selectedId = ref<number | null>(null)
const selectedExists = computed(
  () => selectedId.value != null && tasks.value.some((t) => t.id === selectedId.value),
)
// Which shape the pane is in. `inline` is a second grid column and the list
// gives it half the tab; the drawer modes float over the tab instead, and the
// list narrows by however much the drawer covers so the toolbar's New button
// never ends up behind it. The width comes from the pane itself, so compact,
// large and a dragged edge all make the right amount of room.
const splitView = computed(() => !isMobile.value && app.paneMode === 'inline')
const paneOpen = computed(() => !isMobile.value && !splitView.value && selectedExists.value)
const paneWidth = ref(0)
const { host: paneHost, style: paneInset } = usePaneInset(paneOpen, paneWidth)
function openTaskDetail(id: number, siblings: number[] = activeRootIds.value) {
  if (isMobile.value) app.openTaskDialog(id, siblings)
  else selectedId.value = id
}
function isTripleClick(event?: MouseEvent) {
  return (event?.detail ?? 0) >= 3
}
function openTask(id: number, event?: MouseEvent, siblings: number[] = activeRootIds.value) {
  if (isTripleClick(event)) {
    event?.preventDefault()
    cancelTaskViewOpen()
    toggleMoveSelection(id)
    return
  }
  if (selectionVisible.value) {
    toggleMoveSelection(id)
    return
  }
  openTaskDetail(id, siblings)
}
function shouldSelectRow(event?: MouseEvent) {
  return selectionVisible.value || isTripleClick(event)
}
function onTaskRowClick(event: MouseEvent, id: number) {
  if (!shouldSelectRow(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (isTripleClick(event)) cancelTaskViewOpen()
  toggleMoveSelection(id)
}
function onTaskRowPointerDown(event: PointerEvent) {
  if (!selectionVisible.value) return
  event.stopPropagation()
}
function selectedRowStyle(id: number) {
  return !isMobile.value && selectedId.value === id
    ? {
        borderColor: c.value.accent,
        backgroundColor: 'color-mix(in srgb, ' + c.value.accent + ' 8%, ' + c.value.card + ')',
        boxShadow: 'inset 3px 0 0 ' + c.value.accent,
      }
    : {}
}
function moveSelectedRowStyle(id: number) {
  return selectionVisible.value && isMoveSelected(id)
    ? {
        borderColor: c.value.accent,
        backgroundColor: 'color-mix(in srgb, ' + c.value.accent + ' 8%, ' + c.value.card + ')',
        boxShadow: 'inset 3px 0 0 ' + c.value.accent,
      }
    : {}
}
// Subtask counter shown on every row, 0/0 when a task has none.
const taskIndex = computed(() => buildIndex(tasks.value))
function subCount(id: number) {
  return progressOf(taskIndex.value, id, (x) => x.status === 'done')
}
const selectionMode = ref(false)
const selectedMove = ref<Set<number>>(new Set())
function treeIds(id: number): number[] {
  return [id, ...childrenOf(taskIndex.value, id).flatMap((child) => treeIds(child.id))]
}
const moveSelectableIds = computed(() => {
  const ids = [...carried.value.map((task) => task.id), ...activeRootIds.value.flatMap(treeIds)]
  return [...new Set(ids)]
})
const moveSelectableSet = computed(() => new Set(moveSelectableIds.value))
const selectedMoveIds = computed(() =>
  [...selectedMove.value].filter((id) => moveSelectableSet.value.has(id)),
)
const selectedMoveCount = computed(() => selectedMoveIds.value.length)
const selectedActionIds = computed(() => {
  const ids = selectedMoveIds.value.flatMap(treeIds)
  return [...new Set(ids)].filter((id) => moveSelectableSet.value.has(id))
})
const selectionVisible = computed(() => selectionMode.value || selectedMoveCount.value > 0)
const allMoveSelected = computed(
  () =>
    moveSelectableIds.value.length > 0 &&
    moveSelectableIds.value.every((id) => selectedMove.value.has(id)),
)
function isMoveSelected(id: number) {
  return selectedMove.value.has(id)
}
function toggleMoveSelection(id: number) {
  selectionMode.value = true
  const next = new Set(selectedMove.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedMove.value = next
}
function clearMoveSelection() {
  selectedMove.value = new Set()
  selectionMode.value = false
}
function clearSelectedMoveSelection() {
  selectedMove.value = new Set()
  selectionMode.value = true
}
function selectAllMoveSelection() {
  selectionMode.value = true
  selectedMove.value = new Set(moveSelectableIds.value)
}
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) selectedMove.value = new Set()
}
function moveSelectedToTodos() {
  const created = app.convertTasksToTodos(selectedMoveIds.value)
  clearMoveSelection()
  selectedId.value = null
  if (created.length) ui.setTab('todo')
}
function completeSelectedTasks() {
  const ids = selectedActionIds.value.filter((id) => {
    const task = taskIndex.value.byId.get(id)
    return task && task.status !== 'done'
  })
  for (const id of ids) app.setTaskStatus(id, 'done')
  if (ids.length) app.showToastMsg(`Completed ${ids.length} task${ids.length === 1 ? '' : 's'}`)
  clearMoveSelection()
}
function openDeleteConfirm() {
  if (!selectedMoveCount.value || bulkDeleting.value) return
  deleteConfirmOpen.value = true
}
function closeDeleteConfirm() {
  if (!bulkDeleting.value) deleteConfirmOpen.value = false
}
async function confirmDeleteSelected() {
  if (!selectedMoveCount.value || bulkDeleting.value) return
  bulkDeleting.value = true
  try {
    const deleted = await app.deleteManyWithProgress('tasks', selectedMoveIds.value)
    if (deleted > 0) {
      clearMoveSelection()
      selectedId.value = null
    }
  } finally {
    bulkDeleting.value = false
    deleteConfirmOpen.value = false
  }
}
watch(moveSelectableIds, (ids) => {
  const allowed = new Set(ids)
  const next = [...selectedMove.value].filter((id) => allowed.has(id))
  if (next.length !== selectedMove.value.size) selectedMove.value = new Set(next)
})

// --- drag-to-nest -----------------------------------------------------------
function onGripDown(e: PointerEvent, t: Task) {
  e.preventDefault()
  e.stopPropagation()
  startDrag([{ id: t.id, collection: 'tasks' }], e, {
    title: t.title || '(untitled)',
    badge: 'Task',
  })
}
function nestHighlight(id: number) {
  const ts = targetState({ id, collection: 'tasks' } as LinkRef)
  if (!ts.active || ts.zone !== 'nest') return {}
  return ts.valid
    ? { outline: '2px solid ' + c.value.accent, outlineOffset: '1px', background: c.value.card }
    : { outline: '2px solid ' + DANGER, outlineOffset: '1px' }
}

// --- linked-items nesting ---------------------------------------------------
const acc = useAccordionState()
function accKey(t: Task) {
  return 'tasks:' + t.id
}
const parentKeys = computed(() =>
  topLevel.value.filter((t) => t.linked.length > 0).map((t) => accKey(t)),
)
const anyLinked = computed(() => parentKeys.value.length > 0)
const allExpanded = computed(
  () => parentKeys.value.length > 0 && parentKeys.value.every((k) => acc.isOpen(k)),
)
function toggleAll() {
  acc.setMany(parentKeys.value, !allExpanded.value)
}
// Carried-over and completed rows are rendered here rather than by TreeList, so
// they host their own linked children (TreeList does the same for today's rows).
function linksOpen(t: Task) {
  return t.linked.length > 0 && acc.isOpen(accKey(t))
}
const linkBody = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  padding: '6px 4px 2px 26px',
})

// --- opening a row ----------------------------------------------------------
// A single click selects the task (desktop) or opens the detail dialog
// (mobile), immediately (section 18b). The double click still opens the
// full-page task view.
const pressedRow = ref<number | null>(null)
const tap = useTapOpen((event) => {
  const id = pressedRow.value
  pressedRow.value = null
  if (id != null) openTask(id, event)
})
function onTaskMainClick(event: MouseEvent) {
  if (shouldSelectRow(event)) return
  tap.onClick(event)
}
function onRowPointerDown(event: PointerEvent, t: Task) {
  pressedRow.value = t.id
  tap.onPointerDown(event)
}
let taskViewOpenTimer: number | null = null
function cancelTaskViewOpen() {
  if (taskViewOpenTimer == null) return
  window.clearTimeout(taskViewOpenTimer)
  taskViewOpenTimer = null
}
function onRowDblClick(event: MouseEvent, t: Task) {
  event.preventDefault()
  cancelTaskViewOpen()
  taskViewOpenTimer = window.setTimeout(() => {
    taskViewOpenTimer = null
    if (!selectionVisible.value) app.openTaskView(t.id)
  }, 240)
}
onBeforeUnmount(cancelTaskViewOpen)

// --- styles -----------------------------------------------------------------
function rowStyle(t: Task, done = false) {
  const isDrag = draggingId.value === t.id
  return merge(rowBase(c.value), {
    opacity: done ? 0.55 : 1,
    cursor: 'pointer',
    position: 'relative',
    transform: isDrag ? 'scale(1.03)' : undefined,
    boxShadow: isDrag ? '0 18px 40px rgba(0,0,0,0.45)' : undefined,
    zIndex: isDrag ? 5 : 'auto',
  })
}
function textStyle(t: Task) {
  return pxify({
    ...typeStep('base'),
    color: c.value.text,
    lineHeight: 1.3,
    ...doneText(t.done),
  })
}
const gripDots = [0, 1, 2, 3, 4, 5]
const ageChipStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    padding: '2px 7px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const subCountStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    color: c.value.dim,
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    flexShrink: 0,
  }),
)
const rolloverChipStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    padding: '2px 7px',
    borderRadius: 'var(--radius-pill)',
    background: 'transparent',
    // The overdue chip. One token rather than a light/dark pair of literals:
    // the pair only ever knew about two grounds, and there are nineteen.
    border: '1px solid ' + WARNING,
    color: WARNING,
    flexShrink: 0,
  }),
)
const doneMetaStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const parentCardStyle = pxify({ display: 'flex', flexDirection: 'column' })
const linkExpandBtn = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const bulkBar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    flexWrap: 'wrap',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.accent,
    background: 'color-mix(in oklch, ' + c.value.accent + ' 12%, transparent)',
    ...typeStep('xs'),
  }),
)
const bulkDeleteBtn = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + DANGER,
    background: 'color-mix(in oklch, ' + DANGER + ' 10%, transparent)',
    color: DANGER,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const bulkCompleteBtn = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + SUCCESS,
    background: 'color-mix(in oklch, ' + SUCCESS + ' 12%, transparent)',
    color: SUCCESS,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const disabledBtn = pxify({ opacity: 0.55, cursor: 'not-allowed' })
const confirmCopy = computed(() =>
  pxify({
    ...typeStep('sm'),
    lineHeight: 1.5,
    color: c.value.dim,
    margin: 0,
  }),
)
// Two columns while the pane is inline; the list alone once it floats.
const splitLayout = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
// The filter input stays put above the list while the list scrolls under it.
const leftColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  flex: 1,
  minHeight: 0,
})
const tagInputRow = pxify({ padding: '4px 10px 0' })
const listColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  // A scroll container clips its overflow on every side, so the room for a
  // hovered row's shadow has to be inside it.
  padding: '4px 10px 18px',
})
const completedModalList = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  minWidth: 0,
})
const doneAgo = (t: Task) => (t.completedAt ? relLabel(t.completedAt - now.value) : '')

function onGripDrop(e: DragEvent, t: Task) {
  e.preventDefault()
  e.stopPropagation()
  app.dropOnTask(t.id)
}
function onRowDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  try {
    e.dataTransfer!.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <ListToolbar title="Tasks" new-label="New task" @new="app.openCreate('task')">
      <template #actions>
        <Dropdown :items="transferMenu" label="Export" variant="toolbar" @select="onTransfer" />
        <input
          ref="importFile"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onImportFile"
        />
        <button
          v-if="completed.length"
          type="button"
          :style="linkExpandBtn"
          @click="completedOpen = true"
        >
          Completed · {{ completed.length }}
        </button>
        <button v-if="anyLinked" type="button" :style="linkExpandBtn" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
      </template>
    </ListToolbar>
    <TaskTransferPasteDialog
      :open="pasteDialogOpen"
      collection="tasks"
      @close="pasteDialogOpen = false"
    />
    <Modal :open="completedOpen" title="Completed tasks" size="lg" @close="completedOpen = false">
      <div :style="completedModalList">
        <div v-if="completed.length === 0" :style="s.empty">No completed tasks yet.</div>
        <template v-for="t in completedWindow.visible.value" :key="t.id">
          <div :style="[rowStyle(t, true), selectedRowStyle(t.id)]">
            <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
            <div
              :style="s.taskMain"
              @click="
                openTaskDetail(
                  t.id,
                  completedWindow.visible.value.map((x) => x.id),
                )
              "
            >
              <span :style="textStyle(t)"
                ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.title }}</span
              >
              <div :style="s.chipRow">
                <span :style="subCountStyle" title="Subtasks done / total"
                  >☑ {{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                >
                <span :style="doneMetaStyle">done {{ doneAgo(t) }}</span>
              </div>
            </div>
            <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">
              ×
            </button>
          </div>
          <div v-if="linksOpen(t)" :style="linkBody">
            <LinkedAccordion
              v-for="ch in t.linked"
              :key="ch.collection + ':' + ch.id"
              :item-ref="ch"
              :parent-ref="{ id: t.id, collection: 'tasks' }"
              :depth="0"
              :is-root="false"
            />
          </div>
        </template>
        <button
          v-if="completedWindow.remaining.value > 0"
          :style="s.showMoreRow"
          @click="completedWindow.more()"
        >
          Show {{ Math.min(100, completedWindow.remaining.value) }} more ({{
            completedWindow.remaining.value
          }}
          hidden)
        </button>
      </div>
      <template #footer>
        <button
          type="button"
          :style="s.editBtn"
          @click="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
        >
          Sort: {{ completedSort === 'recent' ? 'Recent' : 'Original' }}
        </button>
        <button type="button" :style="s.importBtn" @click="app.archiveCompleted('tasks')">
          Clear completed
        </button>
      </template>
    </Modal>
    <Modal
      :open="deleteConfirmOpen"
      title="Delete selected tasks"
      size="sm"
      @close="closeDeleteConfirm"
    >
      <p :style="confirmCopy">
        Delete {{ selectedMoveCount }} selected task{{ selectedMoveCount === 1 ? '' : 's' }}? Nested
        subtasks under selected parents are included.
      </p>
      <template #footer>
        <button
          type="button"
          :style="s.editBtn"
          :disabled="bulkDeleting"
          @click="closeDeleteConfirm"
        >
          Cancel
        </button>
        <button
          type="button"
          :style="[bulkDeleteBtn, bulkDeleting ? disabledBtn : null]"
          :disabled="bulkDeleting"
          @click="confirmDeleteSelected"
        >
          {{ bulkDeleting ? 'Deleting...' : allMoveSelected ? 'Delete all' : 'Delete selected' }}
        </button>
      </template>
    </Modal>
    <div v-if="selectionVisible" :style="bulkBar">
      <span>
        {{ selectedMoveCount ? selectedMoveCount + ' selected' : 'Select tasks to move' }}
      </span>
      <button v-if="!allMoveSelected" :style="s.editBtn" @click="selectAllMoveSelection">
        Select all
      </button>
      <button v-else :style="s.editBtn" @click="clearSelectedMoveSelection">Clear all</button>
      <button v-if="selectedMoveCount" :style="bulkCompleteBtn" @click="completeSelectedTasks">
        Completed
      </button>
      <button v-if="selectedMoveCount" :style="s.importBtn" @click="moveSelectedToTodos">
        Move to Todos
      </button>
      <button v-if="selectedMoveCount" :style="bulkDeleteBtn" @click="openDeleteConfirm">
        {{ allMoveSelected ? 'Delete all' : 'Delete selected' }}
      </button>
      <button :style="s.editBtn" @click="toggleSelectionMode">Done</button>
    </div>
    <ProgressLine :done="split.stats.done" :total="split.stats.total">
      <button
        v-if="moveSelectableIds.length && !selectionVisible"
        type="button"
        :style="linkExpandBtn"
        @click="toggleSelectionMode"
      >
        Select
      </button>
    </ProgressLine>
    <!-- data-own-keys: ↑/↓ scroll this list rather than switch tabs (globalKeys). -->
    <div :style="splitView ? splitLayout : leftColumn" data-own-keys>
      <div :style="leftColumn">
        <div :style="tagInputRow">
          <TagFilterInput v-model="tagQuery" :groups="tagGroups" />
        </div>
        <div :style="listColumn">
          <div v-if="tasks.length === 0" :style="s.empty">Nothing yet — add your first task.</div>
          <div v-else-if="tagQuery.trim() && !carried.length && !active.length" :style="s.empty">
            {{ emptyTagQueryMessage(tagQuery, 'tasks') }}
          </div>

          <!-- 1. Carried over accordion -->
          <CarriedOverGroup
            v-if="carried.length > 0"
            collection="tasks"
            :count="carried.length"
            :subtitle="carriedSubtitle"
          >
            <div v-for="t in carried" :key="t.id" :style="parentCardStyle">
              <div
                :style="[
                  rowStyle(t),
                  selectedRowStyle(t.id),
                  moveSelectedRowStyle(t.id),
                  nestHighlight(t.id),
                ]"
                v-hover-style="s.rowHover"
                :data-nest-id="t.id"
                data-nest-collection="tasks"
                :aria-selected="selectionVisible ? isMoveSelected(t.id) : undefined"
                @dragover="onRowDragOver"
                @drop="onGripDrop($event, t)"
                @pointerdown.capture="onTaskRowPointerDown"
                @click.capture="onTaskRowClick($event, t.id)"
              >
                <span :style="ageChipStyle">{{ ageChip(dayOf(t), todayStr) }}</span>
                <span
                  :style="s.grip"
                  role="button"
                  aria-label="Drag to nest"
                  title="Drag to nest"
                  @pointerdown="onGripDown($event, t)"
                  @click.stop
                  ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
                ></span>
                <div
                  :style="s.taskMain"
                  @pointerdown="onRowPointerDown($event, t)"
                  @pointercancel="tap.onPointerCancel"
                  @click="onTaskMainClick"
                  @dblclick="onRowDblClick($event, t)"
                >
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.title }}</span
                  >
                  <div :style="s.chipRow">
                    <span :style="subCountStyle" title="Subtasks done / total"
                      >☑ {{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                    >
                    <span v-if="t.rolloverCount > 1" :style="rolloverChipStyle"
                      >rolled over ×{{ t.rolloverCount }}</span
                    >
                  </div>
                </div>
                <RemindBell collection="tasks" :id="t.id" />
                <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
                <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">
                  ×
                </button>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
                <LinkedAccordion
                  v-for="ch in t.linked"
                  :key="ch.collection + ':' + ch.id"
                  :item-ref="ch"
                  :parent-ref="{ id: t.id, collection: 'tasks' }"
                  :depth="0"
                  :is-root="false"
                />
              </div>
            </div>
          </CarriedOverGroup>

          <!-- 2. Active items as a flat, drag-reorderable tree (grip handle, reorder /
             nest / promote indicators, root strip). -->
          <TreeList
            collection="tasks"
            :root-ids="activeRootIds"
            :selectable="!isMobile"
            :selected-id="selectedId"
            :selected-ids="selectedMoveIds"
            :selection-mode="selectionVisible"
            @select="selectedId = $event"
            @toggle-select="toggleMoveSelection"
          />
        </div>
      </div>

      <!-- The selected task's details and subtasks (desktop). Inline it is the
           second column of this grid; in either drawer mode it floats over the
           tab instead and this contributes nothing to the layout. -->
      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        title="Task details"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <TaskDetail :task-id="selectedExists ? selectedId : null" @select="selectedId = $event" />
      </DetailPane>
    </div>
  </div>
</template>

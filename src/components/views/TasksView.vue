<script setup lang="ts">
import { useTreeDrag } from '@/composables/useTreeDrag'
// The tasks list, restructured like the todo list: a single "Carried over · N"
// accordion for overdue tasks, today's active items flat (no per-deadline
// grouping), and completed work in the same collapsible shelf as Todos. Drag-to-nest, linked
// accordions, the repo/CI chip and the "Remind me" bell all keep working.
// On desktop the selected task's details and subtasks show in the right-hand
// pane, which is a column of this tab by default and a floating drawer over it
// on request — one setting, three steps, cycled from the pane's own header
// (DetailPane).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { DANGER, SUCCESS, WARNING, merge, pxify, rowBase, typeStep, itemTitle } from '@/styles'
import { todayKey, isOverdueTask } from '@/utils/rollover'
import { splitList, ageChip, oldestFromLabel } from '@/utils/listSplit'
import { relLabel } from '@/utils/upcoming'
import PanelHeader from '@/components/PanelHeader.vue'
import QuickAdd from '@/components/todo/QuickAdd.vue'
import RingCheck from '@/components/ui/RingCheck.vue'
import IconButton from '@/components/ui/IconButton.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import NextUpPanel from '@/components/todo/NextUpPanel.vue'
import { richIsEmpty, richPlain } from '@/utils/richText'
import { useTodoCompletion } from '@/composables/useTodoCompletion'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import TreeList from '@/components/TreeList.vue'
import ItemPinButton from '@/components/ItemPinButton.vue'
import DeleteUnpinned from '@/components/DeleteUnpinned.vue'
import Accordion from '@/components/ui/Accordion.vue'
import { pinnedTreeIds } from '@/utils/pinnedItems'
import TaskDetail from '@/components/TaskDetail.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import MoveSelectionDialog from '@/components/MoveSelectionDialog.vue'
import Modal from '@/components/ui/Modal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import TaskTransferPasteDialog from '@/components/TaskTransferPasteDialog.vue'
import { useTagSelection } from '@/composables/useTagSelection'
import { vScrollFade } from '@/directives/scrollFade'
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
import {
  buildIndex,
  selectedTreeRoots,
  childrenOf,
  descendantsOf,
  progressOf,
} from '@/utils/taskTree'
import { emptyTagQueryMessage, matchesTagQuery } from '@/utils/tagFilter'
import Icon from '@/components/ui/Icon.vue'
import TagFilterInput from '@/components/TagFilterInput.vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { useDragNest } from '@/composables/useDragNest'
import type { LinkRef, Task } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { targetState: treeTargetState } = useTreeDrag()
const { startDrag, targetState, suppressClick: suppressNestClick } = useDragNest()
const { tasks, draggingId, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

// "/n" and "+ New task" land in quick add with its details open, as on Todos;
// the full dialog is still a click away in the details pane's editor.
const quickAdd = ref<InstanceType<typeof QuickAdd> | null>(null)
function focusQuickAdd() {
  if (quickAdd.value) quickAdd.value.focus(true)
  else app.openCreate('task')
}
defineExpose({ focus: focusQuickAdd })
const showTagFilter = ref(false)
function toggleTagFilter() {
  showTagFilter.value = !showTagFilter.value
  if (!showTagFilter.value) tagQuery.value = ''
}

const importFile = ref<HTMLInputElement | null>(null)
const pasteDialogOpen = ref(false)
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
const taskIndex = computed(() => buildIndex(tasks.value))
const addedMode = ref('default')
const addedOptions = [
  { value: 'default', label: 'Default order' },
  { value: 'recent', label: 'Recently added ? 7 days' },
  { value: 'latest', label: 'Latest added first' },
]
const addedLabel = computed(() =>
  addedMode.value === 'default'
    ? 'Added'
    : addedOptions.find((o) => o.value === addedMode.value)!.label,
)
function addedAt(item: Task): number {
  return Math.max(
    item.createdAt || 0,
    ...descendantsOf(taskIndex.value, item.id)
      .filter((child) => child.archivedAt == null)
      .map((child) => child.createdAt || 0),
  )
}
function addedOrder(items: Task[]): Task[] {
  return addedMode.value === 'default' ? items : [...items].sort((a, b) => addedAt(b) - addedAt(a))
}
const tagQuery = ref('')
function treeTags(t: Task): string[] {
  return [t.tag, ...descendantsOf(taskIndex.value, t.id).map((d) => d.tag)]
}
const tagGroups = computed(() => topLevel.value.map(treeTags))
const shownTopLevel = computed(() => {
  const inUse = tagGroups.value.flat()
  return topLevel.value.filter(
    (t) =>
      (!tagQuery.value.trim() || matchesTagQuery(treeTags(t), tagQuery.value, inUse)) &&
      (addedMode.value !== 'recent' ||
        (addedAt(t) > 0 && addedAt(t) >= now.value - 7 * 24 * 60 * 60 * 1000)),
  )
})

const protectedIds = computed(() => pinnedTreeIds(tasks.value, 'tasks'))
const pinnedRoots = computed(() =>
  addedOrder(
    shownTopLevel.value.filter(
      (item) => item.archivedAt == null && protectedIds.value.has(item.id),
    ),
  ),
)

const completedSort = ref<'recent' | 'original'>('recent')
const completion = useTodoCompletion('tasks')
const split = computed(() =>
  splitList(
    shownTopLevel.value.filter((item) => !protectedIds.value.has(item.id)),
    {
      isDone: (t) => t.status === 'done' && !completion.isHeld(t.id),
      isCarried: (t) =>
        isOverdueTask(completion.isHeld(t.id) ? { ...t, status: 'pending' } : t, todayStr.value),
      completedAt: (t) => t.completedAt,
      archivedAt: (t) => t.archivedAt ?? null,
      // No day filter: Completed keeps everything finished until it is cleared
      // or deleted (see the same note in TodoView).
      completedSort: completedSort.value,
    },
  ),
)
const carried = computed(() =>
  addedOrder([...split.value.carriedOver].sort((a, b) => dayOf(a).localeCompare(dayOf(b)))),
)
// In each item's `order`, which is what a drag rewrites and what quick add
// sets to put a new item first. Storage order was being shown instead, so a
// dropped row saved its new place and then did not move.
const active = computed(() =>
  addedOrder(
    split.value.active
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (a.t.order ?? 0) - (b.t.order ?? 0) || a.i - b.i)
      .map(({ t }) => t),
  ),
)
const activeRootIds = computed(() => active.value.map((t) => t.id))
const completed = computed(() => addedOrder(split.value.completed))
const nextUpRoots = computed(() => [
  ...pinnedRoots.value.filter((item) => item.status !== 'done'),
  ...carried.value,
  ...active.value,
])
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
  if (suppressNestClick()) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if ((event.target as HTMLElement | null)?.closest('[aria-label="Drag to nest"]')) return
  if (!shouldSelectRow(event)) return
  event.preventDefault()
  event.stopPropagation()
  toggleMoveSelection(id)
}
function onTaskRowPointerDown(event: PointerEvent) {
  if (!selectionVisible.value) return
  if ((event.target as HTMLElement | null)?.closest('[aria-label="Drag to nest"]')) return
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
function subCount(id: number) {
  return progressOf(taskIndex.value, id, (x) => x.status === 'done')
}
const moveParentOpen = ref(false)
const selectionMode = ref(false)
const selectedMove = ref<Set<number>>(new Set())
function treeIds(id: number): number[] {
  return [id, ...childrenOf(taskIndex.value, id).flatMap((child) => treeIds(child.id))]
}
const moveSelectableIds = computed(() => {
  const ids = [
    ...pinnedRoots.value.map((item) => item.id).flatMap(treeIds),
    ...carried.value.map((task) => task.id),
    ...activeRootIds.value.flatMap(treeIds),
  ]
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
// "By tag" in the selection bar: select every row wearing a tag, or unselect
// them when they are all selected already.
const { tagMenu, pickTag } = useTagSelection({
  selectable: moveSelectableIds,
  tagOf: (id) => taskIndex.value.byId.get(id)?.tag ?? '',
  selected: selectedMove,
  selectionMode,
})
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
// The selection as a JSON file: each picked task with every subtask under it —
// the whole tree, not only the rows on screen — in the same format as the
// toolbar's Export, so it imports back with Paste JSON or Import file.
function exportSelected() {
  const ids = new Set<number>()
  for (const id of selectedMoveIds.value) {
    ids.add(id)
    for (const d of descendantsOf(taskIndex.value, id)) ids.add(d.id)
  }
  const picked = tasks.value.filter((t) => ids.has(t.id))
  if (!picked.length) return
  const at = new Date().toISOString()
  downloadText(
    exportTaskTransferJson('tasks', picked, at),
    taskTransferFilename('tasks', at).replace('tasks-', 'tasks-selected-'),
    'application/json;charset=utf-8',
  )
  app.showToastMsg(`Exported ${picked.length} task${picked.length === 1 ? '' : 's'}`)
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
  startDrag(
    (selectedMoveIds.value.includes(t.id)
      ? selectedTreeRoots(buildIndex(app.tasks), selectedMoveIds.value)
      : [t.id]
    ).map((id) => ({
      id,
      collection: 'tasks',
    })),
    e,
    {
      title: t.title || '(untitled)',
      badge: 'Task',
    },
  )
}
function nestHighlight(id: number) {
  const tree = treeTargetState('tasks', id)
  const ts = targetState({ id, collection: 'tasks' } as LinkRef)
  if ((!tree.active || tree.mode !== 'nest') && (!ts.active || ts.zone !== 'nest')) return {}
  return (tree.active ? tree.valid : ts.valid)
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

function onKey(event: KeyboardEvent) {
  if (
    event.key === 'Escape' &&
    !(event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')
  )
    selectedId.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// --- styles -----------------------------------------------------------------
function rowStyle(t: Task, done = false) {
  const isDrag = draggingId.value === t.id
  return merge(rowBase(c.value), {
    opacity: done ? 0.55 : 1,
    padding: '14px 16px',
    gap: 14,
    borderRadius: 18,
    cursor: 'pointer',
    position: 'relative',
    transform: isDrag ? 'scale(1.03)' : undefined,
    boxShadow: isDrag ? 'var(--layer-overlay-shadow)' : undefined,
    zIndex: isDrag ? 5 : 'auto',
  })
}
function textStyle(t: Task) {
  return pxify({
    ...itemTitle(),
    color: c.value.text,
    lineHeight: 1.3,
    fontWeight: 'var(--weight-semibold)',
    opacity: t.done ? 0.55 : 1,
    textDecoration: t.done ? 'line-through' : 'none',
  })
}
const shortcutHint = computed(() =>
  pxify({
    alignSelf: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    ...typeStep('xs'),
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const shortcutKey = computed(() => pxify({ fontFamily: 'var(--font-mono)', color: c.value.accent }))
const descStyle = computed(() =>
  pxify({
    ...typeStep('sm'),
    color: c.value.dim,
    minWidth: 0,
    flex: '1 1 auto',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
const metaLine = pxify({ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 })
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
const tagInputRow = pxify({
  padding: '4px 10px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-3)',
})
const listColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  // The list's scrollbar lives inside it with its room always kept, so rows do
  // not reflow narrower the moment the list grows long enough to scroll.
  scrollbarGutter: 'stable',
  // A scroll container clips its overflow on every side, so the room for a
  // hovered row's shadow has to be inside it.
  padding: '4px 10px 18px',
})
const doneAgo = (t: Task) => (t.completedAt ? relLabel(t.completedAt - now.value) : '')
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <!-- The tab's name in the middle; its actions and New in the corner. -->
    <PanelHeader title="Tasks" :new-label="isMobile ? undefined : 'New task'" @new="focusQuickAdd">
      <!-- Export on the left, level with the title; the count sits with the list. -->
      <template #left>
        <Dropdown :items="transferMenu" label="Export" variant="toolbar" @select="onTransfer" />
        <input
          ref="importFile"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onImportFile"
        />
      </template>
      <template #right>
        <DeleteUnpinned collection="tasks" />
        <button
          type="button"
          class="panel-action panel-action--icon"
          :class="{ 'is-on': showTagFilter }"
          :aria-pressed="showTagFilter"
          aria-label="Filter by tag"
          title="Filter by tag"
          @click="toggleTagFilter"
        >
          <Icon name="search" size="sm" />
        </button>
        <Dropdown
          :items="addedOptions"
          :label="addedLabel"
          variant="toolbar"
          @select="addedMode = $event"
        />

        <button v-if="anyLinked" type="button" class="panel-action" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
        <button
          v-if="moveSelectableIds.length && !selectionVisible"
          type="button"
          class="panel-action"
          @click="toggleSelectionMode"
        >
          Select
        </button>
      </template>
    </PanelHeader>
    <TaskTransferPasteDialog
      :open="pasteDialogOpen"
      collection="tasks"
      @close="pasteDialogOpen = false"
    />

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
    <MoveSelectionDialog
      :open="moveParentOpen"
      collection="tasks"
      :ids="selectedMoveIds"
      @close="moveParentOpen = false"
      @moved="clearMoveSelection"
    />
    <div v-if="selectionVisible" :style="bulkBar">
      <span>
        {{ selectedMoveCount ? selectedMoveCount + ' selected' : 'Select tasks to move' }}
      </span>
      <button v-if="!allMoveSelected" :style="s.editBtn" @click="selectAllMoveSelection">
        Select all
      </button>
      <button v-else :style="s.editBtn" @click="clearSelectedMoveSelection">Clear all</button>
      <Dropdown v-if="tagMenu.length" :items="tagMenu" label="By tag" @select="pickTag" />
      <button v-if="selectedMoveCount" :style="bulkCompleteBtn" @click="completeSelectedTasks">
        Completed
      </button>
      <button v-if="selectedMoveCount" :style="s.importBtn" @click="moveParentOpen = true">
        Move under...
      </button>
      <button v-if="selectedMoveCount" :style="s.importBtn" @click="moveSelectedToTodos">
        Move to Todos
      </button>
      <button v-if="selectedMoveCount" :style="s.importBtn" @click="exportSelected">
        Export JSON
      </button>
      <button v-if="selectedMoveCount" :style="bulkDeleteBtn" @click="openDeleteConfirm">
        {{ allMoveSelected ? 'Delete all' : 'Delete selected' }}
      </button>
      <button :style="s.editBtn" @click="toggleSelectionMode">Done</button>
    </div>
    <!-- data-own-keys: ↑/↓ scroll this list rather than switch tabs (globalKeys). -->
    <div :style="splitView ? splitLayout : leftColumn" data-own-keys>
      <div :style="leftColumn">
        <div :style="tagInputRow">
          <!-- Progress at the head of the list it measures, as on Todos. -->
          <ProgressLine
            part="inline"
            :done="split.stats.done + pinnedRoots.filter((item) => item.status === 'done').length"
            :total="split.stats.total + pinnedRoots.length"
          />
          <QuickAdd ref="quickAdd" collection="tasks" :compact="isMobile" />
          <TagFilterInput
            :visible="showTagFilter || !!tagQuery"
            v-model="tagQuery"
            :groups="tagGroups"
          />
        </div>
        <div v-scroll-fade :style="listColumn">
          <div v-if="tasks.length === 0" :style="s.empty">Nothing yet — add your first task.</div>
          <div
            v-else-if="
              tagQuery.trim() &&
              !pinnedRoots.length &&
              !carried.length &&
              !active.length &&
              !completed.length
            "
            :style="s.empty"
          >
            {{ emptyTagQueryMessage(tagQuery, 'tasks') }}
          </div>

          <Accordion
            v-if="pinnedRoots.length"
            aria-label="Pinned items"
            :title="'Pinned · ' + pinnedRoots.length"
            :open="acc.isOpen('pinned:tasks', true)"
            @toggle="acc.set('pinned:tasks', $event)"
          >
            <div
              class="pinned-scroll"
              role="region"
              aria-label="Pinned tasks list"
              tabindex="0"
              data-own-keys
            >
              <TreeList
                collection="tasks"
                :root-ids="pinnedRoots.map((item) => item.id)"
                :selected-ids="selectedMoveIds"
                :selection-mode="selectionVisible"
                @toggle-select="toggleMoveSelection"
                :selectable="!isMobile"
                :selected-id="selectedId"
                :swipe-rows="isMobile"
                @select="selectedId = $event"
              />
            </div>
          </Accordion>
          <Accordion
            v-if="carried.length || active.length || completed.length"
            aria-label="Unpinned items"
            :title="'Unpinned · ' + (carried.length + active.length + completed.length)"
            :open="acc.isOpen('unpinned:tasks', true)"
            @toggle="acc.set('unpinned:tasks', $event)"
          >
            <div :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }">
              <!-- 1. Carried over accordion -->
              <CarriedOverGroup
                v-if="carried.length > 0"
                collection="tasks"
                :count="carried.length"
                :subtitle="carriedSubtitle"
              >
                <div
                  v-for="t in carried"
                  :key="t.id"
                  class="todo-row-shell"
                  :class="{ 'is-leaving': completion.isLeaving(t.id) }"
                  :style="parentCardStyle"
                >
                  <div
                    class="todo-card"
                    :style="[
                      rowStyle(t),
                      selectedRowStyle(t.id),
                      moveSelectedRowStyle(t.id),
                      nestHighlight(t.id),
                    ]"
                    v-hover-style="
                      (!isMobile && selectedId === t.id) ||
                      (selectionVisible && isMoveSelected(t.id))
                        ? {}
                        : s.rowHover
                    "
                    :data-nest-id="t.id"
                    data-nest-collection="tasks"
                    :aria-selected="selectionVisible ? isMoveSelected(t.id) : undefined"
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
                    <RingCheck
                      :done="t.done"
                      :sub-done="subCount(t.id).done"
                      :sub-total="subCount(t.id).total"
                      @toggle="completion.toggle(t.id)"
                    />
                    <div :style="s.taskMain" @click="openTask(t.id, $event)">
                      <span :style="textStyle(t)">{{ t.title }}</span>
                      <!-- Second line: the tag, then one line of description. -->
                      <div
                        v-if="t.tag || !richIsEmpty(t.notes) || t.rolloverCount > 1"
                        :style="metaLine"
                      >
                        <TitleTagPill v-if="t.tag" :tag="t.tag" />
                        <span v-if="!richIsEmpty(t.notes)" :style="descStyle">{{
                          richPlain(t.notes).replace(/\s+/g, ' ')
                        }}</span>
                        <span v-if="t.rolloverCount > 1" :style="rolloverChipStyle"
                          >rolled over ×{{ t.rolloverCount }}</span
                        >
                      </div>
                      <OfflineChip :pending="app.isItemPending('task', t.id)" />
                    </div>
                    <div class="row-actions">
                      <span
                        v-if="subCount(t.id).total"
                        class="todo-count"
                        :title="
                          subCount(t.id).done + ' of ' + subCount(t.id).total + ' subtasks done'
                        "
                        >{{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                      >
                      <ItemPinButton collection="tasks" :id="t.id" />
                      <RemindBell collection="tasks" :id="t.id" icon-size="md" />
                      <IconButton
                        class="row-reveal"
                        label="Delete task"
                        tone="danger"
                        @click.stop="app.deleteWithUndo('tasks', 'task', t.id)"
                      >
                        <Icon name="x" size="sm" />
                      </IconButton>
                    </div>
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
                :swipe-rows="isMobile"
                :selected-ids="selectedMoveIds"
                :selection-mode="selectionVisible"
                @select="selectedId = $event"
                @toggle-select="toggleMoveSelection"
              />
              <CompletedSection
                v-if="!hideCompleted && completed.length > 0"
                collection="tasks"
                :count="completed.length"
                :sort="completedSort"
                clearable
                @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
                @clear="app.archiveCompleted('tasks')"
              >
                <template v-for="t in completedWindow.visible.value" :key="t.id">
                  <div
                    :style="[rowStyle(t, true), selectedRowStyle(t.id), moveSelectedRowStyle(t.id)]"
                    :aria-selected="selectionVisible ? isMoveSelected(t.id) : undefined"
                    @pointerdown.capture="onTaskRowPointerDown"
                    @click.capture="onTaskRowClick($event, t.id)"
                  >
                    <RingCheck
                      :done="t.done"
                      :sub-done="subCount(t.id).done"
                      :sub-total="subCount(t.id).total"
                      @toggle="completion.toggle(t.id)"
                    />
                    <div :style="s.taskMain" @click="openTask(t.id, $event)">
                      <span :style="textStyle(t)"
                        ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.title }}</span
                      >
                      <div :style="s.chipRow">
                        <span
                          v-if="subCount(t.id).total"
                          :style="subCountStyle"
                          title="Subtasks done / total"
                          >{{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                        >
                        <span :style="doneMetaStyle">done {{ doneAgo(t) }}</span>
                      </div>
                    </div>
                    <ItemPinButton collection="tasks" :id="t.id" />
                    <IconButton
                      label="Delete task"
                      tone="danger"
                      @click.stop="app.deleteWithUndo('tasks', 'task', t.id)"
                    >
                      <Icon name="x" size="sm" />
                    </IconButton>
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
              </CompletedSection>
            </div>
          </Accordion>
        </div>
        <span v-if="!isMobile" :style="shortcutHint"
          ><span :style="shortcutKey">/n</span>focus quick add</span
        >
      </div>

      <!-- The selected task's details and subtasks (desktop). Inline it is the
           second column of this grid; in either drawer mode it floats over the
           tab instead and this contributes nothing to the layout. -->
      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        :title="selectedExists ? 'Task details' : 'Next up'"
        :subtitle="selectedExists ? '' : 'First open subtasks of each task'"
        :task-id="selectedExists ? selectedId : null"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <TaskDetail v-if="selectedExists" :task-id="selectedId" @select="selectedId = $event" />
        <NextUpPanel v-else collection="tasks" :roots="nextUpRoots" @select="selectedId = $event" />
      </DetailPane>
    </div>
  </div>
</template>

<style scoped>
.pinned-scroll {
  max-height: min(45dvh, 420px);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  padding-right: var(--sp-1);
}
</style>

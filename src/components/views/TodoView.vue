<script setup lang="ts">
// The todo list, restructured around the Done/Not-done split and the single
// carried-over accordion (no per-day date groups): a "Carried over · N"
// accordion when anything is pending from before today, then today's active
// items flat, then a collapsed "Completed" section. Drag-to-nest, linked
// accordions and the new "Remind me" bell all keep working inside every region.
// On desktop the selected todo's details show in the right-hand pane, which is
// a column of this tab by default and a floating drawer over it on request —
// one setting, three steps, cycled from the pane's own header (DetailPane).
//
// TODO V2. Quick add sits where the tag filter was (the filter is behind the
// search toggle in the header); rows wear their subtask progress as a ring
// round the checkbox; with nothing selected the pane lists the next open
// subtasks instead of one line of text; and on a phone a row opens a bottom
// sheet rather than the full-screen dialog.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { DANGER, SUCCESS, WARNING, merge, pxify, rowBase, typeStep } from '@/styles'
import { ymd } from '@/utils/dayGroups'
import { todayKey, isOverdueTodo } from '@/utils/rollover'
import { splitList, ageChip, oldestFromLabel } from '@/utils/listSplit'
import { relLabel } from '@/utils/upcoming'
import ListToolbar from '@/components/ListToolbar.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import TreeList from '@/components/TreeList.vue'
import TodoDetail from '@/components/TodoDetail.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import Modal from '@/components/ui/Modal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import TaskTransferPasteDialog from '@/components/TaskTransferPasteDialog.vue'
import { nestedChildIds } from '@/utils/links'
import { richIsEmpty, richPlain } from '@/utils/richText'
import { copyToClipboard } from '@/utils/share'
import { downloadText } from '@/utils/noteExport'
import {
  buildTaskTransferUrl,
  exportTaskTransferJson,
  taskTransferFilename,
} from '@/utils/taskTransfer'
import TitleTagPill from '@/components/TitleTagPill.vue'
import { buildIndex, childrenOf, descendantsOf, progressOf } from '@/utils/taskTree'
import { emptyTagQueryMessage, matchesTagQuery } from '@/utils/tagFilter'
import TagFilterInput from '@/components/TagFilterInput.vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { useDragNest } from '@/composables/useDragNest'
import { usePaneInset } from '@/composables/usePaneInset'
import type { LinkRef, Todo } from '@/types'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import QuickAdd from '@/components/todo/QuickAdd.vue'
import RingCheck from '@/components/ui/RingCheck.vue'
import NextUpPanel from '@/components/todo/NextUpPanel.vue'
import { useWeeklyReview } from '@/composables/useWeeklyReview'
import { focusTargetOf } from '@/utils/todoV2'

const app = useAppStore()
const ui = useUiStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { startDrag, targetState } = useDragNest()
const { todos, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

// "/n" and "+ New todo" land in quick add; the full create dialog is still in
// the details pane's editor for everything quick add does not cover.
const quickAdd = ref<InstanceType<typeof QuickAdd> | null>(null)
function focusQuickAdd() {
  if (quickAdd.value) quickAdd.value.focus()
  else app.openCreate('todo')
}
defineExpose({ focus: focusQuickAdd })

const review = useWeeklyReview()
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
  { value: 'export-json', label: 'Export JSON', disabled: todos.value.length === 0 },
  { value: 'copy-url', label: 'Copy import URL', disabled: todos.value.length === 0 },
  { value: 'paste-json', label: 'Paste JSON/link' },
  { value: 'import-file', label: 'Import file' },
  { value: 'sample-json', label: 'Example JSON' },
])

function exportTodosJson() {
  downloadText(
    exportTaskTransferJson('todos', todos.value, new Date().toISOString()),
    taskTransferFilename('todos'),
    'application/json;charset=utf-8',
  )
  app.showToastMsg('Todos exported')
}

async function copyTodosUrl() {
  try {
    await copyToClipboard(buildTaskTransferUrl('todos', todos.value))
    app.showToastMsg('Todo import URL copied')
  } catch {
    app.showToastMsg('Could not copy import URL')
  }
}

function onTransfer(action: string) {
  if (action === 'export-json') exportTodosJson()
  else if (action === 'copy-url') void copyTodosUrl()
  else if (action === 'paste-json') pasteDialogOpen.value = true
  else if (action === 'import-file') importFile.value?.click()
  else if (action === 'sample-json') app.openTaskTransferHelp('todos')
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const result = app.importTaskTransferJson(String(reader.result ?? ''), 'todos')
    if (result.error) app.showToastMsg('Could not import todos: ' + result.error)
    else app.showToastMsg(`Imported ${result.count} todo${result.count === 1 ? '' : 's'} from JSON`)
  }
  reader.onerror = () => app.showToastMsg('Could not read that JSON file')
  reader.readAsText(file)
}

const todayStr = computed(() => todayKey(new Date(now.value)))
function dayOf(t: Todo): string {
  return t.createdAt > 0 ? ymd(new Date(t.createdAt)) : ''
}

// Nested children render inside their parent's tree, never as top-level rows, so
// they are filtered out of every region here — both cross-collection link nesting
// and the flat parentId hierarchy.
const nestedIds = computed(() => nestedChildIds('todos', todos.value))
const treeNestedIds = computed(() => {
  const present = new Set(todos.value.map((t) => t.id))
  const nested = new Set<number>()
  for (const t of todos.value) {
    if (t.parentId != null && present.has(t.parentId)) nested.add(t.id)
  }
  return nested
})
const topLevel = computed(() =>
  todos.value.filter((t) => !nestedIds.value.has(t.id) && !treeNestedIds.value.has(t.id)),
)

// --- tag filter --------------------------------------------------------------
// A top-level todo is described by its own tag and every subtask's below it, so
// filtering to a tag finds a tagged subtask under an untagged parent rather than
// hiding it with the parent. Applied before the split, so carried-over, today and
// completed all narrow together and the progress line counts what is shown.
// The query is typed into the input at the top of the list column.
const tagQuery = ref('')
function treeTags(t: Todo): string[] {
  return [t.tag, ...descendantsOf(todoIndex.value, t.id).map((d) => d.tag)]
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
    isCarried: (t) => isOverdueTodo(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    archivedAt: (t) => t.archivedAt ?? null,
    // No day filter: Completed keeps everything finished until it is cleared
    // or deleted. It used to show only what was ticked TODAY, so yesterday's
    // work vanished at midnight — into no list, with no way to reach it and no
    // sign it had ever existed. `useLongList` below is what makes an unbounded
    // section affordable; a day filter is not the right way to bound it.
    completedSort: completedSort.value,
  }),
)
// Carried oldest-first by original day; today's active in list order.
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
// On desktop the list sits on the left and a tap shows the todo (and its
// subtasks) in the right-hand pane; on mobile there is no room for a second
// column, so a tap keeps opening the item dialog.
const selectedId = ref<number | null>(null)
const selectedExists = computed(
  () => selectedId.value != null && todos.value.some((t) => t.id === selectedId.value),
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
// Subtask counter shown on every row, 0/0 when a todo has none.
const todoIndex = computed(() => buildIndex(todos.value))
function subCount(id: number) {
  return progressOf(todoIndex.value, id, (x) => x.status === 'done')
}
const selectionMode = ref(false)
const selectedMove = ref<Set<number>>(new Set())
function treeIds(id: number): number[] {
  return [id, ...childrenOf(todoIndex.value, id).flatMap((child) => treeIds(child.id))]
}
const moveSelectableIds = computed(() => {
  const ids = [
    ...carried.value.map((todo) => todo.id),
    ...activeRootIds.value.flatMap(treeIds),
    ...completedWindow.visible.value.map((todo) => todo.id),
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
function selectAllMoveSelection() {
  selectionMode.value = true
  selectedMove.value = new Set(moveSelectableIds.value)
}
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) selectedMove.value = new Set()
}
function moveSelectedToTasks() {
  const created = app.convertTodosToTasks(selectedMoveIds.value)
  clearMoveSelection()
  selectedId.value = null
  if (created.length) ui.setTab('tasks')
}
function completeSelectedTodos() {
  const ids = selectedActionIds.value.filter((id) => {
    const todo = todoIndex.value.byId.get(id)
    return todo && todo.status !== 'done'
  })
  for (const id of ids) app.setTodoStatus(id, 'done')
  if (ids.length) app.showToastMsg(`Completed ${ids.length} todo${ids.length === 1 ? '' : 's'}`)
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
    const deleted = await app.deleteManyWithProgress('todos', selectedMoveIds.value)
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
const subCountStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    color: c.value.dim,
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  }),
)
function isTripleClick(event?: MouseEvent) {
  return (event?.detail ?? 0) >= 3
}
function openTodo(id: number, event?: MouseEvent) {
  if (isTripleClick(event)) {
    event?.preventDefault()
    toggleMoveSelection(id)
    return
  }
  if (selectionVisible.value) {
    toggleMoveSelection(id)
    return
  }
  if (isMobile.value) ui.setSheetTodo(id)
  else selectedId.value = id
}
// The list's own tap: the pane on a desktop, the sheet on a phone.
function onTreeSelect(id: number) {
  if (isMobile.value) ui.setSheetTodo(id)
  else selectedId.value = id
}
function focusOn(id: number) {
  const target = focusTargetOf(todoIndex.value, id)
  if (target == null) app.showToastMsg('Nothing open to focus on')
  else ui.startFocus(target)
}
// Escape clears the selection and the pane goes back to Next up.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || selectedId.value == null) return
  const t = e.target as HTMLElement | null
  if (
    t &&
    (t.closest('input, textarea, [contenteditable="true"], [role="dialog"]') || t.isContentEditable)
  )
    return
  selectedId.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
// Open top-level todos in list order, for Next up.
const nextUpRoots = computed(() => [...carried.value, ...active.value])
function shouldSelectRow(event?: MouseEvent) {
  return selectionVisible.value || isTripleClick(event)
}
function onTodoRowClick(event: MouseEvent, id: number) {
  if (!shouldSelectRow(event)) return
  event.preventDefault()
  event.stopPropagation()
  toggleMoveSelection(id)
}
function onTodoRowPointerDown(event: PointerEvent) {
  if (!selectionVisible.value) return
  event.stopPropagation()
}
function onTodoMainClick(event: MouseEvent, id: number) {
  if (shouldSelectRow(event)) return
  openTodo(id, event)
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
  gap: 'var(--sp-2)',
})
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

// --- drag-to-nest -----------------------------------------------------------
function onGripDown(e: PointerEvent, t: Todo) {
  e.preventDefault()
  e.stopPropagation()
  startDrag([{ id: t.id, collection: 'todos' }], e, {
    title: t.text || '(untitled)',
    badge: 'Todo',
  })
}
function nestHighlight(id: number) {
  const ts = targetState({ id, collection: 'todos' } as LinkRef)
  if (!ts.active || ts.zone !== 'nest') return {}
  return ts.valid
    ? { outline: '2px solid ' + c.value.accent, outlineOffset: '1px', background: c.value.card }
    : { outline: '2px solid ' + DANGER, outlineOffset: '1px' }
}

// --- linked-items nesting ---------------------------------------------------
const acc = useAccordionState()
function accKey(t: Todo) {
  return 'todos:' + t.id
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
function linksOpen(t: Todo) {
  return t.linked.length > 0 && acc.isOpen(accKey(t))
}
const linkBody = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  padding: '6px 4px 2px 26px',
})

// --- styles -----------------------------------------------------------------
function textStyle(t: Todo) {
  return pxify({
    ...typeStep('base'),
    fontWeight: 'var(--weight-medium)',
    lineHeight: 1.4,
    color: c.value.text,
    cursor: 'pointer',
    opacity: t.done ? 0.55 : 1,
    textDecoration: t.done ? 'line-through' : 'none',
  })
}
const reviewBtn = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '6px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.text,
    ...typeStep('sm'),
    fontWeight: 'var(--weight-medium)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const reviewBadge = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '0 6px',
    borderRadius: 'var(--radius-pill)',
    background: 'color-mix(in srgb, ' + c.value.accent + ' 18%, transparent)',
    color: c.value.accent,
  }),
)
const iconToggle = computed(() =>
  pxify({
    width: 32,
    height: 32,
    padding: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + (showTagFilter.value ? c.value.accent : c.value.border),
    background: showTagFilter.value
      ? 'color-mix(in srgb, ' + c.value.accent + ' 12%, transparent)'
      : 'transparent',
    color: showTagFilter.value ? c.value.accent : c.value.dim,
    cursor: 'pointer',
    flexShrink: 0,
  }),
)
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
    ...typeStep('xs'),
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
function rowStyle(done = false) {
  return merge(rowBase(c.value), { opacity: done ? 0.55 : 1, position: 'relative' })
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
const doneAgo = (t: Todo) => (t.completedAt ? relLabel(t.completedAt - now.value) : '')
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <!-- On a phone quick add is already in view, so the strip keeps only what
         the list column does not carry. -->
    <ListToolbar title="Todos" :new-label="isMobile ? undefined : 'New todo'" @new="focusQuickAdd">
      <template #actions>
        <Dropdown :items="transferMenu" label="Export" variant="toolbar" @select="onTransfer" />
        <input
          ref="importFile"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onImportFile"
        />
        <button v-if="anyLinked" type="button" :style="linkExpandBtn" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
        <button
          type="button"
          :style="iconToggle"
          :aria-pressed="showTagFilter"
          aria-label="Filter by tag"
          title="Filter by tag"
          @click="toggleTagFilter"
        >
          <Icon name="search" size="sm" />
        </button>
        <button
          type="button"
          :style="reviewBtn"
          v-hover-style="{ background: c.card }"
          :aria-label="'Weekly review, ' + review.undecided.value + ' to decide'"
          @click="ui.setReviewOpen(true)"
        >
          <Icon name="calendar-check" size="sm" :style="{ color: c.accent }" />
          <span v-if="!isMobile">Weekly review</span>
          <span v-if="review.undecided.value" :style="reviewBadge">{{
            review.undecided.value
          }}</span>
        </button>
      </template>
    </ListToolbar>
    <TaskTransferPasteDialog
      :open="pasteDialogOpen"
      collection="todos"
      @close="pasteDialogOpen = false"
    />
    <Modal
      :open="deleteConfirmOpen"
      title="Delete selected todos"
      size="sm"
      @close="closeDeleteConfirm"
    >
      <p :style="confirmCopy">
        Delete {{ selectedMoveCount }} selected todo{{ selectedMoveCount === 1 ? '' : 's' }}? Nested
        subtodos under selected parents are included.
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
        {{ selectedMoveCount ? selectedMoveCount + ' selected' : 'Select todos to move' }}
      </span>
      <button v-if="!allMoveSelected" :style="s.editBtn" @click="selectAllMoveSelection">
        Select all
      </button>
      <button v-else :style="s.editBtn" @click="clearSelectedMoveSelection">Clear all</button>
      <button v-if="selectedMoveCount" :style="bulkCompleteBtn" @click="completeSelectedTodos">
        Completed
      </button>
      <button v-if="selectedMoveCount" :style="s.importBtn" @click="moveSelectedToTasks">
        Move to Tasks
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
          <QuickAdd ref="quickAdd" :compact="isMobile" />
          <TagFilterInput v-if="showTagFilter || tagQuery" v-model="tagQuery" :groups="tagGroups" />
        </div>
        <div :style="listColumn">
          <div v-if="todos.length === 0" :style="s.empty">Nothing yet — add your first todo.</div>
          <div
            v-else-if="tagQuery.trim() && !carried.length && !active.length && !completed.length"
            :style="s.empty"
          >
            {{ emptyTagQueryMessage(tagQuery, 'todos') }}
          </div>

          <!-- 1. Carried over accordion (only when non-empty) -->
          <CarriedOverGroup
            v-if="carried.length > 0"
            collection="todos"
            :count="carried.length"
            :subtitle="carriedSubtitle"
          >
            <div v-for="t in carried" :key="t.id" :style="parentCardStyle">
              <div
                :style="[
                  rowStyle(),
                  selectedRowStyle(t.id),
                  moveSelectedRowStyle(t.id),
                  nestHighlight(t.id),
                ]"
                v-hover-style="s.rowHover"
                :data-nest-id="t.id"
                data-nest-collection="todos"
                :aria-selected="selectionVisible ? isMoveSelected(t.id) : undefined"
                @pointerdown.capture="onTodoRowPointerDown"
                @click.capture="onTodoRowClick($event, t.id)"
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
                  @toggle="app.toggleTodo(t.id)"
                />
                <div :style="s.taskMain" @click="onTodoMainClick($event, t.id)">
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.text }}</span
                  >
                  <span v-if="!richIsEmpty(t.description)" :style="descStyle">{{
                    richPlain(t.description).replace(/\s+/g, ' ')
                  }}</span>
                  <div :style="s.chipRow">
                    <span
                      v-if="subCount(t.id).total"
                      :style="subCountStyle"
                      title="Subtasks done / total"
                      >{{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                    >
                    <span v-if="t.rolloverCount > 1" :style="rolloverChipStyle"
                      >rolled over ×{{ t.rolloverCount }}</span
                    >
                  </div>
                  <OfflineChip :pending="app.isItemPending('todo', t.id)" />
                </div>
                <IconButton label="Focus on the next subtask" @click.stop="focusOn(t.id)">
                  <Icon name="timer" size="sm" />
                </IconButton>
                <RemindBell collection="todos" :id="t.id" />
                <IconButton
                  label="Delete todo"
                  tone="danger"
                  @click.stop="app.deleteWithUndo('todos', 'todo', t.id)"
                >
                  <Icon name="x" size="sm" />
                </IconButton>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
                <LinkedAccordion
                  v-for="ch in t.linked"
                  :key="ch.collection + ':' + ch.id"
                  :item-ref="ch"
                  :parent-ref="{ id: t.id, collection: 'todos' }"
                  :depth="0"
                  :is-root="false"
                />
              </div>
            </div>
          </CarriedOverGroup>

          <!-- 2. Today's active items as a flat, drag-reorderable tree (grip handle,
         reorder / nest / promote indicators, root strip). -->
          <TreeList
            collection="todos"
            :root-ids="activeRootIds"
            selectable
            :swipe-rows="isMobile"
            :selected-id="selectedId"
            :selected-ids="selectedMoveIds"
            :selection-mode="selectionVisible"
            @select="onTreeSelect"
            @remind="ui.setSheetTodo($event)"
            @toggle-select="toggleMoveSelection"
          />

          <!-- 3. Completed section (collapsed) -->
          <CompletedSection
            v-if="!hideCompleted && completed.length > 0"
            collection="todos"
            :count="completed.length"
            :sort="completedSort"
            clearable
            @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
            @clear="app.archiveCompleted('todos')"
          >
            <template v-for="t in completedWindow.visible.value" :key="t.id">
              <div
                :style="[rowStyle(true), selectedRowStyle(t.id), moveSelectedRowStyle(t.id)]"
                :aria-selected="selectionVisible ? isMoveSelected(t.id) : undefined"
                @pointerdown.capture="onTodoRowPointerDown"
                @click.capture="onTodoRowClick($event, t.id)"
              >
                <RingCheck
                  :done="t.done"
                  :sub-done="subCount(t.id).done"
                  :sub-total="subCount(t.id).total"
                  @toggle="app.toggleTodo(t.id)"
                />
                <div :style="s.taskMain" @click="onTodoMainClick($event, t.id)">
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.text }}</span
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
                <IconButton
                  label="Delete todo"
                  tone="danger"
                  @click.stop="app.deleteWithUndo('todos', 'todo', t.id)"
                >
                  <Icon name="x" size="sm" />
                </IconButton>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
                <LinkedAccordion
                  v-for="ch in t.linked"
                  :key="ch.collection + ':' + ch.id"
                  :item-ref="ch"
                  :parent-ref="{ id: t.id, collection: 'todos' }"
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
        <span v-if="!isMobile" :style="shortcutHint"
          ><span :style="shortcutKey">/n</span>focus quick add</span
        >
      </div>

      <!-- The selected todo's details and subtasks (desktop). Inline it is the
           second column of this grid; in either drawer mode it floats over the
           tab instead and this contributes nothing to the layout. -->
      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        :title="selectedExists ? 'Todo details' : 'Next up'"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <TodoDetail v-if="selectedExists" :todo-id="selectedId" @select="selectedId = $event" />
        <!-- Nothing selected (Todo v2, 2c): the next open subtasks, tickable here. -->
        <NextUpPanel v-else :roots="nextUpRoots" />
      </DetailPane>
    </div>
  </div>
</template>

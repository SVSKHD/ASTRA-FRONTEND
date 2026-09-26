<script setup lang="ts">
// The active region of the todos/tasks list, rendered as ONE flat, indented tree
// so the drag affordances read correctly: every row (root or descendant) is a
// direct child of the same container at padding-left = depth × INDENT, which is
// exactly the coordinate space the reorder line and the horizontal-depth
// projection work in. Collapsing a row filters its subtree out of the flat list.
//
// Shared by both collections; the few per-collection bits (title field, todo
// description / globe share, task due / repo) branch on `collection`. The drag
// engine, grip handle and drop-line indicator are collection-agnostic.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { vFocusField as vFocus } from '@/composables/useInlineEdit'
import TextInput from '@/components/ui/TextInput.vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { useTreeDrag, INDENT_PX, type TreeCollection } from '@/composables/useTreeDrag'
import { useTapOpen } from '@/composables/useTapOpen'
import { buildIndex, childrenOf, progressOf } from '@/utils/taskTree'
import { richPlain } from '@/utils/richText'
import TitleTagPill from '@/components/TitleTagPill.vue'
import { DANGER, WARNING, doneText, merge, pxify, rowBase, typeStep } from '@/styles'
import TreeDragHandle from '@/components/TreeDragHandle.vue'
import TreeDropLine from '@/components/TreeDropLine.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import StatusPill from '@/components/StatusPill.vue'
import IssueChip from '@/components/IssueChip.vue'
import RemindBell from '@/components/RemindBell.vue'
import type { LinkRef, Task, Todo } from '@/types'
import Icon from '@/components/ui/Icon.vue'
import Caret from '@/components/ui/Caret.vue'
import RingCheck from '@/components/todo/RingCheck.vue'
import { useUiStore } from '@/stores/ui'
import { focusTargetOf } from '@/utils/todoV2'
import type { TreeIndex } from '@/utils/taskTree'

// `selectable`: a tap selects the row (emits `select`) instead of opening the
// item dialog — used by the Todos master/detail layout.
// `swipeRows` (todos on a phone, Todo v2 3a): rows keep only the checkbox, the
// title and its tag; Remind and Delete sit behind the row and a drag to the left
// reveals them. Subtasks are read in the sheet rather than unfolded in the list.
const props = defineProps<{
  collection: TreeCollection
  rootIds: number[]
  selectable?: boolean
  selectedId?: number | null
  selectedIds?: number[]
  selectionMode?: boolean
  swipeRows?: boolean
}>()
const emit = defineEmits<{
  select: [id: number]
  toggleSelect: [id: number]
  remind: [id: number]
}>()
const ui = useUiStore()

const app = useAppStore()
const { c, s } = useStyles()
const { todos, tasks } = storeToRefs(app)
const accordion = useAccordionState()
const { targetState, rootState, isSource, setAnnouncer } = useTreeDrag()

// Screen-reader announcements for drag moves (picked up / moved / dropped /
// cancelled / can't drop), driven by the engine.
const liveMsg = ref('')
onMounted(() => setAnnouncer((m) => (liveMsg.value = m)))
onBeforeUnmount(() => setAnnouncer(() => {}))
const srOnly = {
  position: 'absolute' as const,
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
}

const isTasks = computed(() => props.collection === 'tasks')
const list = computed<(Task | Todo)[]>(() => (isTasks.value ? tasks.value : todos.value))
const index = computed(() => buildIndex(list.value))
const selectedSet = computed(() => new Set(props.selectedIds ?? []))

const keyOf = (id: number) => (isTasks.value ? 'tasktree:' : 'todotree:') + id
function expanded(id: number) {
  return accordion.isOpen(keyOf(id))
}
function toggleExpand(id: number) {
  accordion.toggle(keyOf(id))
}
// The chevron sits right beside the drag grip, so a drag that starts or ends on
// it must not fold the subtree: only a real tap toggles.
let expandId: number | null = null
const expandTap = useTapOpen(() => {
  if (expandId != null) toggleExpand(expandId)
})
function onExpandClick(event: MouseEvent, id: number) {
  expandId = id
  expandTap.onClick(event)
  expandId = null
}
function hasKids(id: number) {
  return childrenOf(index.value, id).length > 0
}

const collapsed = computed(() => {
  const set = new Set<number>()
  for (const it of list.value)
    if (hasKids(it.id) && (props.swipeRows || !expanded(it.id))) set.add(it.id)
  return set
})

interface Row {
  id: number
  parentId: number | null
  depth: number
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const emit = (id: number, depth: number, parentId: number | null) => {
    out.push({ id, parentId, depth })
    if (!collapsed.value.has(id)) {
      for (const ch of childrenOf(index.value, id)) emit(ch.id, depth + 1, id)
    }
  }
  for (const rid of props.rootIds) {
    if (index.value.byId.has(rid)) emit(rid, 0, null)
  }
  return out
})

function nodeOf(id: number) {
  return index.value.byId.get(id)
}
function title(id: number) {
  const n = nodeOf(id)
  if (!n) return '(untitled)'
  return (isTasks.value ? (n as Task).title : (n as Todo).text) || '(untitled)'
}
function desc(id: number) {
  const n = nodeOf(id)
  // Descriptions are rich text now; the row shows a one-line plain preview.
  return !isTasks.value ? richPlain((n as Todo | undefined)?.description).replace(/\s+/g, ' ') : ''
}
function tagOf(id: number) {
  return nodeOf(id)?.tag || ''
}
// A linked GitHub issue shows as a chip on the row (13c). Tasks only — todos
// never link to issues.
function issueLinkOf(id: number) {
  return isTasks.value ? ((nodeOf(id) as Task | undefined)?.github ?? null) : null
}
// Goals this row is attached to (task 8), for the goal chip. Resolves ids to
// goals so a row shows which goal(s) it belongs to from the Tasks/Todos tab —
// and so the chip can open that goal rather than the row it sits on (18b).
function goalsOf(id: number): { id: number; label: string }[] {
  const ids = nodeOf(id)?.goalIds
  if (!ids || !ids.length) return []
  return ids
    .map((gid) => app.goalById(gid))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => ({ id: g.id, label: g.title || 'Goal' }))
}
function done(id: number) {
  return nodeOf(id)?.status === 'done'
}
function statusOf(id: number) {
  return nodeOf(id)?.status ?? 'pending'
}
function conflicted(id: number) {
  return nodeOf(id)?.hasConflict === true
}
function progress(id: number) {
  return progressOf(index.value, id, (x) => x.status === 'done')
}
function itemType(): 'task' | 'todo' {
  return isTasks.value ? 'task' : 'todo'
}
function dueLabel(id: number) {
  const t = nodeOf(id) as Task | undefined
  if (!isTasks.value || !t?.deadline) return ''
  return new Date(t.deadline + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function isTripleClick(event?: MouseEvent) {
  return (event?.detail ?? 0) >= 3
}
function openDetail(id: number, event?: MouseEvent) {
  if (isTripleClick(event)) {
    event?.preventDefault()
    toggleSelect(id)
    return
  }
  if (props.selectionMode) {
    toggleSelect(id)
    return
  }
  if (props.selectable) {
    emit('select', id)
    return
  }
  // The rows currently on screen, in the order they are read, so the dialog's
  // prev/next arrows step through what the reader is looking at rather than
  // through the whole collection (section 18a).
  if (isTasks.value)
    app.openTaskDialog(
      id,
      rows.value.map((r) => r.id),
    )
  else app.openEdit('todo', id)
}
// A goal chip opens its goal, not the row it is sitting on (section 18b).
function openGoal(goalId: number) {
  app.openGoalDialog(goalId)
}
// The row's open zone is a tap target, not a press-and-hold one: holding starts
// a drag, and releasing from a drag must not leave a dialog open behind it.
const pressedRow = ref<number | null>(null)
const tap = useTapOpen((event) => {
  const id = pressedRow.value
  pressedRow.value = null
  if (id != null) openDetail(id, event)
})
function onRowPointerDown(event: PointerEvent, id: number) {
  if (props.swipeRows) return
  pressedRow.value = id
  tap.onPointerDown(event)
}
function onRowCardClick(event: MouseEvent, id: number) {
  if (!props.selectionMode && !isTripleClick(event)) return
  event.preventDefault()
  event.stopPropagation()
  toggleSelect(id)
}
function onRowCardPointerDown(event: PointerEvent) {
  if (!props.selectionMode) return
  event.stopPropagation()
}
function onMainClick(event: MouseEvent) {
  if (props.swipeRows || props.selectionMode || isTripleClick(event)) return
  tap.onClick(event)
}
function toggleDone(id: number) {
  if (isTasks.value) app.cycleTaskStatus(id)
  else app.toggleTodo(id)
}
function cycleStatus(id: number) {
  if (isTasks.value) app.cycleTaskStatus(id)
  else app.cycleTodoStatus(id)
}
function del(id: number) {
  app.deleteWithUndo(props.collection, itemType(), id)
}
// A todo's timer (Todo v2, 5b) focuses its first open subtask, or the todo
// itself when it has none.
function focusOn(id: number) {
  const target = focusTargetOf(index.value as TreeIndex<Todo>, id)
  if (target == null) app.showToastMsg('Nothing open to focus on')
  else ui.startFocus(target)
}

// --- swipe to reveal (phone todos) -------------------------------------------
// The row follows the finger 1:1 between 0 and −144px with no transition while
// dragging; on release it snaps open past −60, shut otherwise. A press that
// barely moved is a tap: it shuts an open row, or opens the todo.
const SWIPE_OPEN = -144
const swipe = ref<Record<number, number>>({})
const swiping = ref<number | null>(null)
let sw: {
  id: number
  x: number
  y: number
  base: number
  moved: number
  h: boolean | null
} | null = null
function swipeOffset(id: number) {
  return swipe.value[id] ?? 0
}
function setSwipe(id: number, v: number) {
  swipe.value = { ...swipe.value, [id]: v }
}
function swDown(e: PointerEvent, id: number) {
  if (!props.swipeRows || e.button > 0) return
  sw = { id, x: e.clientX, y: e.clientY, base: swipeOffset(id), moved: 0, h: null }
}
function swMove(e: PointerEvent) {
  const g = sw
  if (!g) return
  const dx = e.clientX - g.x
  const dy = e.clientY - g.y
  g.moved = Math.max(g.moved, Math.abs(dx), Math.abs(dy))
  if (g.h == null) {
    if (g.moved < 6) return
    g.h = Math.abs(dx) > Math.abs(dy)
    if (!g.h) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    swiping.value = g.id
  }
  if (g.h) setSwipe(g.id, Math.max(SWIPE_OPEN, Math.min(0, g.base + dx)))
}
function swUp() {
  const g = sw
  sw = null
  swiping.value = null
  if (!g) return
  const cur = swipeOffset(g.id)
  if (g.moved < 6) {
    if (cur < 0) setSwipe(g.id, 0)
    else if (!props.selectionMode) openDetail(g.id)
    return
  }
  if (g.h) setSwipe(g.id, cur < -60 ? SWIPE_OPEN : 0)
}
function swipeStyle(id: number) {
  if (!props.swipeRows) return {}
  return {
    transform: `translateX(${swipeOffset(id)}px)`,
    transition:
      swiping.value === id
        ? 'none'
        : 'transform .35s cubic-bezier(.3,1.3,.5,1), border-color .2s ease',
    touchAction: 'pan-y',
    userSelect: 'none' as const,
    zIndex: 1,
    background: c.value.bgSolid,
  }
}
function swipeRemind(id: number) {
  setSwipe(id, 0)
  emit('remind', id)
}
function swipeDelete(id: number) {
  setSwipe(id, 0)
  del(id)
}
function dismissConflict(id: number) {
  if (isTasks.value) app.dismissTaskConflict(id)
}

// --- quick "add subtask" from a row -----------------------------------------
// The row's ＋ opens an inline input beneath it; Enter adds a child (and keeps
// the input open for the next one), Escape or blurring an empty input closes it.
const addingUnder = ref<number | null>(null)
const subDraft = ref('')
function startAddSub(id: number) {
  addingUnder.value = id
  subDraft.value = ''
}
function cancelAddSub() {
  addingUnder.value = null
  subDraft.value = ''
}
function submitAddSub() {
  const parentId = addingUnder.value
  const text = subDraft.value.trim()
  if (parentId == null || !text) return
  const position = childrenOf(index.value, parentId).length
  const newId = isTasks.value ? app.addTask(text, '') : app.addTodo(text)
  if (newId != null) {
    if (isTasks.value) app.moveTask(newId, parentId, position)
    else app.moveTodo(newId, parentId, position)
    accordion.set(keyOf(parentId), true)
  }
  subDraft.value = ''
}
function onSubBlur() {
  if (!subDraft.value.trim()) cancelAddSub()
}

// --- cross-collection linked items (preserved from the list rows) -----------
function linkedOf(id: number): LinkRef[] {
  return nodeOf(id)?.linked ?? []
}
function linksExpanded(id: number) {
  return accordion.isOpen(props.collection + ':' + id)
}
function breadcrumb(id: number): string {
  return (nodeOf(id)?.parents ?? [])
    .map((p) => app.linkableById(p))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ('text' in it ? it.text : it.title))
    .join(', ')
}
function selfRef(id: number): LinkRef {
  return { id, collection: props.collection }
}

// --- drop indicators --------------------------------------------------------
function ts(id: number) {
  return targetState(props.collection, id)
}
function showLine(id: number, side: 'above' | 'below') {
  const t = ts(id)
  return t.active && t.mode === 'reorder' && t.side === side
}
function nestStyle(id: number) {
  const t = ts(id)
  if (!t.active || t.mode !== 'nest') return {}
  const col = t.valid ? c.value.accent : DANGER
  return {
    outline: '2px solid ' + col,
    outlineOffset: '1px',
    background: t.valid
      ? 'color-mix(in srgb, ' + c.value.accent + ' 14%, transparent)'
      : 'transparent',
    animation: t.valid ? 'none' : 'shake .4s',
  }
}
function selectedStyle(id: number) {
  const detailSelected = props.selectable && props.selectedId === id
  const bulkSelected = props.selectionMode && selectedSet.value.has(id)
  if (!detailSelected && !bulkSelected) return {}
  // Border + tint rather than an outline: an outline cannot transition, so it
  // popped in; these two glide with the row's own transition.
  return {
    borderColor: c.value.accent,
    backgroundColor: 'color-mix(in srgb, ' + c.value.accent + ' 8%, ' + c.value.card + ')',
    boxShadow: 'inset 3px 0 0 ' + c.value.accent,
  }
}
function selectedBadgeStyle(id: number) {
  return props.selectionMode && selectedSet.value.has(id)
    ? pxify({
        ...typeStep('2xs'),
        color: c.value.accent,
        padding: '1px 7px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid ' + c.value.accent,
        background: 'color-mix(in srgb, ' + c.value.accent + ' 10%, transparent)',
        flexShrink: 0,
      })
    : {}
}
function sourceStyle(id: number) {
  if (!isSource(props.collection, id)) return {}
  return {
    opacity: 0.6,
    transform: 'scale(1.02)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.4)',
    zIndex: 5,
  }
}
const root = computed(() => rootState(props.collection))
function toggleSelect(id: number) {
  emit('toggleSelect', id)
}

// --- styles -----------------------------------------------------------------
const wrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  position: 'relative',
})
function nodeWrap(depth: number) {
  return pxify({ paddingLeft: depth * INDENT_PX, display: 'flex', flexDirection: 'column' })
}
const barWrap = pxify({ position: 'relative' })
const rowStyle = computed(() =>
  merge(rowBase(c.value), { cursor: 'pointer', position: 'relative' }),
)
function textStyle(id: number) {
  // Todos draw their own strike (the animated line in the stylesheet); the
  // text-decoration would appear at once, ahead of it.
  return pxify({
    ...typeStep('base'),
    fontWeight: isTasks.value ? undefined : 'var(--weight-medium)',
    color: c.value.text,
    lineHeight: 1.3,
    ...(isTasks.value ? doneText(done(id)) : {}),
  })
}
const monoCount = computed(() =>
  pxify({
    ...typeStep('xs'),
    color: c.value.dim,
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  }),
)
const swipeClip = pxify({ position: 'relative', overflow: 'hidden', borderRadius: 16 })
// Compact rows: title and chips share one line, the description is a single
// truncated line under it (full text on hover and in the detail pane).
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
const mainTight = pxify({ gap: 2 })
const titleLine = pxify({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: 'var(--sp-2)',
  rowGap: 2,
  minWidth: 0,
})
// Nested rows carry an accent rail on their left edge, so a subtask's level
// reads at a glance even several levels deep.
function depthRail(depth: number) {
  if (depth === 0) return {}
  return {
    borderLeft: '3px solid color-mix(in srgb, ' + c.value.accent + ' 45%, transparent)',
  }
}
// The expand button is only the hit target; the arrow is Caret (medium, 26px
// box), the same disclosure used by every accordion and detail section.
const chevronBtn = pxify({
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
})
// Same width as the Caret box, so rows with and without children line up.
const chevronSpacer = pxify({ width: 26, flexShrink: 0 })
const countChip = computed(() =>
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
const dueChipStyle = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim }))
// Goal-attachment chip (task 8): a subtle accent-outlined pill on rows that
// belong to one or more goals, so attachment is visible from the Tasks/Todos tab.
const goalChip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    color: c.value.accent,
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    background: 'transparent',
    border: '1px solid ' + c.value.accent,
    flexShrink: 0,
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const conflictBadge = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 'var(--radius-control)',
    color: WARNING,
    border: '1px solid ' + WARNING,
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  }),
)
const progressWrap = pxify({ padding: '4px 4px 0' })
const addSubBtn = computed(() =>
  pxify({
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 'var(--radius-control)',
    border: '1px solid transparent',
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    transition: 'background .2s ease, color .2s ease, border-color .2s ease',
  }),
)
const subForm = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  padding: '6px 0 2px ' + INDENT_PX + 'px',
})
const subInput = pxify({ flex: 1, minWidth: 0 })
const subSubmit = computed(() =>
  pxify({
    ...typeStep('sm'),
    flexShrink: 0,
    padding: '0 14px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.accent,
    background: 'transparent',
    color: c.value.accent,
    cursor: 'pointer',
  }),
)
const breadcrumbStyle = computed(() =>
  pxify({ ...typeStep('2xs'), color: c.value.dim, padding: '2px 0 2px 26px' }),
)
const linkBody = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    padding: '6px 4px 2px 26px',
  }),
)
const rootStripStyle = computed(() =>
  pxify({
    marginTop: 6,
    padding: '12px',
    borderRadius: 'var(--radius-card)',
    border: '1.5px dashed ' + (root.value.active ? c.value.accent : c.value.border),
    background: root.value.active
      ? 'color-mix(in srgb, ' + c.value.accent + ' 12%, transparent)'
      : 'transparent',
    color: root.value.active ? c.value.accent : c.value.dim,
    ...typeStep('xs'),
    textAlign: 'center',
    letterSpacing: '0.04em',
    transition: 'border-color .15s ease, background .15s ease, color .15s ease',
  }),
)
</script>

<template>
  <TransitionGroup name="rowflip" tag="div" :style="wrap">
    <div v-for="row in rows" :key="row.id" :style="nodeWrap(row.depth)">
      <div :style="swipeRows ? swipeClip : barWrap">
        <!-- Behind the row on a phone: revealed by dragging the row left. -->
        <div v-if="swipeRows && swipeOffset(row.id) < 0" class="swipe-actions">
          <button type="button" class="swipe-act swipe-act--remind" @click="swipeRemind(row.id)">
            <Icon name="bell" size="md" />Remind
          </button>
          <button type="button" class="swipe-act swipe-act--delete" @click="swipeDelete(row.id)">
            <Icon name="trash" size="md" />Delete
          </button>
        </div>
        <TreeDropLine
          v-if="showLine(row.id, 'above')"
          side="above"
          :indent-depth="ts(row.id).indentDepth"
          :valid="ts(row.id).valid"
          :base-inset="-row.depth * INDENT_PX"
        />
        <div
          class="tree-row"
          :style="[
            rowStyle,
            depthRail(row.depth),
            selectedStyle(row.id),
            nestStyle(row.id),
            sourceStyle(row.id),
            swipeStyle(row.id),
          ]"
          v-hover-style="swipeRows ? {} : s.rowHover"
          :data-tree-collection="collection"
          :data-tree-id="row.id"
          :data-tree-depth="row.depth"
          :data-tree-parent="row.parentId ?? ''"
          :aria-selected="selectionMode ? selectedSet.has(row.id) : undefined"
          @pointerdown.capture="onRowCardPointerDown"
          @click.capture="onRowCardClick($event, row.id)"
          @pointerdown="swDown($event, row.id)"
          @pointermove="swMove"
          @pointerup="swUp"
          @pointercancel="swUp"
        >
          <template v-if="swipeRows"></template>
          <button
            v-else-if="hasKids(row.id)"
            type="button"
            :style="chevronBtn"
            :aria-label="expanded(row.id) ? 'Collapse' : 'Expand'"
            :aria-expanded="expanded(row.id)"
            @pointerdown="expandTap.onPointerDown"
            @pointercancel="expandTap.onPointerCancel"
            @click.stop="(e: MouseEvent) => onExpandClick(e, row.id)"
          >
            <Caret :open="expanded(row.id)" />
          </button>
          <span v-else :style="chevronSpacer"></span>

          <TreeDragHandle
            v-if="!swipeRows"
            :collection="collection"
            :id="row.id"
            :title="title(row.id)"
          />

          <StatusPill v-if="isTasks" :status="statusOf(row.id)" @cycle="cycleStatus(row.id)" />
          <!-- Todos (Todo v2, 4b): the checkbox wears its subtask progress. -->
          <RingCheck
            v-else
            :done="done(row.id)"
            :sub-done="progress(row.id).done"
            :sub-total="progress(row.id).total"
            :surface="swipeRows ? c.bgSolid : c.card"
            @toggle="toggleDone(row.id)"
          />

          <div
            :style="[s.taskMain, mainTight]"
            @pointerdown="onRowPointerDown($event, row.id)"
            @pointercancel="tap.onPointerCancel"
            @click="onMainClick"
          >
            <div :style="titleLine">
              <span v-if="isTasks" :style="textStyle(row.id)"
                ><TitleTagPill v-if="tagOf(row.id)" :tag="tagOf(row.id)" />{{ title(row.id) }}</span
              >
              <span
                v-else
                class="todo-title"
                :class="{ 'is-done': done(row.id) }"
                :style="textStyle(row.id)"
                ><TitleTagPill v-if="tagOf(row.id)" :tag="tagOf(row.id)" /><span class="strike">{{
                  title(row.id)
                }}</span></span
              >
              <div :style="s.chipRow">
                <span v-if="dueLabel(row.id)" :style="dueChipStyle"
                  >due {{ dueLabel(row.id) }}</span
                >
                <IssueChip v-if="issueLinkOf(row.id)" :link="issueLinkOf(row.id)!" compact />
                <button
                  v-for="g in goalsOf(row.id)"
                  :key="g.id"
                  type="button"
                  :style="goalChip"
                  title="Open this goal"
                  @click.stop="openGoal(g.id)"
                >
                  ◎ {{ g.label }}
                </button>
                <span v-if="isTasks" :style="countChip" title="Subtasks done / total"
                  >☑ {{ progress(row.id).done }}/{{ progress(row.id).total }}</span
                >
                <span
                  v-else-if="progress(row.id).total"
                  :style="monoCount"
                  title="Subtasks done / total"
                  >{{ progress(row.id).done }}/{{ progress(row.id).total }}</span
                >
                <span
                  v-if="selectionMode && selectedSet.has(row.id)"
                  :style="selectedBadgeStyle(row.id)"
                >
                  Selected
                </span>
              </div>
            </div>
            <span
              v-if="desc(row.id) && !swipeRows"
              :class="{ 'todo-desc': !isTasks, 'is-done': done(row.id) }"
              :style="descStyle"
              :title="desc(row.id)"
              >{{ desc(row.id) }}</span
            >
            <OfflineChip :pending="app.isItemPending(itemType(), row.id)" />
          </div>

          <span
            v-if="conflicted(row.id)"
            :style="conflictBadge"
            title="A newer version arrived while you were editing"
            @click.stop="dismissConflict(row.id)"
            >remote ✕</span
          >
          <!-- Todos on a phone: no inline actions, they are behind the row. -->
          <Icon v-if="swipeRows" name="chevron-right" size="sm" :style="{ color: c.dim }" />
          <!-- Todos (Todo v2): focus, remind, delete. Adding a subtask and the
               status cycle live in the details pane. -->
          <template v-else-if="!isTasks">
            <button
              type="button"
              class="row-act"
              title="Focus on the next subtask"
              aria-label="Focus on the next subtask"
              @pointerdown.stop
              @click.stop="focusOn(row.id)"
            >
              <Icon name="timer" size="sm" />
            </button>
            <RemindBell :collection="collection" :id="row.id" />
            <button
              type="button"
              class="row-act row-act--danger"
              title="Delete"
              aria-label="Delete todo"
              @pointerdown.stop
              @click.stop="del(row.id)"
            >
              <Icon name="x" size="sm" />
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="tree-row__quiet"
              :style="addSubBtn"
              v-hover-style="s.toolBtnHover"
              :aria-label="'Add a subtask to this ' + itemType()"
              :title="'Add a subtask to this ' + itemType()"
              @pointerdown.stop
              @click.stop="startAddSub(row.id)"
            >
              <Icon name="plus" size="xs" />
            </button>
            <RemindBell :collection="collection" :id="row.id" />
            <button :style="s.shareBtn" @click.stop="app.share('task', nodeOf(row.id)!)">↗</button>
            <button :style="s.del" @click.stop="del(row.id)">×</button>
          </template>
        </div>
        <TreeDropLine
          v-if="showLine(row.id, 'below')"
          side="below"
          :indent-depth="ts(row.id).indentDepth"
          :valid="ts(row.id).valid"
          :base-inset="-row.depth * INDENT_PX"
        />
      </div>

      <form v-if="addingUnder === row.id" :style="subForm" @submit.prevent="submitAddSub">
        <TextInput
          v-model="subDraft"
          v-focus
          size="sm"
          :style="subInput"
          aria-label="New subtask"
          :placeholder="'New subtask under “' + title(row.id) + '” — Enter to add, Esc to close'"
          @keydown.esc="cancelAddSub"
          @blur="onSubBlur"
        />
        <button type="submit" :style="subSubmit" @mousedown.prevent>Add</button>
      </form>

      <div v-if="hasKids(row.id) && expanded(row.id) && !swipeRows" :style="progressWrap">
        <ProgressBar :value="progress(row.id).done" :max="progress(row.id).total" size="sm" />
      </div>

      <!-- Cross-collection linked items (kept from the old list rows). -->
      <span v-if="breadcrumb(row.id)" :style="breadcrumbStyle">
        part of ‹{{ breadcrumb(row.id) }}›
      </span>
      <div v-if="linkedOf(row.id).length && linksExpanded(row.id)" :style="linkBody">
        <LinkedAccordion
          v-for="ch in linkedOf(row.id)"
          :key="ch.collection + ':' + ch.id"
          :item-ref="ch"
          :parent-ref="selfRef(row.id)"
          :depth="0"
          :is-root="false"
        />
      </div>
    </div>
  </TransitionGroup>

  <!-- Root drop strip: only present while dragging this collection. -->
  <div v-if="root.dragging" :data-tree-root="collection" :style="rootStripStyle">
    Drop here to make a top-level {{ isTasks ? 'task' : 'todo' }}
  </div>

  <div :style="srOnly" role="status" aria-live="assertive">{{ liveMsg }}</div>
</template>

<style scoped>
.tree-row__quiet {
  opacity: 0.58;
}
/* Todo v2 row actions: 32px squares, quiet until hovered. */
.row-act {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}
.row-act:hover {
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
}
.row-act--danger:hover {
  background: color-mix(in srgb, var(--theme-danger) 12%, transparent);
  color: var(--theme-danger);
}
/* Completion (Todo v2, 4a): after the checkbox pops, a line draws across the
   title from the left, then the row's text fades. */
.todo-title .strike {
  position: relative;
}
.todo-title .strike::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 52%;
  height: 1.5px;
  background: currentColor;
  opacity: 0.7;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.35s ease 0.1s;
}
.todo-title.is-done .strike::after {
  transform: scaleX(1);
}
.todo-title,
.todo-desc {
  transition: opacity 0.4s ease 0.25s;
}
.todo-title.is-done,
.todo-desc.is-done {
  opacity: 0.55;
}
/* Behind a phone row: Remind and Delete, 72px each. */
.swipe-actions {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  z-index: 0;
}
.swipe-act {
  width: 72px;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: var(--text-xs);
  color: var(--theme-on-accent);
  cursor: pointer;
}
/* Mixed into the solid ground, not the card: the card is glass, and a
   translucent button behind a moving row reads as a hole. */
.swipe-act--remind {
  background: color-mix(in srgb, var(--theme-accent) 45%, var(--glass-solid));
  color: var(--theme-text);
}
.swipe-act--delete {
  background: var(--theme-danger);
}
@media (prefers-reduced-motion: reduce) {
  .row-act,
  .todo-title,
  .todo-desc,
  .todo-title .strike::after {
    transition: none;
  }
}
.tree-row:hover .tree-row__quiet,
.tree-row:focus-within .tree-row__quiet {
  opacity: 1;
}
</style>

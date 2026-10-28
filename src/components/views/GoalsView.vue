<script setup lang="ts">
// Goals tab (task 8). A goal is a container above tasks/todos: it owns a
// checklist and can have existing tasks/todos attached by reference. This view is
// the list (card grid / mobile list) with status filter, sort, and grip-drag
// reorder. On desktop the selected goal's details show in the right-hand pane,
// which is a column of this tab by default and a floating drawer over it on
// request — one setting, three steps, cycled from the pane's own header
// (DetailPane). On mobile a card opens the goal dialog. The wide page
// (GoalDetail) still opens in place.
import { computed, defineAsyncComponent, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { debounce } from '@/utils/syncGuard'
import { daysRemaining } from '@/utils/detailFields'
import { matchesTagFilter } from '@/utils/tagFilter'
import GoalsToolbar from '@/components/goals/GoalsToolbar.vue'
// The wide page is heavy (the metric chart, a TreeList per attachment) and is
// rendered only once a goal is opened on it, so it stays off the grid's first
// paint (section 19d).
const GoalDetail = defineAsyncComponent(() => import('@/components/GoalDetail.vue'))
import GoalSideDetail from '@/components/GoalSideDetail.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import GoalsEmptyState from '@/components/GoalsEmptyState.vue'
import GoalCreateSlideOver from '@/components/GoalCreateSlideOver.vue'
import GoalCard from '@/components/goals/GoalCard.vue'
import GoalsSummary from '@/components/goals/GoalsSummary.vue'
import GoalCardSkeleton from '@/components/goals/GoalCardSkeleton.vue'
import GoalGrid from '@/components/goals/GoalGrid.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Accordion from '@/components/ui/Accordion.vue'
import SkillGoalSection from '@/components/goals/SkillGoalSection.vue'
import SkillGoalDialog from '@/components/goals/SkillGoalDialog.vue'
import { deadlineFrom } from '@/utils/milestoneProgress'
import QuickAdd from '@/components/todo/QuickAdd.vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { todayKey } from '@/utils/rollover'
import Icon from '@/components/ui/Icon.vue'
import { useTapOpen } from '@/composables/useTapOpen'
import { downloadText } from '@/utils/noteExport'
import { usePaneInset } from '@/composables/usePaneInset'
import type { Goal, GoalStatus } from '@/types'
import type { MenuItem } from '@/components/ui/Dropdown.vue'

const app = useAppStore()
const ui = useUiStore()
const router = useRouter()
const { s, c, isMobile, panelStyle } = useStyles()
const { goals } = storeToRefs(app)

// The selected goal lives in the store, so /goals/:goalId can open it on a cold
// load and the dialog's "Open full page" can hand a goal over to this view.
const selectedId = computed({
  get: () => app.goalPageId,
  set: (value: number | null) => (value == null ? app.closeGoalPage() : app.openGoalPage(value)),
})
// The goal shown in the right-hand pane (desktop). Separate from the wide page.
const panelGoalId = ref<number | null>(null)
const panelGoalExists = computed(
  () => panelGoalId.value != null && goals.value.some((g) => g.id === panelGoalId.value),
)
// Which shape the pane is in. `inline` is a second grid column and the cards
// give it half the tab; the drawer modes float over the tab instead, and the
// grid narrows by however much the drawer covers so the toolbar's New and
// Import buttons never end up behind it. The width comes from the pane itself,
// so compact, large and a dragged edge all make the right amount of room.
const splitView = computed(() => !isMobile.value && app.paneMode === 'inline')
const paneOpen = computed(() => !isMobile.value && !splitView.value && panelGoalExists.value)
const paneWidth = ref(0)
const { host: paneHost, style: paneInset } = usePaneInset(paneOpen, paneWidth)
const statusFilter = ref<GoalStatus | 'all'>('all')
// '' = every tag. Kept for the session only: a filter that silently survives a
// reload is a list that looks like it lost its goals.
const tagFilter = ref('')
const sortKey = ref<'order' | 'target' | 'progress'>('order')

// Search is debounced (section 19d): `search` is what the field shows, `query`
// is what the list filters by. Filtering a few hundred cards on every keystroke
// is what made typing here feel heavy.
const SEARCH_DEBOUNCE_MS = 200
const search = ref('')
const query = ref('')
const searchWriter = debounce(() => {
  query.value = search.value
}, SEARCH_DEBOUNCE_MS)
function onSearch(value: string) {
  search.value = value
  searchWriter.schedule()
}
// Enter submits immediately rather than waiting out the debounce.
function onSearchSubmit() {
  searchWriter.flush()
  query.value = search.value
}
onBeforeUnmount(() => searchWriter.cancel())

// The workspace arrives as one document, so "loading" is simply "not here yet"
// — one read for the whole page, however many goals it holds (acceptance 94).
// Guarded by the goal count as well, so a local-only or offline session with
// data in hand shows that data rather than skeletons forever.
const loading = computed(() => !app.cloudReady && goals.value.length === 0)
// Enough to fill the fold without promising rows that may not exist.
const SKELETON_COUNT = 6

// "/n" lands in quick add with its details open, as it does on Todos; the
// slide-over (points, a metric, pasted JSON) stays behind "New milestone".
const quickAdd = ref<InstanceType<typeof QuickAdd> | null>(null)
function focusQuickAdd() {
  if (quickAdd.value) quickAdd.value.focus(true)
  else onNew()
}
defineExpose({ focus: focusQuickAdd })
// A quick-added milestone opens beside the list, ready for its points.
function onQuickAdded(goalId: number) {
  if (!isMobile.value) panelGoalId.value = goalId
}

// Manual create now opens the slide-over (task 12c) rather than dropping a bare
// "New goal" into the list.
const showCreate = ref(false)
function onNew() {
  showCreate.value = true
}
function onCreated(goalId: number) {
  showCreate.value = false
  if (isMobile.value) selectedId.value = goalId
  else panelGoalId.value = goalId
}
// Desktop: a card selects the goal into the right-hand pane. Mobile: a card
// opens the goal dialog (acceptance 89); the wide page is reached from the
// dialog's footer, or by loading /goals/:goalId directly.
function openGoal(goalId: number) {
  if (!isMobile.value) {
    panelGoalId.value = goalId
    return
  }
  app.openGoalDialog(
    goalId,
    rows.value.map((r) => r.goal.id),
  )
}
// The goals, milestones, points and subtasks as one Learning & Goals document.
function exportLearning() {
  downloadText(app.exportLearningDoc(), 'learningandgoals.json', 'application/json')
}
function goImport() {
  app.openGoalImport()
}

// The one automatic open (section 23). Watched rather than done on mount: the
// workspace arrives after the first paint, and the seen flag comes with it —
// checking before it lands would open the panel for everybody, every load. The
// store owns the decision so the guards are testable.
watch(
  () => [app.cloudReady, goals.value.length] as const,
  () => app.maybeAutoOpenGoalHelp(),
  { immediate: true },
)

// The whole card is the open target, so it has to distinguish a tap from the
// press-and-hold that starts a reorder drag (section 18b) — otherwise every
// drag ends with a dialog open over the list it was dropped into.
const pressedCard = ref<number | null>(null)
const tap = useTapOpen((event) => {
  const goalId = pressedCard.value
  pressedCard.value = null
  if (goalId == null) return
  // While selecting, a tap picks rather than opens; outside it, Ctrl/⌘-click
  // or Shift-click starts a selection the way a file list does.
  if (selecting.value || event.ctrlKey || event.metaKey || event.shiftKey) {
    pickCard(goalId, event.shiftKey)
    return
  }
  openGoal(goalId)
})
function onCardPointerDown(event: PointerEvent, goalId: number) {
  pressedCard.value = goalId
  tap.onPointerDown(event)
}

// The card's own actions. Everything here stops the click from reaching the
// card, so none of it opens the dialog.
// Per card: a goal already moved to Todos or Tasks offers the way there
// instead of a second move.
// Each with a glyph, so the menu scans by shape; Delete in the danger colour.
function cardMenu(goalId: number): MenuItem[] {
  const moved = app.goalMovedTo(goalId)
  return [
    CARD_MENU[0],
    ...(moved
      ? [
          {
            value: 'open-moved',
            label: moved.collection === 'tasks' ? 'In Tasks · Open' : 'In Todos · Open',
            icon: moved.collection === 'tasks' ? ('list' as const) : ('check-square' as const),
          },
        ]
      : [
          { value: 'to-todos', label: 'Move to Todos', icon: 'check-square' as const },
          { value: 'to-tasks', label: 'Move to Tasks', icon: 'list' as const },
        ]),
    ...CARD_MENU.slice(1),
  ]
}
const CARD_MENU: MenuItem[] = [
  { value: 'open', label: 'Open full page', icon: 'external-link' },
  { value: 'select', label: 'Select', icon: 'list-checks' },
  { value: 'duplicate', label: 'Duplicate', icon: 'copy' },
  { value: 'archive', label: 'Archive', icon: 'archive' },
  { value: 'delete', label: 'Delete', icon: 'trash', danger: true },
]
function onCardMenu(goalId: number, action: string) {
  if (action === 'open') router.push(`/goals/${goalId}`)
  else if (action === 'open-moved') {
    const m = app.goalMovedTo(goalId)
    if (m) ui.setTab(m.collection === 'tasks' ? 'tasks' : 'todo')
  } else if (action === 'to-todos') app.moveGoalTo('todos', goalId)
  else if (action === 'to-tasks') app.moveGoalTo('tasks', goalId)
  else if (action === 'select') pickCard(goalId)
  else if (action === 'duplicate') app.duplicateGoal(goalId)
  else if (action === 'archive') app.archiveGoal(goalId)
  else if (action === 'delete') app.removeGoalWithUndo(goalId)
}

// Keyboard: `g` then `n` opens New goal while the Goals tab is focused (task 12d).
// While selecting: Delete removes the picks, Ctrl/⌘+A takes every visible card,
// Escape ends the selection.
let gPressedAt = 0
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  if (typing) return
  if (selecting.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      endSelection()
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && pickedIds.value.length) {
      e.preventDefault()
      deletePicked()
      return
    }
    if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      picked.value = new Set(visibleIds.value)
      return
    }
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'g') {
    gPressedAt = Date.now()
    return
  }
  if (e.key === 'n' && Date.now() - gPressedAt < 800 && selectedId.value == null) {
    e.preventDefault()
    onNew()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// The days-left chip is the same one the goal dialog shows (section 18d), so a
// goal reads the same wherever it appears.
const daysChip = (target: string) => daysRemaining(target)

interface GoalRow {
  goal: Goal
  ratio: number
  counts: { checklist: number; tasks: number; todos: number }
}
// The status filter first, on its own, because the tag filter's counts are
// taken from it: "Work · 3" should mean three of the goals this status shows.
const byStatus = computed(() =>
  // Archived goals are hidden unless explicitly filtered to.
  statusFilter.value === 'all'
    ? goals.value.filter((g) => g.status !== 'archived')
    : goals.value.filter((g) => g.status === statusFilter.value),
)
const tagGroups = computed(() => byStatus.value.map((g) => [g.tag]))

const rows = computed<GoalRow[]>(() => {
  let list = byStatus.value
  if (tagFilter.value) list = list.filter((g) => matchesTagFilter([g.tag], tagFilter.value))

  // Free-text search over title + description.
  const q = query.value.trim().toLowerCase()
  if (q)
    list = list.filter(
      (g) => g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q),
    )

  const mapped = list.map((goal) => ({
    goal,
    ratio: app.goalProgress(goal.id).ratio,
    counts: app.goalCounts(goal.id),
  }))
  mapped.sort((a, b) => {
    if (sortKey.value === 'progress') return b.ratio - a.ratio
    if (sortKey.value === 'target') {
      if (a.goal.targetDate && b.goal.targetDate)
        return a.goal.targetDate < b.goal.targetDate ? -1 : 1
      if (a.goal.targetDate) return -1
      if (b.goal.targetDate) return 1
      return a.goal.order - b.goal.order
    }
    return a.goal.order - b.goal.order
  })
  return mapped
})

// --- sections -----------------------------------------------------------------
// "Active & open" reads as Todos does: collapsible groups with a count, the
// ones that need attention first and Completed folded away. A single-status
// filter is already one group, so it stays one flat grid.
//
// Grouped by goal (the default once goals exist), each goal is a section with
// its own progress, its milestones in timeline order, and a "No goal" section
// last for the rest (spec 3.1–3.2).
interface Section {
  key: string
  label: string
  items: Goal[]
  /** Set for a goal section; null for "No goal". */
  goalId?: number | null
}
const acc = useAccordionState()
const groupChoice = ref<'status' | 'goal' | null>(null)
const groupBy = computed(() => groupChoice.value ?? (app.skillGoals.length ? 'goal' : 'status'))
const grouped = computed(() => groupBy.value === 'goal' || statusFilter.value === 'all')
const filtering = computed(
  () => statusFilter.value !== 'all' || !!tagFilter.value || !!query.value.trim(),
)
// Milestones in the order they happen: by start (or deadline), then by hand.
const byTimeline = (a: Goal, b: Goal) =>
  (a.startDate || a.targetDate || '~').localeCompare(b.startDate || b.targetDate || '~') ||
  a.order - b.order
const sections = computed<Section[]>(() => {
  const list = rows.value.map((r) => r.goal)
  if (groupBy.value === 'goal') {
    const ordered = (items: Goal[]) =>
      sortKey.value === 'order' ? items.slice().sort(byTimeline) : items
    const out: Section[] = app.skillGoals
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((sg) => ({
        key: 'goal:' + sg.id,
        label: sg.title,
        goalId: sg.id,
        items: ordered(list.filter((m) => m.skillGoalId === sg.id)),
      }))
      // A goal with nothing matching a filter is noise; unfiltered, an empty
      // goal stays so its first milestone can be added.
      .filter((sec) => sec.items.length || !filtering.value)
    const loose = list.filter((m) => m.skillGoalId == null || !app.skillGoalById(m.skillGoalId))
    if (loose.length) out.push({ key: 'goal:none', label: 'No goal', goalId: null, items: loose })
    return out
  }
  if (!grouped.value) return [{ key: 'all', label: '', items: list }]
  const today = todayKey()
  const overdue = (g: Goal) => g.status === 'active' && !!g.targetDate && g.targetDate < today
  const out: Section[] = [
    { key: 'overdue', label: 'Overdue', items: list.filter(overdue) },
    {
      key: 'active',
      label: 'In progress',
      items: list.filter((g) => g.status === 'active' && !overdue(g)),
    },
    { key: 'paused', label: 'Paused', items: list.filter((g) => g.status === 'paused') },
    { key: 'done', label: 'Completed', items: list.filter((g) => g.status === 'done') },
  ]
  return out.filter((sec) => sec.items.length)
})
// Remembered per group, like every list accordion; Completed starts folded.
const sectionKey = (key: string) => 'milestones:' + key
const sectionOpen = (key: string) => acc.isOpen(sectionKey(key), key !== 'done')
function setSection(key: string, open: boolean) {
  acc.set(sectionKey(key), open)
}
// What each section's wrapper is given: a goal section, a status accordion, or
// the plain box around a flat grid.
function sectionProps(sec: Section) {
  if (sec.goalId !== undefined) return { goalId: sec.goalId, count: sec.items.length }
  if (grouped.value)
    return { title: `${sec.label} · ${sec.items.length}`, open: sectionOpen(sec.key) }
  return { class: 'gv-flat' }
}
const sectionIs = (sec: Section) =>
  sec.goalId !== undefined ? SkillGoalSection : grouped.value ? Accordion : 'div'

// --- goals ---------------------------------------------------------------------
const goalDialog = ref<{ open: boolean; id: number | null }>({ open: false, id: null })
function newSkillGoal() {
  goalDialog.value = { open: true, id: null }
}
function editSkillGoal(id: number) {
  goalDialog.value = { open: true, id }
}
// A new milestone in a goal starts the day after the goal's last deadline (or
// on the goal's start), so a timeline builds itself in order.
function addMilestoneTo(sgid: number) {
  const members = app.milestonesOfSkillGoal(sgid)
  const last = members
    .map((m) => m.targetDate)
    .filter(Boolean)
    .sort()
    .pop()
  const startDate = last ? deadlineFrom(last, 2) : (app.skillGoalById(sgid)?.startDate ?? '')
  const gid = app.addGoal({ title: 'New milestone', skillGoalId: sgid, startDate })
  openGoal(gid)
}

// --- multi-select ------------------------------------------------------------
// Select (or Ctrl/⌘-click a card) turns the grid into a pick list: a tap
// toggles, Shift-click takes the range from the last pick, and the bar above
// the grid deletes the lot with one Undo for all of them.
const selecting = ref(false)
const picked = ref<Set<number>>(new Set())
let anchorId: number | null = null
// In the order they are drawn, so a Shift-range follows what the eye sees.
const visibleIds = computed(() => sections.value.flatMap((sec) => sec.items.map((g) => g.id)))
const pickedIds = computed(() => visibleIds.value.filter((id) => picked.value.has(id)))
const allPicked = computed(
  () => visibleIds.value.length > 0 && pickedIds.value.length === visibleIds.value.length,
)
// A filter or a delete that hides a picked card drops it from the selection, so
// Delete never removes something the reader cannot see.
watch(visibleIds, (ids) => {
  const keep = new Set(ids)
  const next = [...picked.value].filter((id) => keep.has(id))
  if (next.length !== picked.value.size) picked.value = new Set(next)
})
function pickCard(goalId: number, range = false) {
  selecting.value = true
  const next = new Set(picked.value)
  if (range && anchorId != null) {
    const ids = visibleIds.value
    const a = ids.indexOf(anchorId)
    const b = ids.indexOf(goalId)
    if (a !== -1 && b !== -1) {
      for (const id of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(id)
      picked.value = next
      return
    }
  }
  if (!next.delete(goalId)) next.add(goalId)
  anchorId = goalId
  picked.value = next
}
function toggleAll() {
  picked.value = allPicked.value ? new Set() : new Set(visibleIds.value)
}
function endSelection() {
  selecting.value = false
  picked.value = new Set()
  anchorId = null
}
function deletePicked() {
  const ids = pickedIds.value
  if (!ids.length) return
  if (panelGoalId.value != null && ids.includes(panelGoalId.value)) panelGoalId.value = null
  app.removeGoalsWithUndo(ids)
  endSelection()
}

// --- grip-drag reorder (native DnD; writes fractional order via moveGoal) ----
const dragId = ref<number | null>(null)
function onDragStart(e: DragEvent, id: number) {
  dragId.value = id
  try {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', String(id))
  } catch {
    /* ignore */
  }
}
function onDragOver(e: DragEvent) {
  if (dragId.value != null) e.preventDefault()
}
function onDropOn(index: number) {
  if (dragId.value != null && sortKey.value === 'order') app.moveGoal(dragId.value, index)
  dragId.value = null
}

// --- styles ------------------------------------------------------------------
const grid = computed(() =>
  pxify({
    display: 'grid',
    // Wider minimum than before: five narrow columns wrapped every title to
    // four lines. Capped at four columns so an ultrawide screen does not turn
    // the grid into a wall of thumbnails.
    gridTemplateColumns: isMobile.value ? '1fr' : 'repeat(auto-fill, minmax(300px, min(1fr, 25%)))',
    // Every card in a row gets the tallest card's height, so the row is level.
    gridAutoRows: 'minmax(180px, 1fr)',
    gap: 'var(--sp-4)',
    padding: '2px',
    overflowY: 'auto',
    alignContent: 'start',
  }),
)
// Two columns while the pane is inline; the grid alone once it floats.
const splitLayout = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
const listColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
// The "/n" hint under the list, as Todos shows it.
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

// The card's position in the filtered list, for a drop that lands on it.
function indexOf(goalId: number): number {
  return rows.value.findIndex((r) => r.goal.id === goalId)
}
// The selected goal is drawn by the card itself, the way a selected todo or
// task row is; the cell only dims the one being dragged.
function cellStyle(id: number) {
  return pxify({
    minWidth: 0,
    opacity: dragId.value === id ? 0.5 : 1,
    borderRadius: 18,
  })
}
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <GoalDetail v-if="selectedId != null" :goal-id="selectedId" @back="selectedId = null" />

    <template v-else>
      <GoalsToolbar
        :search="search"
        :status="statusFilter"
        :tag="tagFilter"
        :tag-groups="tagGroups"
        :sort="sortKey"
        :mobile="isMobile"
        :show-filters="goals.length > 0"
        @update:search="onSearch"
        @submit-search="onSearchSubmit"
        @update:status="statusFilter = $event"
        @update:tag="tagFilter = $event"
        @update:sort="sortKey = $event"
        :selecting="selecting"
        @select="selecting ? endSelection() : (selecting = true)"
        :can-export="app.skillGoals.length > 0"
        :group="groupBy"
        @update:group="groupChoice = $event"
        @new-goal="newSkillGoal"
        @import="goImport"
        @export="exportLearning"
        @new="onNew"
        @help="app.openGoalHelp()"
      />

      <!-- The whole set at a glance, before any one card is read. -->
      <GoalsSummary
        v-if="!loading && goals.length"
        :status="statusFilter"
        @filter="statusFilter = $event"
      />

      <div :style="splitView ? splitLayout : listColumn">
        <div :style="listColumn">
          <QuickAdd
            v-if="!loading && goals.length"
            ref="quickAdd"
            collection="goals"
            :compact="isMobile"
            @added="onQuickAdded"
          />

          <!-- The selection's own bar: what is picked and what can be done to it. -->
          <div v-if="selecting" class="gv-bulk" role="toolbar" aria-label="Selected milestones">
            <Checkbox
              :model-value="allPicked"
              :indeterminate="pickedIds.length > 0 && !allPicked"
              aria-label="Select all milestones"
              @update:model-value="toggleAll"
            />
            <span class="gv-bulk__count">
              {{ pickedIds.length ? `${pickedIds.length} selected` : 'Tap milestones to select' }}
            </span>
            <span class="gv-bulk__hint"
              >Shift-click for a range · Del to delete · Esc to finish</span
            >
            <button
              type="button"
              class="gv-bulk__btn gv-bulk__btn--danger"
              :disabled="!pickedIds.length"
              @click="deletePicked"
            >
              <Icon name="trash" size="xs" />
              Delete{{ pickedIds.length ? ` ${pickedIds.length}` : '' }}
            </button>
            <button type="button" class="gv-bulk__btn" @click="endSelection">Done</button>
          </div>

          <!-- Skeletons while the workspace is still arriving. Same box model as
               the real card, so the swap moves nothing (acceptance 95). First,
               because "nothing here" and "not here yet" are different answers. -->
          <div v-if="loading" :style="grid" aria-busy="true" aria-label="Loading milestones">
            <GoalCardSkeleton v-for="n in SKELETON_COUNT" :key="n" />
          </div>

          <GoalsEmptyState
            v-else-if="goals.length === 0"
            @new="onNew"
            @paste-json="goImport"
            @import-link="goImport"
          />
          <div v-else-if="rows.length === 0" :style="s.empty">No milestones match this filter.</div>

          <!-- Grouped: one accordion per group, the page scrolling them all.
               Flat: one grid that scrolls (and virtualises) itself. One column
               while the pane is beside it; the whole tab once it floats. -->
          <div v-else class="gv-sections" :class="{ 'is-grouped': grouped }">
            <component
              :is="sectionIs(sec)"
              v-for="sec in sections"
              :key="sec.key"
              v-bind="sectionProps(sec)"
              :class="grouped && `gv-group gv-group--${sec.key}`"
              @toggle="setSection(sec.key, $event)"
              @edit="sec.goalId != null && editSkillGoal(sec.goalId)"
              @add-milestone="sec.goalId != null && addMilestoneTo(sec.goalId)"
            >
              <GoalGrid :items="sec.items" :mobile="isMobile || splitView">
                <template #default="{ item }">
                  <div
                    :key="item.id"
                    v-memo="[
                      item.id,
                      item.updatedAt,
                      // Ticking a point or subtask changes progress, not the
                      // milestone itself, so the card has to hear about it.
                      app.goalProgress(item.id).done,
                      app.goalProgress(item.id).total,
                      sortKey,
                      dragId === item.id,
                      panelGoalId === item.id,
                      selecting,
                      picked.has(item.id),
                    ]"
                    :style="cellStyle(item.id)"
                    :draggable="sortKey === 'order' && !selecting"
                    @dragstart="onDragStart($event, item.id)"
                    @dragover="onDragOver"
                    @drop="onDropOn(indexOf(item.id))"
                    @pointerdown="onCardPointerDown($event, item.id)"
                    @pointercancel="tap.onPointerCancel"
                    @mousedown.shift.prevent
                    @click="tap.onClick"
                  >
                    <GoalCard
                      :goal="item"
                      :ratio="app.goalProgress(item.id).ratio"
                      :selected="!isMobile && panelGoalId === item.id"
                      :counts="app.goalCounts(item.id)"
                      :days-chip="daysChip(item.targetDate)"
                      :menu="cardMenu(item.id)"
                      :draggable="sortKey === 'order' && !selecting"
                      :selecting="selecting"
                      :picked="picked.has(item.id)"
                      @pick="pickCard(item.id, $event)"
                      @menu="onCardMenu(item.id, $event)"
                    />
                  </div>
                </template>
              </GoalGrid>
            </component>
            <button
              v-if="groupBy === 'goal'"
              type="button"
              class="gv-newgoal"
              @click="newSkillGoal"
            >
              <Icon name="plus" size="xs" />New goal
            </button>
          </div>
          <span v-if="!isMobile && !loading && goals.length" :style="shortcutHint"
            ><span :style="shortcutKey">/n</span>focus quick add</span
          >
        </div>

        <!-- The selected goal's details (desktop). Inline it is the second
             column of this grid; in either drawer mode it floats over the tab
             instead and contributes nothing to the layout. -->
        <DetailPane
          v-if="!isMobile"
          :open="panelGoalExists"
          title="Milestone details"
          @width="paneWidth = $event"
          @close="panelGoalId = null"
        >
          <GoalSideDetail
            :goal-id="panelGoalExists ? panelGoalId : null"
            @select="panelGoalId = $event"
          />
        </DetailPane>
      </div>
    </template>

    <GoalCreateSlideOver v-if="showCreate" @close="showCreate = false" @created="onCreated" />
    <SkillGoalDialog
      :open="goalDialog.open"
      :goal-id="goalDialog.id"
      @close="goalDialog = { open: false, id: null }"
    />
  </div>
</template>

<style scoped>
/* The list under quick add. Flat, the grid scrolls itself; grouped, the
   accordions stack and this column scrolls them. */
.gv-sections {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.gv-sections.is-grouped {
  gap: var(--sp-3);
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 2px;
}
/* "New goal" at the foot of the goals, where the next one would go. */
.gv-newgoal {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px dashed var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-family: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.gv-newgoal:hover {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.gv-flat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
/* Inside an accordion the grid is as tall as its cards: the column scrolls. */
.gv-group :deep(.ggrid) {
  overflow: visible;
  padding: 2px 0 var(--sp-1);
}
/* Overdue says so in its header, as a carried-over group does on Todos. */
.gv-group--overdue :deep(.ui-accordion__head) {
  color: var(--theme-danger);
}
/* The selection bar: the accent-tinted strip every list's bulk bar is. */
.gv-bulk {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
  animation: gvBulkIn 0.18s var(--ease-out, ease) both;
}
.gv-bulk__count {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.gv-bulk__hint {
  flex: 1;
  min-width: 0;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gv-bulk__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.gv-bulk__btn:hover:not(:disabled) {
  border-color: var(--theme-accent);
}
.gv-bulk__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.gv-bulk__btn--danger {
  border-color: color-mix(in oklch, var(--theme-danger) 50%, transparent);
  color: var(--theme-danger);
}
.gv-bulk__btn--danger:hover:not(:disabled) {
  border-color: var(--theme-danger);
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
}
@media (max-width: 640px) {
  .gv-bulk__hint {
    display: none;
  }
}
@keyframes gvBulkIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .gv-bulk {
    animation: none;
  }
}
</style>

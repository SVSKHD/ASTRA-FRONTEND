<script setup lang="ts">
// Goals tab (task 8). A goal is a container above tasks/todos: it owns a
// checklist and can have existing tasks/todos attached by reference. This view is
// the list (card grid / mobile list) with status filter, sort, and grip-drag
// reorder; selecting a card opens GoalDetail in place.
import { computed, defineAsyncComponent, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { debounce } from '@/utils/syncGuard'
import { daysRemaining } from '@/utils/detailFields'
import GoalsToolbar from '@/components/goals/GoalsToolbar.vue'
// The wide page is heavy (the metric chart, a TreeList per attachment) and is
// rendered only once a goal is opened on it, so it stays off the grid's first
// paint (section 19d).
const GoalDetail = defineAsyncComponent(() => import('@/components/GoalDetail.vue'))
import GoalsEmptyState from '@/components/GoalsEmptyState.vue'
import GoalCreateSlideOver from '@/components/GoalCreateSlideOver.vue'
import GoalCard from '@/components/goals/GoalCard.vue'
import GoalCardSkeleton from '@/components/goals/GoalCardSkeleton.vue'
import GoalGrid from '@/components/goals/GoalGrid.vue'
import { useTapOpen } from '@/composables/useTapOpen'
import type { Goal, GoalStatus } from '@/types'

const app = useAppStore()
const router = useRouter()
const { s, isMobile, panelStyle } = useStyles()
const { goals } = storeToRefs(app)

// The selected goal lives in the store, so /goals/:goalId can open it on a cold
// load and the dialog's "Open full page" can hand a goal over to this view.
const selectedId = computed({
  get: () => app.goalPageId,
  set: (value: number | null) => (value == null ? app.closeGoalPage() : app.openGoalPage(value)),
})
const statusFilter = ref<GoalStatus | 'all'>('all')
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
function onSearch(event: Event) {
  search.value = (event.target as HTMLInputElement).value
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

defineExpose({ focus: () => onNew() })

// Manual create now opens the slide-over (task 12c) rather than dropping a bare
// "New goal" into the list.
const showCreate = ref(false)
function onNew() {
  showCreate.value = true
}
function onCreated(goalId: number) {
  showCreate.value = false
  selectedId.value = goalId
}
// A card opens the goal dialog (acceptance 89); the wide page is reached from
// the dialog's footer, or by loading /goals/:goalId directly.
function openGoal(goalId: number) {
  app.openGoalDialog(
    goalId,
    rows.value.map((r) => r.goal.id),
  )
}
function goImport() {
  router.push('/import/goals')
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
const tap = useTapOpen(() => {
  const goalId = pressedCard.value
  pressedCard.value = null
  if (goalId != null) openGoal(goalId)
})
function onCardPointerDown(event: PointerEvent, goalId: number) {
  pressedCard.value = goalId
  tap.onPointerDown(event)
}

// The card's own actions. Everything here stops the click from reaching the
// card, so none of it opens the dialog.
const CARD_MENU = [
  { value: 'open', label: 'Open full page' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'archive', label: 'Archive' },
  { value: 'delete', label: 'Delete' },
]
function onCardMenu(goalId: number, action: string) {
  if (action === 'open') router.push(`/goals/${goalId}`)
  else if (action === 'duplicate') app.duplicateGoal(goalId)
  else if (action === 'archive') app.archiveGoal(goalId)
  else if (action === 'delete') app.removeGoalWithUndo(goalId)
}

// Keyboard: `g` then `n` opens New goal while the Goals tab is focused (task 12d).
let gPressedAt = 0
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
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
const rows = computed<GoalRow[]>(() => {
  // Archived goals are hidden unless explicitly filtered to.
  let list = goals.value.slice()
  if (statusFilter.value === 'all') list = list.filter((g) => g.status !== 'archived')
  else list = list.filter((g) => g.status === statusFilter.value)

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
    gap: 16,
    padding: '2px',
    overflowY: 'auto',
    alignContent: 'start',
  }),
)
// GoalGrid takes the goals themselves; the ratio and counts come from the
// store's rollup index, which is O(1) per card (section 19d).
const visibleGoals = computed(() => rows.value.map((r) => r.goal))

// The card's position in the filtered list, for a drop that lands on it.
function indexOf(goalId: number): number {
  return rows.value.findIndex((r) => r.goal.id === goalId)
}
function cellStyle(id: number) {
  return pxify({ minWidth: 0, opacity: dragId.value === id ? 0.5 : 1 })
}
</script>

<template>
  <div :style="panelStyle">
    <GoalDetail v-if="selectedId != null" :goal-id="selectedId" @back="selectedId = null" />

    <template v-else>
      <GoalsToolbar
        :search="search"
        :status="statusFilter"
        :sort="sortKey"
        :mobile="isMobile"
        :show-filters="goals.length > 0"
        @update:search="onSearch"
        @submit-search="onSearchSubmit"
        @update:status="statusFilter = $event"
        @update:sort="sortKey = $event"
        @import="goImport"
        @new="onNew"
        @help="app.openGoalHelp()"
      />

      <!-- Skeletons while the workspace is still arriving. Same box model as
           the real card, so the swap moves nothing (acceptance 95). First,
           because "nothing here" and "not here yet" are different answers. -->
      <div v-if="loading" :style="grid" aria-busy="true" aria-label="Loading goals">
        <GoalCardSkeleton v-for="n in SKELETON_COUNT" :key="n" />
      </div>

      <GoalsEmptyState
        v-else-if="goals.length === 0"
        @new="onNew"
        @paste-json="goImport"
        @import-link="goImport"
      />
      <div v-else-if="rows.length === 0" :style="s.empty">No goals match this filter.</div>

      <GoalGrid v-else :items="visibleGoals" :mobile="isMobile">
        <template #default="{ item }">
          <div
            :key="item.id"
            v-memo="[item.id, item.updatedAt, sortKey, dragId === item.id]"
            :style="cellStyle(item.id)"
            :draggable="sortKey === 'order'"
            @dragstart="onDragStart($event, item.id)"
            @dragover="onDragOver"
            @drop="onDropOn(indexOf(item.id))"
            @pointerdown="onCardPointerDown($event, item.id)"
            @pointercancel="tap.onPointerCancel"
            @click="tap.onClick"
          >
            <GoalCard
              :goal="item"
              :ratio="app.goalProgress(item.id).ratio"
              :counts="app.goalCounts(item.id)"
              :days-chip="daysChip(item.targetDate)"
              :menu="CARD_MENU"
              :draggable="sortKey === 'order'"
              @menu="onCardMenu(item.id, $event)"
            />
          </div>
        </template>
      </GoalGrid>
    </template>

    <GoalCreateSlideOver v-if="showCreate" @close="showCreate = false" @created="onCreated" />
  </div>
</template>

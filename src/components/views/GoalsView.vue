<script setup lang="ts">
// Goals tab (task 8). A goal is a container above tasks/todos: it owns a
// checklist and can have existing tasks/todos attached by reference. This view is
// the list (card grid / mobile list) with status filter, sort, and grip-drag
// reorder; selecting a card opens GoalDetail in place.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { daysRemaining } from '@/utils/detailFields'
import ListToolbar from '@/components/ListToolbar.vue'
import GoalDetail from '@/components/GoalDetail.vue'
import GoalsEmptyState from '@/components/GoalsEmptyState.vue'
import GoalCreateSlideOver from '@/components/GoalCreateSlideOver.vue'
import GoalCard from '@/components/goals/GoalCard.vue'
import { useTapOpen } from '@/composables/useTapOpen'
import type { Goal, GoalStatus } from '@/types'

const app = useAppStore()
const router = useRouter()
const { c, s, isMobile, panelStyle } = useStyles()
const { goals } = storeToRefs(app)

// The selected goal lives in the store, so /goals/:goalId can open it on a cold
// load and the dialog's "Open full page" can hand a goal over to this view.
const selectedId = computed({
  get: () => app.goalPageId,
  set: (value: number | null) => (value == null ? app.closeGoalPage() : app.openGoalPage(value)),
})
const statusFilter = ref<GoalStatus | 'all'>('all')
const sortKey = ref<'order' | 'target' | 'progress'>('order')
const search = ref('')

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
  const q = search.value.trim().toLowerCase()
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
function cellStyle(id: number) {
  return pxify({ minWidth: 0, opacity: dragId.value === id ? 0.5 : 1 })
}
const filterBar = pxify({ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 2px 10px' })
const searchInput = computed(() =>
  pxify({ ...s.value.input, flex: 1, minWidth: 140, padding: '6px 10px', fontSize: 12 }),
)
const importBtn = computed(() =>
  pxify({
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 12px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <GoalDetail v-if="selectedId != null" :goal-id="selectedId" @back="selectedId = null" />

    <template v-else>
      <ListToolbar title="Goals" new-label="New goal" @new="onNew">
        <template #actions>
          <!-- Import paths converge on the one /import/goals preview (paste-JSON,
               .json drop and spasta links all handled there). -->
          <button type="button" :style="importBtn" @click="goImport">Paste JSON</button>
          <button type="button" :style="importBtn" @click="goImport">Import link</button>
        </template>
      </ListToolbar>

      <div v-if="goals.length" :style="filterBar">
        <input
          :style="searchInput"
          :value="search"
          type="search"
          placeholder="Search goals…"
          @input="search = ($event.target as HTMLInputElement).value"
        />
        <select
          :style="s.select"
          :value="statusFilter"
          @change="statusFilter = ($event.target as HTMLSelectElement).value as GoalStatus | 'all'"
        >
          <option value="all">Active &amp; open</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="done">Done</option>
          <option value="archived">Archived</option>
        </select>
        <select
          :style="s.select"
          :value="sortKey"
          @change="sortKey = ($event.target as HTMLSelectElement).value as typeof sortKey"
        >
          <option value="order">Manual order</option>
          <option value="target">By target date</option>
          <option value="progress">By progress</option>
        </select>
      </div>

      <GoalsEmptyState
        v-if="goals.length === 0"
        @new="onNew"
        @paste-json="goImport"
        @import-link="goImport"
      />
      <div v-else-if="rows.length === 0" :style="s.empty">No goals match this filter.</div>

      <div v-else :style="grid">
        <div
          v-for="(r, i) in rows"
          :key="r.goal.id"
          :style="cellStyle(r.goal.id)"
          :draggable="sortKey === 'order'"
          @dragstart="onDragStart($event, r.goal.id)"
          @dragover="onDragOver"
          @drop="onDropOn(i)"
          @pointerdown="onCardPointerDown($event, r.goal.id)"
          @pointercancel="tap.onPointerCancel"
          @click="tap.onClick"
        >
          <GoalCard
            :goal="r.goal"
            :ratio="r.ratio"
            :counts="r.counts"
            :days-chip="daysChip(r.goal.targetDate)"
            :menu="CARD_MENU"
            :draggable="sortKey === 'order'"
            @menu="onCardMenu(r.goal.id, $event)"
          />
        </div>
      </div>
    </template>

    <GoalCreateSlideOver v-if="showCreate" @close="showCreate = false" @created="onCreated" />
  </div>
</template>

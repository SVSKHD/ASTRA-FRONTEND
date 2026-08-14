<script setup lang="ts">
// Goals tab (task 8). A goal is a container above tasks/todos: it owns a
// checklist and can have existing tasks/todos attached by reference. This view is
// the list (card grid / mobile list) with status filter, sort, and grip-drag
// reorder; selecting a card opens GoalDetail in place.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import ListToolbar from '@/components/ListToolbar.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import GoalDetail from '@/components/GoalDetail.vue'
import type { Goal, GoalStatus } from '@/types'

const app = useAppStore()
const router = useRouter()
const { c, s, isMobile, panelStyle } = useStyles()
const { goals } = storeToRefs(app)

const selectedId = ref<number | null>(null)
const statusFilter = ref<GoalStatus | 'all'>('all')
const sortKey = ref<'order' | 'target' | 'progress'>('order')
const search = ref('')

defineExpose({ focus: () => onNew() })

function onNew() {
  const gid = app.addGoal({ title: 'New goal' })
  selectedId.value = gid
}

const STATUS_META: Record<GoalStatus, { label: string; col: string }> = {
  active: { label: 'Active', col: 'oklch(0.7 0.15 155)' },
  paused: { label: 'Paused', col: 'oklch(0.75 0.13 80)' },
  done: { label: 'Done', col: 'oklch(0.7 0.13 250)' },
  archived: { label: 'Archived', col: 'oklch(0.6 0.02 250)' },
}

const today = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})
function daysChip(target: string): { text: string; col: string } | null {
  if (!target) return null
  const due = new Date(target + 'T00:00:00')
  const days = Math.round((due.getTime() - today.value.getTime()) / 86400000)
  if (days < 0) return { text: `${-days}d overdue`, col: 'oklch(0.64 0.22 25)' }
  if (days === 0) return { text: 'today', col: 'oklch(0.72 0.16 55)' }
  return { text: `${days}d left`, col: c.value.dim }
}

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
    gridTemplateColumns: isMobile.value ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
    padding: '2px',
    overflowY: 'auto',
  }),
)
function cardStyle(id: number) {
  return pxify({
    ...rowBase(c.value),
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 10,
    cursor: 'pointer',
    opacity: dragId.value === id ? 0.5 : 1,
  })
}
const filterBar = pxify({ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 2px 10px' })
const topRow = pxify({ display: 'flex', alignItems: 'center', gap: 12 })
const titleStyle = computed(() =>
  pxify({
    fontSize: 15,
    fontWeight: 600,
    color: c.value.text,
    lineHeight: 1.25,
    flex: 1,
    minWidth: 0,
  }),
)
const descStyle = computed(() =>
  pxify({
    fontSize: 12,
    color: c.value.dim,
    lineHeight: 1.4,
    display: '-webkit-box',
    '-webkit-line-clamp': '2',
    '-webkit-box-orient': 'vertical',
    overflow: 'hidden',
  }),
)
const metaRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' })
function statusBadge(status: GoalStatus) {
  const m = STATUS_META[status]
  return pxify({
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '3px 8px',
    borderRadius: 999,
    color: m.col,
    border: '1px solid ' + m.col,
  })
}
function chip(col: string) {
  return pxify({
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 999,
    color: col,
    border: '1px solid ' + col,
  })
}
const countChip = computed(() =>
  pxify({
    fontSize: 11,
    color: c.value.dim,
    padding: '3px 8px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
const gripDots = [0, 1, 2, 3, 4, 5]
// One accent colour per goal, used only for the dot (and the detail progress
// bar) — falls back to the theme accent when the goal has no colour set.
function colorDot(color: string) {
  return pxify({
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
    background: color || c.value.accent,
  })
}
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
          <button type="button" :style="importBtn" @click="router.push('/import/goals')">
            Import from link
          </button>
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

      <div v-if="goals.length === 0" :style="s.empty">
        No goals yet. Create one, or import from a link.
      </div>
      <div v-else-if="rows.length === 0" :style="s.empty">No goals match this filter.</div>

      <div v-else :style="grid">
        <div
          v-for="(r, i) in rows"
          :key="r.goal.id"
          :style="cardStyle(r.goal.id)"
          v-hover-style="s.rowHover"
          :draggable="sortKey === 'order'"
          @dragstart="onDragStart($event, r.goal.id)"
          @dragover="onDragOver"
          @drop="onDropOn(i)"
          @click="selectedId = r.goal.id"
        >
          <div :style="topRow">
            <span
              v-if="sortKey === 'order'"
              :style="s.grip"
              role="button"
              aria-label="Drag to reorder"
              title="Drag to reorder"
              @click.stop
              ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
            ></span>
            <ProgressRing :ratio="r.ratio" :size="42" />
            <span :style="colorDot(r.goal.color)" aria-hidden="true"></span>
            <span :style="titleStyle">{{ r.goal.title || 'Untitled goal' }}</span>
            <span :style="statusBadge(r.goal.status)">{{ STATUS_META[r.goal.status].label }}</span>
          </div>
          <div v-if="r.goal.description" :style="descStyle">{{ r.goal.description }}</div>
          <div :style="metaRow">
            <span
              v-if="daysChip(r.goal.targetDate)"
              :style="chip(daysChip(r.goal.targetDate)!.col)"
            >
              {{ daysChip(r.goal.targetDate)!.text }}
            </span>
            <span :style="countChip">{{ r.counts.checklist }} checklist</span>
            <span :style="countChip">{{ r.counts.tasks }} tasks</span>
            <span :style="countChip">{{ r.counts.todos }} todos</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

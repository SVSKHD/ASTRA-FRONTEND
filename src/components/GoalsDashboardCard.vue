<script setup lang="ts">
// Dashboard Goals card (task 10c). A compact summary that matches the overview
// cards' glass/token styling: header (active count + View all), up to three
// active goals nearest their target date, and an aggregate ring of points done
// across all active goals. Empty and loading (skeleton) states, no internal
// scroll, capped height so it never overflows the dashboard.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import MetricCapturePopover from '@/components/MetricCapturePopover.vue'
import { captureOutcome } from '@/utils/goalMetrics'

const app = useAppStore()
const ui = useUiStore()
const auth = useAuthStore()
const router = useRouter()
const { c } = useStyles()
const { goals, goalOccurrences, cloudReady } = storeToRefs(app)
const { user } = storeToRefs(auth)

const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'
const GREEN = 'oklch(0.72 0.15 150)'

// --- today's recurring goals (task 11) ---------------------------------------
const dailies = computed(() => {
  void goalOccurrences.value // reactive dep
  return activeGoals.value
    .filter((g) => g.recurrence?.enabled)
    .map((g) => ({ goal: g, occ: app.occurrenceOn(g.id, app.goalToday(g)) }))
    .filter((d) => d.occ)
    .slice(0, 4)
})
const dailyAgg = computed(() => {
  const total = dailies.value.length
  const done = dailies.value.filter((d) => d.occ!.status === 'done').length
  return { done, total }
})
const captureGoalId = ref<number | null>(null)
function tickDaily(goalId: number, metricEnabled: boolean, status: string) {
  const g = goals.value.find((x) => x.id === goalId)
  if (!g) return
  const date = app.goalToday(g)
  if (metricEnabled && status !== 'done') {
    captureGoalId.value = goalId
    return
  }
  app.toggleOccurrenceDone(goalId, date)
}
function onDailySave(goalId: number, payload: { actual: number; note: string | null }) {
  const g = goals.value.find((x) => x.id === goalId)
  if (g) app.captureOccurrence(goalId, app.goalToday(g), payload.actual, payload.note)
  captureGoalId.value = null
}
function onDailySkip(goalId: number) {
  const g = goals.value.find((x) => x.id === goalId)
  if (g) app.skipOccurrence(goalId, app.goalToday(g))
  captureGoalId.value = null
}
function dailyLabel(
  goal: (typeof dailies.value)[number]['goal'],
  occ: NonNullable<(typeof dailies.value)[number]['occ']>,
) {
  if (goal.metric?.enabled && occ.actual != null) {
    const o = captureOutcome(goal.metric, occ.actual)
    return { text: `${occ.actual}/${occ.target}`, col: o.hit ? GREEN : AMBER }
  }
  if (occ.status === 'done') return { text: 'done', col: GREEN }
  if (goal.metric?.enabled) return { text: `target ${goal.metric.target}`, col: c.value.dim }
  return { text: '', col: c.value.dim }
}

// Signed in but the workspace doc hasn't arrived yet → show skeleton rows rather
// than an empty state that would flash before data lands.
const loading = computed(() => !!user.value && !cloudReady.value && goals.value.length === 0)

const activeGoals = computed(() => goals.value.filter((g) => g.status === 'active'))

// Up to three active goals, nearest target date first; those without a target
// sort after the dated ones (stable by order).
const top = computed(() => {
  return activeGoals.value
    .slice()
    .sort((a, b) => {
      if (a.targetDate && b.targetDate) return a.targetDate < b.targetDate ? -1 : 1
      if (a.targetDate) return -1
      if (b.targetDate) return 1
      return a.order - b.order
    })
    .slice(0, 3)
    .map((g) => ({
      goal: g,
      ratio: app.goalProgress(g.id).ratio,
      chip: daysChip(g.targetDate),
    }))
})

// Aggregate ring: total points done / total across ALL active goals.
const aggregate = computed(() => {
  let done = 0
  let total = 0
  for (const g of activeGoals.value) {
    const p = app.goalProgress(g.id)
    done += p.done
    total += p.total
  }
  return { done, total, ratio: total ? done / total : 0 }
})

function daysChip(target: string): { text: string; col: string } | null {
  if (!target) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(target + 'T00:00:00')
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { text: `${-days}d over`, col: RED }
  if (days === 0) return { text: 'today', col: AMBER }
  if (days < 7) return { text: `${days}d left`, col: AMBER }
  return { text: `${days}d left`, col: c.value.dim }
}

function viewAll() {
  ui.setTab('goals')
}
function createGoal() {
  app.addGoal({ title: 'New goal' })
  ui.setTab('goals')
}
function importUrl() {
  void router.push('/import/goals')
}

// --- styles ------------------------------------------------------------------
const card = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '18px 18px 15px',
    borderRadius: 18,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    minWidth: 0,
  }),
)
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 8 })
const label = computed(() =>
  pxify({ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.value.dim }),
)
const countChip = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    color: c.value.accent,
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid ' + c.value.accent,
  }),
)
const viewAllBtn = computed(() =>
  pxify({
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: 600,
    color: c.value.dim,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }),
)
const body = pxify({ display: 'flex', flexDirection: 'column', gap: 10 })
const goalRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 })
function dot(color: string) {
  return pxify({
    width: 9,
    height: 9,
    borderRadius: '50%',
    flexShrink: 0,
    background: color || c.value.accent,
  })
}
const titleCol = pxify({ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 })
const titleRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 })
const goalTitle = computed(() =>
  pxify({
    fontSize: 13,
    color: c.value.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    minWidth: 0,
  }),
)
function chipStyle(col: string) {
  return pxify({ fontSize: 10, fontWeight: 600, color: col, flexShrink: 0 })
}
const track = computed(() =>
  pxify({
    position: 'relative',
    height: 4,
    borderRadius: 999,
    background: c.value.input,
    overflow: 'hidden',
  }),
)
function fill(ratio: number, color: string) {
  return pxify({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: Math.round(ratio * 100) + '%',
    borderRadius: 999,
    background: color || c.value.accent,
    transition: 'width .4s ease',
  })
}
const pctText = computed(() =>
  pxify({ fontSize: 10, color: c.value.dim, flexShrink: 0, width: 30, textAlign: 'right' }),
)
const footer = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
    paddingTop: 8,
    borderTop: '1px solid ' + c.value.border,
  }),
)
const footerText = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
// --- daily strip ---
const dailyStrip = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingBottom: 8,
    borderBottom: '1px solid ' + c.value.border,
  }),
)
const dailyHead = computed(() => pxify({ fontSize: 11, fontWeight: 700, color: c.value.text }))
const dailyRow = pxify({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
})
const dailyTitle = computed(() =>
  pxify({
    fontSize: 12,
    color: c.value.text,
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
function dailyValue(col: string) {
  return pxify({ fontSize: 11, fontWeight: 600, color: col, flexShrink: 0 })
}
const emptyText = computed(() => pxify({ fontSize: 13, color: c.value.dim }))
const btnRow = pxify({ display: 'flex', gap: 8, flexWrap: 'wrap' })
const btn = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
const primaryBtn = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    padding: '6px 10px',
    borderRadius: 999,
    border: 'none',
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
function skeleton() {
  return pxify({
    height: 12,
    borderRadius: 6,
    background: c.value.input,
    animation: 'shimmer 1.4s ease-in-out infinite',
    backgroundImage: `linear-gradient(90deg, ${c.value.input} 0%, ${c.value.border} 50%, ${c.value.input} 100%)`,
    backgroundSize: '200% 100%',
  })
}
</script>

<template>
  <div :style="card">
    <div :style="headRow">
      <span :style="label">Goals</span>
      <span v-if="activeGoals.length" :style="countChip">{{ activeGoals.length }} active</span>
      <button :style="viewAllBtn" @click="viewAll">View all →</button>
    </div>

    <!-- Today's recurring goals (task 11) -->
    <div v-if="dailies.length" :style="dailyStrip">
      <div :style="dailyHead">
        {{ dailyAgg.done }} of {{ dailyAgg.total }} daily goal{{ dailyAgg.total === 1 ? '' : 's' }}
        done today
      </div>
      <div v-for="d in dailies" :key="d.goal.id" :style="dailyRow">
        <input
          type="checkbox"
          :checked="d.occ!.status === 'done'"
          :aria-label="'Complete ' + (d.goal.title || 'goal') + ' today'"
          @click.prevent="tickDaily(d.goal.id, !!d.goal.metric?.enabled, d.occ!.status)"
        />
        <span :style="dailyTitle">{{ d.goal.title || 'Untitled goal' }}</span>
        <span :style="dailyValue(dailyLabel(d.goal, d.occ!).col)">
          {{ dailyLabel(d.goal, d.occ!).text }}
        </span>
        <MetricCapturePopover
          v-if="captureGoalId === d.goal.id && d.goal.metric"
          :occurrence-id="d.occ!.id"
          :metric="d.goal.metric"
          :prompt="`How much ${d.goal.metric.label.toLowerCase()} today?`"
          @save="(p) => onDailySave(d.goal.id, p)"
          @skip="() => onDailySkip(d.goal.id)"
          @missed="(p) => onDailySave(d.goal.id, p)"
          @cancel="captureGoalId = null"
        />
      </div>
    </div>

    <!-- Loading skeletons -->
    <div v-if="loading" :style="body">
      <div v-for="n in 3" :key="n" :style="skeleton()"></div>
    </div>

    <!-- Empty state -->
    <template v-else-if="activeGoals.length === 0">
      <div :style="emptyText">No active goals yet.</div>
      <div :style="btnRow">
        <button :style="primaryBtn" @click="createGoal">Create a goal</button>
        <button :style="btn" @click="importUrl">Import from URL</button>
      </div>
    </template>

    <!-- Up to three nearest-due active goals + aggregate ring -->
    <template v-else>
      <div :style="body">
        <div v-for="row in top" :key="row.goal.id" :style="goalRow">
          <span :style="dot(row.goal.color)"></span>
          <div :style="titleCol">
            <div :style="titleRow">
              <span :style="goalTitle">{{ row.goal.title || 'Untitled goal' }}</span>
              <span v-if="row.chip" :style="chipStyle(row.chip.col)">{{ row.chip.text }}</span>
              <span :style="pctText">{{ Math.round(row.ratio * 100) }}%</span>
            </div>
            <div :style="track">
              <span :style="fill(row.ratio, row.goal.color)"></span>
            </div>
          </div>
        </div>
      </div>
      <div :style="footer">
        <ProgressRing :ratio="aggregate.ratio" :size="36" :stroke="3.5" />
        <span :style="footerText">
          {{ aggregate.done }}/{{ aggregate.total }} points done across
          {{ activeGoals.length }} active goal{{ activeGoals.length === 1 ? '' : 's' }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Target-vs-actual view for a recurring metric goal (task 11). A stats header
// (today, current/best streak, completion rate), a rolling window (7/30/90 days)
// of totals/averages, a per-day bar chart with a dashed target line (bars
// coloured by hit / short / missed), and an inline-editable history list. All
// colours come from theme tokens so it reads on every theme.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import {
  currentStreak,
  bestStreak,
  completionRate,
  rollingStats,
  meetsTarget,
} from '@/utils/goalMetrics'

const props = defineProps<{ goalId: number }>()
const app = useAppStore()
const { c } = useStyles()
const { goalOccurrences } = storeToRefs(app)

const GREEN = 'oklch(0.72 0.15 150)'
const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'

const goal = computed(() => app.goals.find((g) => g.id === props.goalId))
const metric = computed(() => goal.value?.metric)
const occ = computed(() => {
  void goalOccurrences.value
  return app.occurrencesOf(props.goalId)
})
const today = computed(() => (goal.value ? app.goalToday(goal.value) : ''))

const windowDays = ref(30)
const WINDOWS = [7, 30, 90]

const streak = computed(() => currentStreak(occ.value))
const best = computed(() => bestStreak(occ.value))
const rate = computed(() => completionRate(occ.value))
const stats = computed(() =>
  rollingStats(occ.value, windowDays.value, today.value, {
    direction: metric.value?.direction ?? 'at_least',
  }),
)

// The bars: occurrences inside the window, oldest→newest.
const bars = computed(() => {
  const from = shift(today.value, -(windowDays.value - 1))
  const inWin = occ.value.filter((o) => o.date >= from && o.date <= today.value)
  const maxVal = Math.max(metric.value?.target ?? 1, ...inWin.map((o) => o.actual ?? 0), 1)
  return inWin.map((o) => {
    const hit =
      o.actual != null && metric.value
        ? meetsTarget(metric.value.direction, o.target, o.actual)
        : false
    const col =
      o.status === 'missed'
        ? RED
        : o.status === 'skipped'
          ? c.value.border
          : o.status === 'pending'
            ? c.value.input
            : hit
              ? GREEN
              : AMBER
    return {
      date: o.date,
      h: o.actual != null ? Math.max(2, Math.round((o.actual / maxVal) * 100)) : 2,
      col,
      actual: o.actual,
    }
  })
})
// The dashed target line, as a % height off the same scale as the bars.
const targetPct = computed(() => {
  const from = shift(today.value, -(windowDays.value - 1))
  const inWin = occ.value.filter((o) => o.date >= from && o.date <= today.value)
  const maxVal = Math.max(metric.value?.target ?? 1, ...inWin.map((o) => o.actual ?? 0), 1)
  return metric.value ? Math.round((metric.value.target / maxVal) * 100) : 0
})

// --- history inline edit ------------------------------------------------------
const editDate = ref<string | null>(null)
const editVal = ref('')
function startEdit(date: string, actual: number | null) {
  editDate.value = date
  editVal.value = actual == null ? '' : String(actual)
}
function commitEdit(date: string) {
  const n = parseFloat(editVal.value)
  app.updateOccurrenceActual(props.goalId, date, Number.isFinite(n) ? n : null)
  editDate.value = null
}
const history = computed(() => occ.value.slice().reverse())

function shift(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// --- styles ------------------------------------------------------------------
const wrap = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
  }),
)
const statRow = pxify({ display: 'flex', gap: 16, flexWrap: 'wrap' })
const stat = pxify({ display: 'flex', flexDirection: 'column', gap: 2 })
const statNum = computed(() =>
  pxify({ ...typeStep('md'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
const statLabel = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const winRow = pxify({ display: 'flex', gap: 6, alignItems: 'center' })
function winBtn(active: boolean) {
  return pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active ? c.value.accent : 'transparent',
    color: active ? c.value.onAccent : c.value.dim,
    cursor: 'pointer',
  })
}
const chartBox = computed(() =>
  pxify({
    position: 'relative',
    height: 120,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 2,
    padding: '4px 0',
    borderBottom: '1px solid ' + c.value.border,
  }),
)
function barStyle(h: number, col: string) {
  return pxify({
    flex: 1,
    minWidth: 2,
    height: h + '%',
    borderRadius: '3px 3px 0 0',
    background: col,
  })
}
const targetLine = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: `calc(4px + ${targetPct.value}%)`,
    borderTop: '1.5px dashed ' + c.value.accent,
    pointerEvents: 'none',
  }),
)
const histList = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxHeight: 200,
  overflowY: 'auto',
})
const histRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '5px 6px',
    borderRadius: 8,
    ...typeStep('xs'),
    color: c.value.text,
  }),
)
const histDate = computed(() => pxify({ color: c.value.dim, width: 92, flexShrink: 0 }))
const histVal = computed(() => pxify({ fontWeight: 'var(--weight-semibold)', cursor: 'pointer' }))
const histNote = computed(() =>
  pxify({
    color: c.value.dim,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const editInput = computed(() =>
  pxify({
    width: 70,
    ...typeStep('xs'),
    padding: '2px 6px',
    borderRadius: 6,
    border: '1px solid ' + c.value.accent,
    background: c.value.input,
    color: c.value.text,
    outline: 'none',
    fontFamily: 'inherit',
  }),
)
const emptyStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
</script>

<template>
  <div v-if="metric?.enabled" :style="wrap">
    <div :style="statRow">
      <div :style="stat">
        <span :style="statNum">{{ streak }}</span>
        <span :style="statLabel">Streak</span>
      </div>
      <div :style="stat">
        <span :style="statNum">{{ best }}</span>
        <span :style="statLabel">Best</span>
      </div>
      <div :style="stat">
        <span :style="statNum">{{ Math.round(rate * 100) }}%</span>
        <span :style="statLabel">Completion</span>
      </div>
      <div :style="stat">
        <span :style="statNum">{{ fmt(stats.avgActual) }}</span>
        <span :style="statLabel">Avg / {{ windowDays }}d</span>
      </div>
      <div :style="stat">
        <span :style="statNum">{{ fmt(stats.totalActual) }}</span>
        <span :style="statLabel">Total {{ metric.unit }}</span>
      </div>
      <div :style="stat">
        <span :style="statNum">{{ stats.daysHit }}/{{ stats.daysDone }}</span>
        <span :style="statLabel">Hit target</span>
      </div>
    </div>

    <div :style="winRow">
      <button
        v-for="w in WINDOWS"
        :key="w"
        :style="winBtn(windowDays === w)"
        @click="windowDays = w"
      >
        {{ w }}d
      </button>
      <span :style="emptyStyle" style="margin-left: auto">
        cumulative {{ fmt(stats.cumulativeActual) }} / {{ fmt(stats.cumulativeTarget) }}
      </span>
    </div>

    <div v-if="bars.length" :style="chartBox">
      <div :style="targetLine" :title="`target ${metric.target}`"></div>
      <div
        v-for="b in bars"
        :key="b.date"
        :style="barStyle(b.h, b.col)"
        :title="`${b.date}: ${b.actual ?? '—'}`"
      ></div>
    </div>
    <div v-else :style="emptyStyle">No data in this window yet.</div>

    <!-- history, inline-editable -->
    <div :style="histList">
      <div v-for="o in history" :key="o.date" :style="histRow">
        <span :style="histDate">{{ o.date }}</span>
        <template v-if="editDate === o.date">
          <input
            :style="editInput"
            v-model="editVal"
            type="text"
            inputmode="decimal"
            @keydown.enter.prevent="commitEdit(o.date)"
            @blur="commitEdit(o.date)"
          />
        </template>
        <span v-else :style="histVal" title="Click to edit" @click="startEdit(o.date, o.actual)">
          {{ o.actual == null ? '—' : o.actual }} / {{ o.target }}
        </span>
        <span :style="histNote">{{ o.note || (o.status !== 'done' ? o.status : '') }}</span>
      </div>
    </div>
  </div>
</template>

// Today's occurrence of a recurring goal, and what ticking it does (task 11).
//
// Extracted when the goal card grew its own tick control (section 18b): the
// rule that a metric-enabled day opens the capture popover instead of toggling
// is the kind of thing that quietly diverges once it exists twice, and it is the
// difference acceptance 89 turns on.

import { computed, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { captureOutcome } from '@/utils/goalMetrics'

export interface TodayLabel {
  text: string
  hit: boolean
  missed: boolean
}

export function useGoalToday(goalId: Ref<number> | (() => number)) {
  const app = useAppStore()
  const { goals, goalOccurrences } = storeToRefs(app)
  const id = computed(() => (typeof goalId === 'function' ? goalId() : goalId.value))

  const goal = computed(() => goals.value.find((g) => g.id === id.value))
  const recurring = computed(() => !!goal.value?.recurrence?.enabled)
  const metricOn = computed(() => !!goal.value?.metric?.enabled)
  const today = computed(() => (goal.value ? app.goalToday(goal.value) : ''))
  const occurrence = computed(() => {
    void goalOccurrences.value // reactive dep on the flat array
    return goal.value ? app.occurrenceOn(id.value, today.value) : undefined
  })

  // Open while the reader is entering an actual value.
  const captureOpen = ref(false)

  function onTick() {
    const occ = occurrence.value
    if (!occ) return
    // A metric day asks for the number rather than assuming the target was hit.
    if (metricOn.value && occ.status !== 'done') {
      captureOpen.value = true
      return
    }
    // Non-metric, or un-ticking a done metric day → plain toggle.
    app.toggleOccurrenceDone(id.value, today.value)
  }
  function onSave(payload: { actual: number; note: string | null }) {
    app.captureOccurrence(id.value, today.value, payload.actual, payload.note)
    captureOpen.value = false
  }
  function onSkip() {
    app.skipOccurrence(id.value, today.value)
    captureOpen.value = false
  }
  function onMissed(payload: { actual: number; note: string | null }) {
    // Store the actual as entered, but record the day as missed.
    app.captureOccurrence(id.value, today.value, payload.actual, payload.note)
    app.markOccurrenceMissed(id.value, today.value)
    captureOpen.value = false
  }
  function onCancel() {
    captureOpen.value = false
  }

  // "400 / 500 · 80%" once captured, with the flags a caller colours it by.
  const label = computed<TodayLabel | null>(() => {
    const occ = occurrence.value
    const metric = goal.value?.metric
    if (!occ || !metric?.enabled || occ.actual == null) return null
    const outcome = captureOutcome(metric, occ.actual)
    return {
      text: `${occ.actual} / ${occ.target} · ${outcome.pct}%${outcome.hit ? ' ✓' : ''}`,
      hit: outcome.hit,
      missed: occ.status === 'missed',
    }
  })

  return {
    goal,
    recurring,
    metricOn,
    today,
    occurrence,
    captureOpen,
    label,
    onTick,
    onSave,
    onSkip,
    onMissed,
    onCancel,
  }
}

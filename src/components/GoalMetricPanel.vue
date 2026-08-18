<script setup lang="ts">
// Recurring-goal panel for the goal detail (task 11). Holds the recurrence +
// metric config editor, and — when recurring — today's occurrence with a tick
// control. Ticking a metric-enabled occurrence opens the capture popover
// (MetricCapturePopover) instead of marking it done immediately; the entered
// actual is stored and the outcome (hit / short) is reflected inline.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import MetricCapturePopover from '@/components/MetricCapturePopover.vue'
import { useGoalToday } from '@/composables/useGoalToday'
import GoalMetricChart from '@/components/GoalMetricChart.vue'
import type { MetricDirection, MetricUnit } from '@/utils/goalMetrics'
import type { RecurrenceFreq } from '@/utils/recurrence'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

// configOnly hides today's occurrence row + the stats chart, so the create
// slide-over can reuse just the recurrence/metric editor for a brand-new goal.
const props = defineProps<{ goalId: number; configOnly?: boolean }>()
const app = useAppStore()
const { c, s } = useStyles()
const { goals } = storeToRefs(app)

const goal = computed(() => goals.value.find((g) => g.id === props.goalId))
const recurring = computed(() => !!goal.value?.recurrence?.enabled)
const metricOn = computed(() => !!goal.value?.metric?.enabled)

const FREQ_OPTS: { v: RecurrenceFreq; label: string }[] = [
  { v: 'daily', label: 'Every day' },
  { v: 'weekdays', label: 'Weekdays' },
  { v: 'weekly', label: 'Weekly' },
  { v: 'custom', label: 'Custom days' },
]
const UNIT_OPTS: MetricUnit[] = ['count', 'USD', 'INR', 'mins', 'kg']
const DIR_OPTS: { v: MetricDirection; label: string }[] = [
  { v: 'at_least', label: 'At least' },
  { v: 'at_most', label: 'At most' },
  { v: 'exact', label: 'Exactly' },
]
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// --- recurrence edits (patch the whole nested object each time) ---------------
function toggleRecurring(on: boolean) {
  if (on) app.updateGoal(props.goalId, { recurrence: app.defaultRecurrence() })
  else if (goal.value?.recurrence)
    app.updateGoal(props.goalId, { recurrence: { ...goal.value.recurrence, enabled: false } })
}
function patchRec(patch: Partial<NonNullable<typeof goal.value>['recurrence']>) {
  const rec = goal.value?.recurrence ?? app.defaultRecurrence()
  app.updateGoal(props.goalId, { recurrence: { ...rec, ...patch } })
}
function toggleDow(day: number) {
  const rec = goal.value?.recurrence
  if (!rec) return
  const set = new Set(rec.daysOfWeek)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  patchRec({ daysOfWeek: [...set].sort() })
}
function toggleMetric(on: boolean) {
  if (on) app.updateGoal(props.goalId, { metric: app.defaultMetric() })
  else if (goal.value?.metric)
    app.updateGoal(props.goalId, { metric: { ...goal.value.metric, enabled: false } })
}
function patchMetric(patch: Partial<NonNullable<typeof goal.value>['metric']>) {
  const m = goal.value?.metric ?? app.defaultMetric()
  app.updateGoal(props.goalId, { metric: { ...m, ...patch } })
}

// --- today's occurrence -------------------------------------------------------
// Shared with the goal card's own tick control (section 18b) so the rule that a
// metric day opens the capture popover cannot diverge between the two.
const {
  occurrence: todayOcc,
  captureOpen,
  label: todayLabel,
  onTick,
  onSave,
  onSkip,
  onMissed,
} = useGoalToday(() => props.goalId)

// --- styles ------------------------------------------------------------------
const box = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
  }),
)
const rowFlex = pxify({ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' })
const toggleLabel = computed(() =>
  pxify({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.value.text }),
)
const fieldLabel = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const dowRow = pxify({ display: 'flex', gap: 4 })
function dowBtn(active: boolean) {
  return pxify({
    width: 26,
    height: 26,
    borderRadius: '50%',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active ? c.value.accent : 'transparent',
    color: active ? c.value.onAccent : c.value.dim,
    cursor: 'pointer',
  })
}
const miniInput = computed(() =>
  pxify({ ...s.value.input, width: 90, padding: '5px 8px', fontSize: 12 }),
)
const todayRow = computed(() =>
  pxify({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
const todayTitle = computed(() => pxify({ fontSize: 13, fontWeight: 600, color: c.value.text }))
function outcomeText(hit: boolean, missed: boolean) {
  return pxify({
    fontSize: 12,
    fontWeight: 600,
    marginLeft: 'auto',
    color: missed ? 'oklch(0.64 0.22 25)' : hit ? 'oklch(0.72 0.15 150)' : 'oklch(0.8 0.16 72)',
  })
}
const pendingHint = computed(() => pxify({ fontSize: 12, color: c.value.dim, marginLeft: 'auto' }))
</script>

<template>
  <div v-if="goal" :style="box">
    <!-- recurring toggle -->
    <label :style="toggleLabel">
      <input
        type="checkbox"
        :checked="recurring"
        @change="toggleRecurring(($event.target as HTMLInputElement).checked)"
      />
      <span>Make it recurring</span>
    </label>

    <template v-if="recurring && goal.recurrence">
      <div :style="rowFlex">
        <select
          :style="s.select"
          :value="goal.recurrence.freq"
          @change="patchRec({ freq: ($event.target as HTMLSelectElement).value as RecurrenceFreq })"
        >
          <option v-for="f in FREQ_OPTS" :key="f.v" :value="f.v">{{ f.label }}</option>
        </select>
        <label :style="fieldLabel">at</label>
        <GlassDatePicker
          mode="time"
          size="sm"
          :model-value="goal.recurrence.timeOfDay"
          placeholder="Time"
          @update:model-value="patchRec({ timeOfDay: String($event ?? '') })"
        />
      </div>
      <div
        v-if="goal.recurrence.freq === 'weekly' || goal.recurrence.freq === 'custom'"
        :style="dowRow"
      >
        <button
          v-for="(d, i) in DOW"
          :key="i"
          :style="dowBtn(goal.recurrence.daysOfWeek.includes(i))"
          @click="toggleDow(i)"
        >
          {{ d }}
        </button>
      </div>

      <!-- metric config -->
      <label :style="toggleLabel">
        <input
          type="checkbox"
          :checked="metricOn"
          @change="toggleMetric(($event.target as HTMLInputElement).checked)"
        />
        <span>Track a number</span>
      </label>
      <div v-if="metricOn && goal.metric" :style="rowFlex">
        <input
          :style="miniInput"
          style="width: 120px"
          :value="goal.metric.label"
          placeholder="Label"
          @input="patchMetric({ label: ($event.target as HTMLInputElement).value })"
        />
        <select
          :style="s.select"
          :value="goal.metric.direction"
          @change="
            patchMetric({
              direction: ($event.target as HTMLSelectElement).value as MetricDirection,
            })
          "
        >
          <option v-for="d in DIR_OPTS" :key="d.v" :value="d.v">{{ d.label }}</option>
        </select>
        <input
          :style="miniInput"
          type="number"
          :value="goal.metric.target"
          @input="patchMetric({ target: Number(($event.target as HTMLInputElement).value) || 0 })"
        />
        <select
          :style="s.select"
          :value="goal.metric.unit"
          @change="patchMetric({ unit: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="u in UNIT_OPTS" :key="u" :value="u">{{ u }}</option>
        </select>
        <label :style="toggleLabel">
          <input
            type="checkbox"
            :checked="goal.metric.allowPartial"
            @change="patchMetric({ allowPartial: ($event.target as HTMLInputElement).checked })"
          />
          <span :style="fieldLabel">allow partial</span>
        </label>
      </div>

      <!-- today's occurrence -->
      <div v-if="todayOcc && !configOnly" :style="todayRow">
        <input
          type="checkbox"
          :checked="todayOcc.status === 'done'"
          :aria-label="'Complete today'"
          @click.prevent="onTick"
        />
        <span :style="todayTitle">Today</span>
        <span v-if="todayLabel" :style="outcomeText(todayLabel.hit, todayLabel.missed)">
          {{ todayLabel.text }}
        </span>
        <span v-else-if="todayOcc.status === 'skipped'" :style="pendingHint">skipped</span>
        <span v-else-if="todayOcc.status === 'missed'" :style="outcomeText(false, true)"
          >missed</span
        >
        <span v-else-if="todayOcc.status === 'done'" :style="outcomeText(true, false)">done ✓</span>
        <span v-else :style="pendingHint">
          target {{ goal.metric?.enabled ? goal.metric.target + ' ' + goal.metric.unit : '—' }}
        </span>

        <MetricCapturePopover
          v-if="captureOpen && goal.metric"
          :occurrence-id="todayOcc.id"
          :metric="goal.metric"
          :prompt="`How much ${goal.metric.label.toLowerCase()} today?`"
          @save="onSave"
          @skip="onSkip"
          @missed="onMissed"
          @cancel="captureOpen = false"
        />
      </div>

      <!-- streaks, rolling stats + target-vs-actual chart (task 11) -->
      <GoalMetricChart v-if="metricOn && !configOnly" :goal-id="goalId" />
    </template>
  </div>
</template>

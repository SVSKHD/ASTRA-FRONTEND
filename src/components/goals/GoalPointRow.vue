<script setup lang="ts">
import NumberInput from '@/components/ui/NumberInput.vue'
// One point on a goal (section 20b).
//
// It used to be a fixed-height single-line input, so a point like "truthiness,
// == vs ===, and the coercion table" was cut off mid-sentence with no way to
// read the rest but clicking in and scrolling sideways. The text field is now an
// auto-growing textarea: three lines of text render as three lines.
//
// The row is a three-track grid — checkbox, text, controls — with the checkbox
// and the controls aligned to the TOP rather than the centre, so on a three-line
// point the checkbox still sits beside the first line where it belongs.
//
// The controls stay out of the way until they are wanted: the estimate reads as
// plain muted text and only becomes a field when clicked, and due/timer/delete
// appear on hover. A touch device has no hover, so there they collapse into a
// single ⋯ rather than three permanently visible buttons.
import { computed, nextTick, ref } from 'vue'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Icon from '@/components/ui/Icon.vue'
import PointLearnings from '@/components/goals/PointLearnings.vue'
import PointSubtasks from '@/components/goals/PointSubtasks.vue'
import PointDetailDialog from '@/components/goals/PointDetailDialog.vue'
import { pointProgress } from '@/utils/milestoneProgress'
import { formatMinutes } from '@/utils/detailFields'
import type { GoalChecklistItem } from '@/types'

// `locked`: the milestone is closed, so the row is read-only until reopened.
const props = defineProps<{
  point: GoalChecklistItem
  spent: number
  mobile?: boolean
  locked?: boolean
}>()
const emit = defineEmits<{
  toggle: []
  'update:text': [string]
  commit: []
  'update:estimate': [number | null]
  'update:due': [string]
  'toggle-timer': []
  remove: []
}>()

// --- the text -----------------------------------------------------------------
// Escape puts back what was there when the row was focused, so a mistyped edit
// costs nothing.
const before = ref('')
function onFocus() {
  before.value = props.point.text
}
function onRevert() {
  emit('update:text', before.value)
}

// --- the estimate ---------------------------------------------------------------
// Plain text until clicked. "180m" reads as information; a bordered number field
// on every row reads as ten things to fill in.
const editingEstimate = ref(false)
const draftEstimate = ref<number | null>(null)
const estimateField = ref<InstanceType<typeof NumberInput> | null>(null)
async function editEstimate() {
  draftEstimate.value = props.point.estimateMins ?? null
  editingEstimate.value = true
  await nextTick()
  estimateField.value?.focus()
}
// The control parses; this only decides what an empty field means. An emptied
// estimate clears it, and anything unreadable never reaches here at all — the
// number field holds the last good value rather than handing over a zero.
function commitEstimate() {
  editingEstimate.value = false
  emit('update:estimate', draftEstimate.value === null ? null : Math.max(0, draftEstimate.value))
}

const running = computed(() => props.point.timerStartedAt != null)
const estimateLabel = computed(() =>
  props.point.estimateMins == null ? '' : formatMinutes(props.point.estimateMins),
)

// On touch the extra controls hide behind one button rather than crowding the
// row; on a pointer device they appear on hover.
const expanded = ref(false)
const showExtras = computed(() => !props.mobile || expanded.value)

// What this point taught, opened under the row. The count stays visible once
// there is one, so a glance down the list shows which points have notes.
const learnt = computed(() => props.point.learnings?.length ?? 0)
const showLearnings = ref(false)

// The point's subtasks, folded under it like a task group (spec 3.3). The chip
// reads "2/4" once there are any; before that it offers to add the first.
const subCount = computed(() => props.point.subtasks?.length ?? 0)
const subProgress = computed(() => pointProgress(props.point))
const showSubtasks = ref(false)
const subtaskList = ref<InstanceType<typeof PointSubtasks> | null>(null)
async function toggleSubtasks() {
  showSubtasks.value = !showSubtasks.value
  if (showSubtasks.value && !subCount.value) {
    await nextTick()
    subtaskList.value?.focusAdd()
  }
}

// The point opened in full (PointDetailDialog).
const detailOpen = ref(false)
</script>

<template>
  <div class="gpr" :class="[mobile && 'gpr--touch', locked && 'gpr--locked']">
    <button
      type="button"
      class="gpr__box"
      :class="point.done && 'gpr__box--on'"
      :disabled="locked"
      :aria-label="point.done ? 'Mark not done' : 'Mark done'"
      @click="emit('toggle')"
    >
      <Icon v-if="point.done" name="check" size="xs" />
    </button>

    <AutoTextarea
      class="gpr__text"
      label="Point"
      placeholder="Untitled point"
      :model-value="point.text"
      :done="point.done"
      :disabled="locked"
      @update:model-value="emit('update:text', $event)"
      @commit="emit('commit')"
      @revert="onRevert"
      @focus="onFocus"
    />

    <div class="gpr__controls">
      <!-- The whole point, opened: description, timeline, subtasks, learnings. -->
      <button
        type="button"
        class="gpr__open"
        :class="{ 'has-detail': !!point.description }"
        :aria-label="`Open point: ${point.text || 'Untitled point'}`"
        :title="point.description ? 'Open — this point has a description' : 'Open the point'"
        data-testid="open-point"
        @click="detailOpen = true"
      >
        <Icon name="maximize" size="xs" />
      </button>
      <button
        v-if="subCount || !locked"
        type="button"
        class="gpr__subs"
        :class="{
          'gpr__subs--empty': !subCount,
          'is-open': showSubtasks,
          'is-complete': subCount && subProgress.done === subProgress.total,
        }"
        :aria-expanded="showSubtasks"
        :title="subCount ? 'Subtasks' : 'Break this point into subtasks'"
        @click="toggleSubtasks"
      >
        <Icon name="list-checks" size="xs" />{{
          subCount ? `${subProgress.done}/${subProgress.total}` : 'Subtasks'
        }}
      </button>
      <button
        type="button"
        class="gpr__learnt"
        :class="{ 'gpr__learnt--empty': !learnt, 'is-open': showLearnings }"
        :aria-expanded="showLearnings"
        :title="learnt ? 'What this point taught' : 'Write down what you learnt'"
        @click="showLearnings = !showLearnings"
      >
        <Icon name="lightbulb" size="xs" />{{ learnt ? `Learnt · ${learnt}` : 'Learnt' }}
      </button>
      <!-- Estimate: text at rest, field on click. -->
      <NumberInput
        v-if="editingEstimate"
        ref="estimateField"
        class="gpr__mins"
        size="sm"
        :min="0"
        aria-label="Estimate in minutes"
        :model-value="draftEstimate"
        @update:model-value="draftEstimate = $event"
        @blur="commitEstimate"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      />
      <button
        v-else
        type="button"
        class="gpr__estimate"
        :class="!estimateLabel && 'gpr__estimate--empty'"
        :title="estimateLabel ? 'Estimated time' : 'Add an estimate'"
        @click="editEstimate"
      >
        {{ estimateLabel || 'est' }}
      </button>

      <!-- Touch: one button instead of three. -->
      <button
        v-if="mobile"
        type="button"
        class="gpr__more"
        :aria-label="expanded ? 'Hide point actions' : 'Point actions'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <Icon name="more-horizontal" size="sm" />
      </button>

      <div v-show="showExtras && !locked" class="gpr__extras">
        <GlassDatePicker
          size="sm"
          clearable
          placeholder="due"
          :model-value="point.dueAt"
          @update:model-value="emit('update:due', String($event ?? ''))"
        />
        <button
          type="button"
          class="gpr__mini"
          :class="{ 'is-running': running }"
          :title="running ? 'Stop the timer' : 'Start the timer'"
          @click="emit('toggle-timer')"
        >
          <Icon :name="running ? 'pause' : 'timer'" size="xs" />{{ formatMinutes(spent) }}
        </button>
        <button
          type="button"
          class="gpr__mini gpr__mini--icon gpr__mini--danger"
          aria-label="Delete point"
          title="Delete point"
          @click="emit('remove')"
        >
          <Icon name="trash" size="xs" />
        </button>
      </div>
    </div>

    <PointSubtasks
      v-if="showSubtasks"
      ref="subtaskList"
      class="gpr__learnings"
      :point-id="point.id"
      :subtasks="point.subtasks ?? []"
      :locked="locked"
    />
    <PointLearnings v-if="showLearnings" class="gpr__learnings" :point-id="point.id" />
    <PointDetailDialog
      v-if="detailOpen"
      :open="detailOpen"
      :point-id="point.id"
      :spent="spent"
      :locked="locked"
      @close="detailOpen = false"
    />
  </div>
</template>

<style scoped>
.gpr {
  display: grid;
  grid-template-columns: auto 1fr auto;
  /* Top, not centre: on a three-line point the checkbox belongs beside the
     first line, not floating halfway down it. */
  align-items: start;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  /* A hairline between rows rather than a box around each one. */
  border-bottom: 1px solid color-mix(in oklch, var(--theme-dim) 14%, transparent);
}
.gpr:last-child {
  border-bottom: none;
}
.gpr__box {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  /* Nudged down to sit on the first line's baseline rather than its box top. */
  margin-top: 3px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--glass-border);
  background: transparent;
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  cursor: pointer;
}
.gpr__box--on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.gpr__text {
  min-width: 0;
}
/* Fixed column, top-aligned, never wrapping into the text. */
.gpr__controls {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: nowrap;
  white-space: nowrap;
  margin-top: 1px;
}
.gpr__estimate {
  padding: 2px var(--sp-1);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-family: inherit;
  cursor: pointer;
}
.gpr__estimate:hover {
  border-color: var(--glass-border);
}
/* With no estimate set the placeholder stays out of the way until the row is. */
.gpr__estimate--empty {
  opacity: 0;
}
.gpr:hover .gpr__estimate--empty,
.gpr__estimate--empty:focus-visible {
  opacity: 0.7;
}
.gpr__mins {
  width: 72px;
  padding: 2px var(--sp-1);
  border-radius: var(--radius-sm);
  border: 1px solid var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-family: inherit;
}
.gpr__more {
  display: inline-grid;
  place-items: center;
  padding: 0 var(--sp-1);
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  line-height: 1;
  cursor: pointer;
}
/* Quiet until the row is hovered. Kept in the layout rather than removed, so
   nothing shifts sideways when it appears. */
.gpr__extras {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) var(--ease-out, ease);
}
.gpr:hover .gpr__extras,
.gpr:focus-within .gpr__extras {
  opacity: 1;
}
/* A touch device has no hover, so what is shown there is shown properly. */
.gpr--touch .gpr__extras {
  opacity: 1;
}
.gpr--touch .gpr__estimate--empty {
  opacity: 0.7;
}
.gpr__mini {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  cursor: pointer;
  white-space: nowrap;
}
.gpr__mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.gpr__mini:hover {
  color: var(--theme-text);
}
/* A running timer is the one control that should catch the eye. */
.gpr__mini.is-running {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.gpr__mini--icon {
  padding: var(--sp-1);
}
.gpr__mini--danger:hover {
  border-color: color-mix(in oklch, var(--theme-danger) 50%, transparent);
  color: var(--theme-danger);
}
.gpr__open {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.gpr__open.has-detail {
  border-color: color-mix(in oklch, var(--theme-accent) 35%, transparent);
  color: var(--theme-accent);
}
.gpr__learnt {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in oklch, var(--theme-accent) 35%, transparent);
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.gpr__learnt.is-open {
  background: color-mix(in oklch, var(--theme-accent) 20%, transparent);
}
/* With nothing learnt yet it waits for the row to be hovered, like the
   estimate placeholder does. */
.gpr__learnt--empty:not(.is-open) {
  border-color: transparent;
  background: transparent;
  color: var(--theme-dim);
  opacity: 0;
}
.gpr:hover .gpr__learnt--empty,
.gpr__learnt--empty:focus-visible,
.gpr--touch .gpr__learnt--empty {
  opacity: 0.8;
}
.gpr__learnings {
  grid-column: 1 / -1;
}
/* Subtasks: a count while folded, green once every one is checked. */
.gpr__subs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.gpr__subs.is-open {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.gpr__subs.is-complete {
  color: var(--theme-success);
}
.gpr__subs--empty:not(.is-open) {
  border-color: transparent;
  color: var(--theme-dim);
  opacity: 0;
}
.gpr:hover .gpr__subs--empty,
.gpr__subs--empty:focus-visible,
.gpr--touch .gpr__subs--empty {
  opacity: 0.8;
}
.gpr--locked .gpr__box {
  cursor: default;
}
</style>

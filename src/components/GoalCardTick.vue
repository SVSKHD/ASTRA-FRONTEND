<script setup lang="ts">
// Today's tick on a goal card (section 18b, acceptance 89).
//
// The card as a whole opens the goal dialog; this control does not. It is the
// one place on the card where a click means "record today", and on a
// metric-enabled goal that means opening the capture popover to ask for the
// number rather than assuming the target was met.
//
// The logic is useGoalToday, shared with the detail panel, so the two cannot
// drift into disagreeing about what a tick does.
import { useGoalToday } from '@/composables/useGoalToday'
import MetricCapturePopover from '@/components/MetricCapturePopover.vue'

const props = defineProps<{ goalId: number }>()

const {
  recurring,
  occurrence,
  captureOpen,
  label,
  onTick,
  onSave,
  onSkip,
  onMissed,
  onCancel,
  goal,
} = useGoalToday(() => props.goalId)
</script>

<template>
  <span v-if="recurring && occurrence" class="gct" @click.stop>
    <button
      type="button"
      class="gct__box"
      :class="occurrence.status === 'done' && 'gct__box--on'"
      :aria-label="occurrence.status === 'done' ? 'Undo today' : 'Complete today'"
      :title="occurrence.status === 'done' ? 'Undo today' : 'Complete today'"
      @click.stop="onTick"
    >
      <span v-if="occurrence.status === 'done'" aria-hidden="true">✓</span>
      <span v-else-if="occurrence.status === 'missed'" aria-hidden="true">×</span>
    </button>
    <span
      v-if="label"
      class="gct__label"
      :class="label.hit ? 'gct__label--hit' : 'gct__label--short'"
    >
      {{ label.text }}
    </span>
    <span v-else-if="occurrence.status === 'skipped'" class="gct__label">skipped</span>

    <MetricCapturePopover
      v-if="captureOpen && goal?.metric"
      :occurrence-id="occurrence.id"
      :metric="goal.metric"
      prompt="How did today go?"
      @save="onSave"
      @skip="onSkip"
      @missed="onMissed"
      @cancel="onCancel"
    />
  </span>
</template>

<style scoped>
.gct {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  position: relative;
}
.gct__box {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
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
.gct__box--on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.gct__label {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  white-space: nowrap;
}
.gct__label--hit {
  color: var(--theme-success);
}
.gct__label--short {
  color: var(--theme-warning);
}
</style>

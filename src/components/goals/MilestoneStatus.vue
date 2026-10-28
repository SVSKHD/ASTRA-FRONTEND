<script setup lang="ts">
// A milestone's state and dates, the same everywhere it is shown.
//
// The state is a word and a glyph, never colour alone (spec 6): "Not started",
// "In progress", "Overdue", "Completed". `full` adds the dates line — start →
// deadline, the inclusive duration, and days left or overdue — and how many
// subtasks remain.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'
import { ymd } from '@/utils/dayGroups'
import {
  STATE_LABEL,
  deadlineLabel,
  durationDays,
  milestoneState,
  type MilestoneState,
} from '@/utils/milestoneProgress'

const props = defineProps<{ goalId: number; full?: boolean }>()
const app = useAppStore()
// The ui store's clock ticks over at midnight, so "today" moves on its own.
const { now } = storeToRefs(useUiStore())
const today = computed(() => ymd(new Date(now.value)))

const goal = computed(() => app.goals.find((g) => g.id === props.goalId))
const progress = computed(() => app.goalProgress(props.goalId))
const state = computed<MilestoneState>(() =>
  goal.value ? milestoneState(goal.value, progress.value, today.value) : 'not_started',
)
const ICON: Record<MilestoneState, IconName> = {
  not_started: 'circle-dashed',
  in_progress: 'circle-dot',
  overdue: 'triangle-alert',
  completed: 'circle-check',
}
const days = computed(() =>
  goal.value ? durationDays(goal.value.startDate, goal.value.targetDate) : null,
)
const left = computed(() =>
  goal.value && state.value !== 'completed'
    ? deadlineLabel(goal.value.targetDate, today.value)
    : null,
)
const remaining = computed(() => progress.value.total - progress.value.done)
const fmt = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
</script>

<template>
  <span v-if="goal" class="mst" :class="{ 'is-full': full }">
    <span class="mst__badge" :class="`is-${state}`">
      <Icon :name="ICON[state]" size="xs" />{{ STATE_LABEL[state] }}
    </span>
    <template v-if="full">
      <span v-if="goal.startDate || goal.targetDate" class="mst__item">
        <Icon name="calendar-range" size="xs" />
        {{ goal.startDate ? fmt(goal.startDate) : '…' }} →
        {{ goal.targetDate ? fmt(goal.targetDate) : '…' }}
        <template v-if="days"> · {{ days }} day{{ days === 1 ? '' : 's' }}</template>
      </span>
      <span v-if="left" class="mst__item" :class="{ 'is-late': state === 'overdue' }">
        <Icon name="clock" size="xs" />{{ left }}
      </span>
      <span v-if="progress.total && state !== 'completed'" class="mst__item">
        <Icon name="list-checks" size="xs" />{{
          remaining ? `${remaining} of ${progress.total} left` : 'All checked'
        }}
      </span>
    </template>
  </span>
</template>

<style scoped>
.mst {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.mst__badge,
.mst__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.mst__badge {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
}
.mst__badge.is-not_started {
  color: var(--theme-dim);
}
.mst__badge.is-in_progress {
  color: var(--theme-accent);
}
.mst__badge.is-overdue {
  color: var(--theme-danger);
}
.mst__badge.is-completed {
  color: var(--theme-success);
}
.mst__item {
  color: var(--theme-dim);
  font-weight: var(--weight-medium);
}
.mst__item.is-late {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
</style>

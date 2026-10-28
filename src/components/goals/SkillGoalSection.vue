<script setup lang="ts">
// One goal and its milestones in the list (spec 3.2).
//
// The header is the goal at a glance: title, start → target, a progress bar
// weighted by every milestone's real subtask count, and how many milestones are
// closed. It folds like every list accordion and remembers that per goal. The
// milestones under it arrive in timeline order. `goalId` null is the "No goal"
// group for milestones that belong to none.
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAccordionState } from '@/composables/useAccordionState'
import Caret from '@/components/ui/Caret.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'
import Dropdown, { type MenuItem } from '@/components/ui/Dropdown.vue'

const props = defineProps<{ goalId: number | null; count: number }>()
const emit = defineEmits<{ edit: []; 'add-milestone': [] }>()
const app = useAppStore()
const acc = useAccordionState()

const goal = computed(() => (props.goalId != null ? app.skillGoalById(props.goalId) : undefined))
const stats = computed(() => (props.goalId != null ? app.skillGoalProgress(props.goalId) : null))
const key = computed(() => 'milestones:goal:' + (props.goalId ?? 'none'))
const open = computed(() => acc.isOpen(key.value, true))

const MENU: MenuItem[] = [
  { value: 'add', label: 'Add milestone', icon: 'plus' },
  { value: 'edit', label: 'Edit goal', icon: 'pencil' },
  { value: 'delete', label: 'Delete goal', icon: 'trash', danger: true },
]
function onMenu(v: string) {
  if (v === 'add') emit('add-milestone')
  else if (v === 'edit') emit('edit')
  else if (v === 'delete' && props.goalId != null) app.removeSkillGoal(props.goalId)
}
const fmt = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
</script>

<template>
  <section class="sgs rx-acc" :class="{ 'is-open': open }">
    <header class="sgs__head">
      <button
        type="button"
        class="sgs__toggle rx-head ui-focus-ring"
        :aria-expanded="open"
        @click="acc.toggle(key, true)"
      >
        <Caret :open="open" />
        <span class="sgs__title">{{ goal ? goal.title : 'No goal' }}</span>
        <span class="sgs__count">{{ count }}</span>
      </button>
      <Dropdown v-if="goal" label="Goal actions" variant="icon" :items="MENU" @select="onMenu" />
    </header>
    <div v-if="goal && stats" class="sgs__meta">
      <span v-if="goal.startDate || goal.targetDate" class="sgs__item">
        <Icon name="calendar-range" size="xs" />
        {{ goal.startDate ? fmt(goal.startDate) : '…' }} →
        {{ goal.targetDate ? fmt(goal.targetDate) : '…' }}
      </span>
      <span class="sgs__item">
        <Icon name="flag" size="xs" />{{ stats.closed }}/{{ stats.milestones }} milestones closed
      </span>
      <span class="sgs__item">
        <Icon name="list-checks" size="xs" />{{ stats.done }}/{{ stats.total }} checked
      </span>
      <div class="sgs__bar">
        <ProgressBar
          size="sm"
          solid
          :value="stats.done"
          :max="Math.max(1, stats.total)"
          :label="`${goal.title}: ${Math.round(stats.ratio * 100)}% complete`"
        />
        <span class="sgs__pct">{{ Math.round(stats.ratio * 100) }}%</span>
      </div>
    </div>
    <div class="sgs__body rx-body" :inert="!open">
      <div class="sgs__clip">
        <div class="sgs__inner rx-reveal" :class="{ 'is-open': open }">
          <slot />
          <button
            v-if="goal && !count"
            type="button"
            class="sgs__empty"
            @click="emit('add-milestone')"
          >
            <Icon name="plus" size="xs" />No milestones yet — add the first
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sgs {
  flex-shrink: 0;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-card);
  overflow: hidden;
}
.sgs__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding-right: var(--sp-2);
}
.sgs__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  text-align: left;
  cursor: pointer;
}
.sgs__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sgs__count {
  color: var(--theme-dim);
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
}
.sgs__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: 0 var(--sp-3) var(--sp-3) calc(var(--sp-3) + 26px);
}
.sgs__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}
.sgs__bar {
  flex: 1 1 160px;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 120px;
}
.sgs__bar > :first-child {
  flex: 1;
  min-width: 0;
}
.sgs__pct {
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.sgs__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-med) var(--ease-out);
}
.sgs.is-open .sgs__body {
  grid-template-rows: 1fr;
}
.sgs__clip {
  min-height: 0;
  overflow: hidden;
}
.sgs__inner {
  padding: 0 var(--sp-3) var(--sp-3);
}
.sgs__empty {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px dashed var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-family: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}
.sgs__empty:hover {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
@media (prefers-reduced-motion: reduce) {
  .sgs__body {
    transition: none;
  }
}
</style>

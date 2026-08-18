<script setup lang="ts">
// What the dialog shows in the moment before its body arrives (section 18b:
// "never show an empty spinner-only dialog").
//
// It draws only what the list row the reader just clicked already had on it —
// status, project, progress — from the same store the row read. Nothing is
// fetched, so it is up on the first frame, and the full body replaces it in
// place rather than after a spinner.
//
// It takes no props because it stands in for a lazily-loaded component, which
// Vue mounts without any: the frame it describes comes from the store.
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { buildIndex, progressOf } from '@/utils/taskTree'
import { STATUS_LABEL } from '@/types'

const app = useAppStore()

const frame = computed(() => app.detailFrame)
const task = computed(() =>
  frame.value?.kind === 'task' ? app.tasks.find((t) => t.id === frame.value?.id) : undefined,
)
const goal = computed(() =>
  frame.value?.kind === 'goal' ? app.goals.find((g) => g.id === frame.value?.id) : undefined,
)
const subtasks = computed(() =>
  task.value ? progressOf(buildIndex(app.tasks), task.value.id, (t) => t.status === 'done') : null,
)
const goalProgress = computed(() => (goal.value ? app.goalProgress(goal.value.id) : null))
</script>

<template>
  <div class="peek">
    <template v-if="task">
      <span class="peek__chip">{{ STATUS_LABEL[task.status] }}</span>
      <span v-if="task.tag" class="peek__chip">{{ task.tag }}</span>
      <span v-if="subtasks && subtasks.total > 1" class="peek__chip">
        {{ subtasks.done }}/{{ subtasks.total }} done
      </span>
    </template>
    <template v-else-if="goal">
      <span class="peek__chip">{{ goal.status }}</span>
      <span v-if="goalProgress" class="peek__chip">
        {{ goalProgress.done }}/{{ goalProgress.total }} done
      </span>
    </template>
    <div class="peek__bar" aria-hidden="true"></div>
    <div class="peek__bar peek__bar--short" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.peek {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.peek__chip {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  color: var(--theme-dim);
  font-size: var(--text-xs);
  text-transform: capitalize;
}
.peek__bar {
  width: 100%;
  height: 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--theme-dim) 18%, transparent);
}
.peek__bar--short {
  width: 60%;
}
@media (prefers-reduced-motion: no-preference) {
  .peek__bar {
    animation: peekPulse 1.4s ease-in-out infinite;
  }
}
@keyframes peekPulse {
  50% {
    opacity: 0.45;
  }
}
</style>

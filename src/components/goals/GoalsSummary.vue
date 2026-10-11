<script setup lang="ts">
// The line above the goals grid: the whole set in five numbers — active goals,
// average progress, what is due in the next two weeks, what is overdue, and
// what is done. Archived goals count for none of it.
//
// One quiet row in the same card the rows use, not a band of tiles: it is a
// summary to glance at, and it should not outweigh the goals under it. Active
// and Done are statuses, so those two are buttons that filter the grid.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { GoalStatus } from '@/types'

defineProps<{ status: GoalStatus | 'all' }>()
const emit = defineEmits<{ filter: [GoalStatus | 'all'] }>()

const app = useAppStore()
const { goals } = storeToRefs(app)

const SOON_DAYS = 14
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

const stats = computed(() => {
  const live = goals.value.filter((g) => g.status !== 'archived')
  const open = live.filter((g) => g.status !== 'done')
  const today = dayKey(new Date())
  const soonDate = new Date()
  soonDate.setDate(soonDate.getDate() + SOON_DAYS)
  const soon = dayKey(soonDate)
  const ratios = open.map((g) => app.goalProgress(g.id).ratio)
  const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0
  return {
    active: live.filter((g) => g.status === 'active').length,
    avg: Math.round(avg * 100),
    dueSoon: open.filter((g) => g.targetDate && g.targetDate >= today && g.targetDate <= soon)
      .length,
    overdue: open.filter((g) => g.targetDate && g.targetDate < today).length,
    done: live.filter((g) => g.status === 'done').length,
  }
})
</script>

<template>
  <section class="gsum" aria-label="Goals at a glance">
    <button
      type="button"
      class="gsum__stat gsum__stat--btn"
      :class="{ 'is-on': status === 'active' }"
      :aria-pressed="status === 'active'"
      title="Show active goals"
      @click="emit('filter', status === 'active' ? 'all' : 'active')"
    >
      <span class="gsum__value">{{ stats.active }}</span>
      <span class="gsum__label">Active</span>
    </button>
    <div class="gsum__stat gsum__stat--grow">
      <span class="gsum__value">{{ stats.avg }}%</span>
      <span class="gsum__label">Average progress</span>
      <span class="gsum__bar" aria-hidden="true">
        <span class="gsum__bar-fill" :style="{ width: stats.avg + '%' }" />
      </span>
    </div>
    <div class="gsum__stat">
      <span class="gsum__value">{{ stats.dueSoon }}</span>
      <span class="gsum__label">Due in 2 weeks</span>
    </div>
    <div class="gsum__stat" :class="{ 'is-alert': stats.overdue > 0 }">
      <span class="gsum__value">{{ stats.overdue }}</span>
      <span class="gsum__label">Overdue</span>
    </div>
    <button
      type="button"
      class="gsum__stat gsum__stat--btn"
      :class="{ 'is-on': status === 'done' }"
      :aria-pressed="status === 'done'"
      title="Show completed goals"
      @click="emit('filter', status === 'done' ? 'all' : 'done')"
    >
      <span class="gsum__value">{{ stats.done }}</span>
      <span class="gsum__label">Completed</span>
    </button>
  </section>
</template>

<style scoped>
/* The rows' card, holding five figures side by side. */
.gsum {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--theme-border);
  border-radius: 18px;
  background: var(--theme-card);
}
.gsum__stat {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
}
.gsum__stat--grow {
  flex: 1 1 200px;
}
.gsum__stat--btn {
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.gsum__stat--btn:hover {
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.gsum__stat--btn.is-on {
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}
.gsum__stat--btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.gsum__value {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.gsum__label {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.gsum__stat.is-alert .gsum__value {
  color: var(--theme-danger);
}
.gsum__bar {
  flex: 1 0 100%;
  height: 3px;
  overflow: hidden;
  border-radius: 2px;
  background: color-mix(in oklch, var(--theme-text) 9%, transparent);
}
.gsum__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--theme-accent);
}
</style>

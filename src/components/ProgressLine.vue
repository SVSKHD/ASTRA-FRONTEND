<script setup lang="ts">
// "7 of 18 done · 39%" atop a list, over the existing liquid progress bar. Pure
// presentation — the counts come from utils/listSplit's stats.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import ProgressBar from '@/components/ui/ProgressBar.vue'

const props = defineProps<{ done: number; total: number }>()
const { c } = useStyles()

const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
const labelStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    color: c.value.dim,
    display: 'block',
    fontWeight: 'var(--weight-semibold)',
  }),
)
const headStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--sp-2)',
    marginBottom: 6,
  }),
)
</script>

<template>
  <div v-if="total > 0">
    <div :style="headStyle">
      <span :style="labelStyle">{{ done }} of {{ total }} done · {{ pct }}%</span>
      <slot />
    </div>
    <ProgressBar class="progress-line__bar" :value="done" :max="total" />
  </div>
</template>

<style scoped>
/* The last beat of a completion (Todo v2, 4a): the bar moves after the
   checkbox has popped and the strike has drawn, not at the same instant. */
.progress-line__bar :deep(.ui-progress__fill) {
  transition: width 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .progress-line__bar :deep(.ui-progress__fill) {
    transition: none;
  }
}
</style>

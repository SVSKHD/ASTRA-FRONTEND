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
    <!-- The last beat of a completion (Todo v2, 4a): the bar moves after the
         checkbox has popped and the strike has drawn, not at the same instant. -->
    <ProgressBar :value="done" :max="total" :delay="150" />
  </div>
</template>

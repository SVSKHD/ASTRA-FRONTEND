<script setup lang="ts">
// "7 of 18 done · 39%" atop a list, over the existing liquid progress bar. Pure
// presentation — the counts come from utils/listSplit's stats.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import ProgressBar from '@/components/ui/ProgressBar.vue'

const props = defineProps<{ done: number; total: number }>()
const { c } = useStyles()

const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
const labelStyle = computed(() =>
  pxify({ fontSize: 12, color: c.value.dim, marginBottom: 6, display: 'block', fontWeight: 600 }),
)
</script>

<template>
  <div v-if="total > 0">
    <span :style="labelStyle">{{ done }} of {{ total }} done · {{ pct }}%</span>
    <ProgressBar :value="done" :max="total" />
  </div>
</template>

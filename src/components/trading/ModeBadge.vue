<script setup lang="ts">
// The execution mode, always on screen (Prompt 11, item 8). OBSERVE and PAPER
// (simulated fills, Phase F) are reachable today; LIVE needs Phase G.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{ mode: string; label?: string }>()
const tone = computed(() =>
  props.mode === 'LIVE' ? 'danger' : props.mode === 'PAPER' ? 'warning' : 'info',
)
</script>

<template>
  <Badge :tone="tone" :label="label ? `${label}: ${mode}` : mode" />
</template>

<script setup lang="ts">
// Who opened a trade: My trade / Bot / Guardian-managed / Unknown. The word
// carries the meaning; the tone only repeats it.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { dhanOriginBadge, originBadge } from '@/trading/origins'

const props = defineProps<{
  origin: string | null | undefined
  guardianTouched?: boolean | null
  /** Dhan orders are tagged aureon | manual instead. */
  broker?: 'mt5' | 'dhan'
}>()
const b = computed(() =>
  props.broker === 'dhan'
    ? dhanOriginBadge(props.origin)
    : originBadge(props.origin, props.guardianTouched),
)
</script>

<template>
  <Badge :tone="b.tone" :label="b.label" />
</template>

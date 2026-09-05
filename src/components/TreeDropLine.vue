<script setup lang="ts">
// The REORDER drop indicator: a 2px line at the insertion point, inset to the
// resolved indent (so promotion/nesting reads visually) with a small circle cap
// at its left end. Accent when the drop is valid, red when it would cycle. Placed
// as an absolute overlay by the row (which is position:relative), at its top edge
// for an "above" insertion or its bottom edge for "below".
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { INDENT_PX } from '@/composables/useTreeDrag'
import { DANGER } from '@/styles'

const props = defineProps<{
  side: 'above' | 'below'
  indentDepth: number
  valid: boolean
  // Base left inset (px) of the sibling group this row sits in.
  baseInset?: number
}>()

const { c } = useStyles()
const color = computed(() => (props.valid ? c.value.accent : DANGER))
const left = computed(() => (props.baseInset ?? 0) + props.indentDepth * INDENT_PX)

const lineStyle = computed(() => ({
  position: 'absolute' as const,
  left: left.value + 'px',
  right: '4px',
  height: '2px',
  background: color.value,
  borderRadius: '2px',
  zIndex: 6,
  pointerEvents: 'none' as const,
  top: props.side === 'above' ? '-1px' : 'auto',
  bottom: props.side === 'below' ? '-1px' : 'auto',
}))
const capStyle = computed(() => ({
  position: 'absolute' as const,
  left: '-3px',
  top: '-3px',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  border: '2px solid ' + color.value,
  background: c.value.card,
  boxSizing: 'border-box' as const,
}))
</script>

<template>
  <div :style="lineStyle">
    <span :style="capStyle"></span>
  </div>
</template>

<script setup lang="ts">
// Derived-progress bar for a parent's directly-linked children. Liquid/glass
// fill in the theme accent, flipping to a success colour at 100%. Presentational
// only — the counts come from useLinkedItems.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

const props = defineProps<{ done: number; total: number; compact?: boolean }>()

const { c } = useStyles()

const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
const complete = computed(() => props.total > 0 && props.done >= props.total)
const fillColor = computed(() => (complete.value ? 'oklch(0.72 0.15 150)' : c.value.accent))

const trackStyle = computed(() =>
  pxify({
    position: 'relative',
    height: props.compact ? 3 : 8,
    borderRadius: 999,
    background: c.value.input,
    overflow: 'hidden',
    width: '100%',
  }),
)
const fillStyle = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: pct.value + '%',
    borderRadius: 999,
    background:
      'linear-gradient(90deg, ' +
      fillColor.value +
      ' 0%, color-mix(in oklch, ' +
      fillColor.value +
      ' 70%, white) 100%)',
    boxShadow: props.compact ? 'none' : '0 0 10px ' + fillColor.value,
    transition: 'width .45s cubic-bezier(.4,1,.4,1), background .3s ease',
  }),
)
const labelStyle = computed(() =>
  pxify({ fontSize: 11, color: c.value.dim, marginTop: 5, display: 'block' }),
)
</script>

<template>
  <div style="width: 100%">
    <div :style="trackStyle"><span :style="fillStyle"></span></div>
    <span v-if="!compact" :style="labelStyle">
      {{ done }} / {{ total }} linked {{ total === 1 ? 'item' : 'items' }} done · {{ pct }}%
    </span>
  </div>
</template>

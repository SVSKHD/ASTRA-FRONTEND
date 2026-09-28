<script setup lang="ts">
// "7 of 18 done · 39%" atop a list, over the existing liquid progress bar. Pure
// presentation — the counts come from utils/listSplit's stats.
//
// `part` splits it for a header that lays the count out in its own row (Todos
// and Tasks put it on the left of PanelHeader, level with the title and the
// buttons): `label` is only the count, `bar` only the bar beneath. `inline` is
// the Todo list's own row — "3 of 12 done" with the bar running on beside it.
// The default is both, stacked, as every other list has it.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import ProgressBar from '@/components/ui/ProgressBar.vue'

const props = withDefaults(
  defineProps<{ done: number; total: number; part?: 'all' | 'label' | 'bar' | 'inline' }>(),
  { part: 'all' },
)
const { c } = useStyles()

const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
const labelStyle = computed(() =>
  pxify({
    ...typeStep('sm'),
    color: c.value.text,
    display: 'block',
    fontWeight: 'var(--weight-semibold)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
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
const inlineRow = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' })
const inlineBar = pxify({ flex: 1, minWidth: 0 })
const leadStyle = pxify({ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' })
</script>

<template>
  <span v-if="part === 'label'" v-show="total > 0" :style="labelStyle"
    >{{ done }} of {{ total }} done · {{ pct }}%</span
  >
  <!-- The last beat of a completion (Todo v2, 4a): the bar moves after the
       checkbox has popped and the strike has drawn, not at the same instant. -->
  <ProgressBar
    v-else-if="part === 'bar'"
    v-show="total > 0"
    :value="done"
    :max="total"
    :delay="150"
  />
  <div v-else-if="part === 'inline'" v-show="total > 0" :style="inlineRow">
    <span :style="labelStyle">{{ done }} of {{ total }} done</span>
    <ProgressBar :style="inlineBar" :value="done" :max="total" :delay="150" />
  </div>
  <!-- `lead` sits right after the count, on the left; the default slot takes
       the right-hand end. An empty list keeps its slots and drops only the
       count and the bar. -->
  <div v-else-if="total > 0 || $slots.default || $slots.lead">
    <div :style="headStyle">
      <span :style="leadStyle">
        <span v-if="total > 0" :style="labelStyle"
          >{{ done }} of {{ total }} done · {{ pct }}%</span
        >
        <slot name="lead" />
      </span>
      <slot />
    </div>
    <ProgressBar v-if="total > 0" :value="done" :max="total" :delay="150" />
  </div>
</template>

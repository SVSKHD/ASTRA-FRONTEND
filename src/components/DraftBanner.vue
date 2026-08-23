<script setup lang="ts">
// The dismissible bar shown when useDraft restores (or offers) unsaved changes.
// Two shapes: a same-device restore that already happened ("Restored unsaved
// changes from 2h ago · Discard"), and a cross-device draft awaiting a choice
// ("Newer unsaved changes from another device · Use / Ignore"). Presentational
// only — every decision lives in useDraft; this just renders and emits.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useStyles } from '@/composables/useStyles'
import { useUiStore } from '@/stores/ui'
import { pxify, typeStep } from '@/styles'
import { relativeTime } from '@/utils/drafts'

const props = defineProps<{
  restoredAt: number | null
  fromOtherDevice?: boolean
}>()
const emit = defineEmits<{
  use: []
  ignore: []
  discard: []
}>()

const { c } = useStyles()
const { now } = storeToRefs(useUiStore())

// Reading now keeps "2h ago" ticking over without a timer of our own.
const when = computed(() => (props.restoredAt ? relativeTime(props.restoredAt, now.value) : ''))
const message = computed(() =>
  props.fromOtherDevice
    ? 'Newer unsaved changes from another device'
    : `Restored unsaved changes${when.value ? ' from ' + when.value : ''}`,
)

const bar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    flexWrap: 'wrap',
    padding: '8px 12px',
    borderRadius: 'var(--radius-card)',
    ...typeStep('xs'),
    color: c.value.text,
    background: c.value.glass,
    border: '1px solid ' + (props.fromOtherDevice ? c.value.accent : c.value.border),
    // A soft accent glow only for the attention-worthy cross-device case.
    boxShadow: props.fromOtherDevice ? '0 0 0 3px ' + c.value.accent + '22' : 'none',
    backdropFilter: 'blur(12px)',
    animation: 'fadeUp .3s ease both',
  }),
)
const icon = computed(() =>
  pxify({
    ...typeStep('base'),
    flexShrink: 0,
    color: props.fromOtherDevice ? c.value.accent : c.value.dim,
  }),
)
const label = pxify({ flex: 1, minWidth: 0 })
const actionsWrap = pxify({ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0 })
const linkBtn = computed(() =>
  pxify({
    cursor: 'pointer',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-control)',
    // ≥40px-friendly on mobile without a media query: the padding + line-height
    // keeps the hit area comfortable.
    minHeight: 30,
  }),
)
const primaryBtn = computed(() =>
  pxify({
    cursor: 'pointer',
    border: '1px solid ' + c.value.accent,
    background: c.value.accent,
    color: c.value.onAccent,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-control)',
    minHeight: 30,
  }),
)
</script>

<template>
  <div :style="bar" role="status" aria-live="polite">
    <span :style="icon" aria-hidden="true">↩</span>
    <span :style="label">{{ message }}</span>
    <div :style="actionsWrap">
      <template v-if="fromOtherDevice">
        <button :style="linkBtn" @click="emit('ignore')">Ignore</button>
        <button :style="primaryBtn" @click="emit('use')">Use</button>
      </template>
      <button v-else :style="linkBtn" @click="emit('discard')">Discard</button>
    </div>
  </div>
</template>

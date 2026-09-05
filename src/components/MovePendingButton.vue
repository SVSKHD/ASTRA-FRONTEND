<script setup lang="ts">
// "Move pending to today" for either collection — the only prop is `collection`.
// It reads everything else from useMovePending(collection), so it can be dropped
// into any header or empty state. Renders NOTHING when there is nothing to move
// (no permanently-disabled ghost button).
//
// Idle → a labelled pill with a count badge (icon-only on mobile). Click morphs
// it in place into a liquid/glass progress bar ("Moving 3 / 7…") whose fill
// tracks real per-batch write completions. Success flashes then collapses back
// (~800ms) with an Undo toast (10s); a partial failure goes amber with a Retry
// toast. Disabled for the whole run so it can't double-fire.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useMovePending, type CollectionKey } from '@/composables/useMovePending'
import { SUCCESS, WARNING, pxify, typeStep } from '@/styles'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ collection: CollectionKey }>()

const app = useAppStore()
const ui = useUiStore()
const { c } = useStyles()
const { isMobile } = storeToRefs(ui)
const move = useMovePending(props.collection)
const { count, progress } = move

type Phase = 'idle' | 'running' | 'success' | 'fail'
const phase = ref<Phase>('idle')

const noun = computed(() => (props.collection === 'todos' ? 'todo' : 'task'))
const nounPlural = computed(() => (props.collection === 'todos' ? 'todos' : 'tasks'))

// Only present when there is work to do or an operation to finish showing.
const visible = computed(() => count.value > 0 || phase.value !== 'idle')

const pct = computed(() => {
  if (phase.value === 'idle') return 0
  if (phase.value === 'success') return 100
  return progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0
})

const fullLabel = computed(() => `Move pending ${nounPlural.value} to today`)
const label = computed(() => {
  if (phase.value === 'running') return `Moving ${progress.value.done} / ${progress.value.total}…`
  if (phase.value === 'success') return 'Moved!'
  if (phase.value === 'fail') return 'Some failed'
  return fullLabel.value
})
const ariaLabel = computed(() =>
  phase.value === 'running'
    ? `Moving ${progress.value.done} of ${progress.value.total} ${nounPlural.value} to today`
    : `Move ${count.value} overdue ${count.value === 1 ? noun.value : nounPlural.value} to today`,
)

async function run() {
  if (phase.value === 'running') return
  phase.value = 'running'
  const res = await move.run()
  if (res.failed > 0) {
    phase.value = 'fail'
    app.showToastWithUndo(
      `${res.moved} moved, ${res.failed} failed`,
      () => void run(),
      10000,
      'Retry',
    )
    window.setTimeout(() => (phase.value = 'idle'), 1600)
    return
  }
  if (res.moved > 0) {
    phase.value = 'success'
    const n = res.moved
    app.showToastWithUndo(
      `${n} ${n === 1 ? noun.value : nounPlural.value} moved to today`,
      () => move.undo(),
      10000,
    )
    window.setTimeout(() => (phase.value = 'idle'), 800)
    return
  }
  phase.value = 'idle'
}

// --- styles -----------------------------------------------------------------
const fillColor = computed(() =>
  phase.value === 'success' ? SUCCESS : phase.value === 'fail' ? WARNING : c.value.accent,
)
const running = computed(() => phase.value === 'running')

const shellStyle = computed(() =>
  pxify({
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--sp-2)',
    minHeight: isMobile.value ? 36 : 32,
    // Icon-only on mobile is a compact square; the labelled pill sizes to text.
    minWidth: isMobile.value ? 44 : undefined,
    padding: isMobile.value ? '0 10px' : '0 13px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + (running.value ? c.value.accent : c.value.border),
    background: c.value.card,
    color: c.value.text,
    cursor: running.value ? 'default' : 'pointer',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    boxShadow: phase.value === 'success' ? '0 0 18px ' + fillColor.value : 'none',
    transition: 'box-shadow .35s ease, border-color .25s ease',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  }),
)
const fillStyle = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: pct.value + '%',
    background:
      'linear-gradient(90deg, ' +
      fillColor.value +
      ' 0%, color-mix(in oklch, ' +
      fillColor.value +
      ' 70%, white) 100%)',
    opacity: phase.value === 'idle' ? 0 : 0.9,
    backgroundSize: '200% 100%',
    animation: running.value ? 'shimmer 1.1s linear infinite' : 'none',
    transition: 'width .4s cubic-bezier(.4,1,.4,1), opacity .3s ease',
    pointerEvents: 'none',
  }),
)
const contentStyle = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.02em',
    color: pct.value > 55 ? c.value.onAccent : c.value.text,
    transition: 'color .2s ease',
  }),
)
const iconColor = computed(() => (pct.value > 55 ? c.value.onAccent : c.value.accent))
const badgeStyle = computed(() =>
  pxify({
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    borderRadius: 'var(--radius-pill)',
    background: pct.value > 55 ? c.value.onAccent : c.value.accent,
    color: pct.value > 55 ? c.value.accent : c.value.onAccent,
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    display: 'grid',
    placeItems: 'center',
  }),
)
// Show the text label only on the labelled (idle, non-mobile) pill, or whenever
// mid-operation (so "Moving 3 / 7…" is readable even on mobile).
const showLabelText = computed(() => phase.value !== 'idle' || !isMobile.value)
</script>

<template>
  <button
    v-if="visible"
    type="button"
    :style="shellStyle"
    :disabled="running"
    :aria-label="ariaLabel"
    :aria-busy="running"
    :title="fullLabel"
    @click="run"
  >
    <span :style="fillStyle"></span>
    <span :style="contentStyle">
      <!-- calendar with a down arrow: "move into today" -->
      <Icon name="calendar-down" size="sm" :style="{ color: iconColor }" />
      <span v-if="showLabelText">{{ label }}</span>
      <span v-if="phase === 'idle'" :style="badgeStyle">{{ count }}</span>
    </span>
  </button>
</template>

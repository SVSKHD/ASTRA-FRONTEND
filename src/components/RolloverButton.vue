<script setup lang="ts">
// "Move pending to today" — a single control that morphs in place into a
// progress bar while it rolls every overdue task's deadline forward to today.
//
// The bar's fill tracks REAL progress: the store reports after each chunk's
// Firestore write resolves, never on a timer. On success it fills, flashes, and
// collapses back to the button (~800ms) with an Undo toast (10s). If some
// writes fail the bar goes amber and the toast offers a retry — clicking the
// button again is the retry, and it is idempotent, so only the still-overdue
// tasks are attempted.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { eligibleTasks, todayKey } from '@/utils/rollover'

const app = useAppStore()
const ui = useUiStore()
const { c } = useStyles()
const { tasks } = storeToRefs(app)
const { now, isMobile } = storeToRefs(ui)

type Phase = 'idle' | 'running' | 'success' | 'fail'
const phase = ref<Phase>('idle')
const done = ref(0)
const total = ref(0)

// Eligible count, recomputed off the reactive clock so it re-files at midnight
// without a refresh (same clock the day-grouped lists use).
const count = computed(() => eligibleTasks(tasks.value, todayKey(new Date(now.value))).length)
const disabled = computed(() => count.value === 0 || phase.value === 'running')

const pct = computed(() => {
  if (phase.value === 'idle') return 0
  if (phase.value === 'success') return 100
  return total.value ? Math.round((done.value / total.value) * 100) : 0
})

const label = computed(() => {
  if (phase.value === 'running') return `Moving ${done.value} / ${total.value}…`
  if (phase.value === 'success') return 'Moved!'
  if (phase.value === 'fail') return 'Some failed'
  return 'Move pending to today'
})

const ariaLabel = computed(() =>
  phase.value === 'running'
    ? `Moving ${done.value} of ${total.value} tasks to today`
    : count.value > 0
      ? `Move ${count.value} overdue task${count.value === 1 ? '' : 's'} to today`
      : 'No overdue tasks to move',
)

async function run() {
  if (disabled.value) return
  total.value = count.value
  done.value = 0
  phase.value = 'running'
  const res = await app.rolloverPendingTasks((d, t) => {
    done.value = d
    total.value = t
  })
  if (res.failed > 0) {
    phase.value = 'fail'
    app.showToastMsg(`${res.moved} moved, ${res.failed} failed — retry?`)
    window.setTimeout(() => (phase.value = 'idle'), 1600)
    return
  }
  if (res.moved > 0) {
    phase.value = 'success'
    const n = res.moved
    app.showToastWithUndo(
      `${n} task${n === 1 ? '' : 's'} moved to today`,
      () => app.undoRollover(res.restore),
      10000,
    )
    window.setTimeout(() => (phase.value = 'idle'), 800)
    return
  }
  phase.value = 'idle'
}

// --- styles -----------------------------------------------------------------
const fillColor = computed(() =>
  phase.value === 'success'
    ? 'oklch(0.72 0.15 150)'
    : phase.value === 'fail'
      ? 'oklch(0.78 0.16 72)'
      : c.value.accent,
)

const shellStyle = computed(() =>
  pxify({
    position: 'relative',
    width: '100%',
    minHeight: isMobile.value ? 44 : 40,
    borderRadius: 999,
    border:
      '1px solid ' + (disabled.value && phase.value === 'idle' ? c.value.border : c.value.accent),
    background: c.value.card,
    color: disabled.value && phase.value === 'idle' ? c.value.dim : c.value.text,
    cursor: disabled.value ? 'default' : 'pointer',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '0 14px',
    opacity: disabled.value && phase.value === 'idle' ? 0.55 : 1,
    boxShadow: phase.value === 'success' ? '0 0 22px ' + fillColor.value : 'none',
    transition: 'opacity .25s ease, box-shadow .35s ease, border-color .25s ease',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  }),
)

// The liquid fill — a glassy gradient that grows left→right, with a moving
// shimmer while it is actively running.
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
    animation: phase.value === 'running' ? 'shimmer 1.1s linear infinite' : 'none',
    transition: 'width .4s cubic-bezier(.4,1,.4,1), opacity .3s ease',
    pointerEvents: 'none',
  }),
)

const labelStyle = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 1,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.03em',
    // On a filled bar the text sits on the accent, so it flips to onAccent for
    // contrast once the fill is under it.
    color: pct.value > 55 ? c.value.onAccent : undefined,
    transition: 'color .2s ease',
    whiteSpace: 'nowrap',
  }),
)

const badgeStyle = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 1,
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 999,
    background: count.value > 0 ? c.value.accent : c.value.input,
    color: count.value > 0 ? c.value.onAccent : c.value.dim,
    fontSize: 11,
    fontWeight: 700,
    display: 'grid',
    placeItems: 'center',
  }),
)
</script>

<template>
  <button
    type="button"
    :style="shellStyle"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :aria-busy="phase === 'running'"
    @click="run"
  >
    <span :style="fillStyle"></span>
    <span :style="labelStyle">{{ label }}</span>
    <span v-if="phase === 'idle'" :style="badgeStyle">{{ count }}</span>
  </button>
</template>

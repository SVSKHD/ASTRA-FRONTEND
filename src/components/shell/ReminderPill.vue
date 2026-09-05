<script setup lang="ts">
// The reminder pill (section 44, item 3).
//
// It used to be `position: fixed` at `top: 20; right: 20`, floating over
// whatever the page happened to have in its top-right corner — which on the
// Todo tab is the "+ New todo" button. Nothing was wrong with its z-index; the
// problem was that it occupied no layout space at all, so the button had no way
// to know it was there.
//
// Now it is an ordinary flex child of the shell's top strip, right-aligned in
// the same row as the page's own header actions. Two elements in one flex row
// cannot overlap: the row either fits them both or wraps.
//
// TRUNCATION IS PART OF THAT GUARANTEE. A flex child sized by its content will
// happily grow to the width of a forty-word reminder title and shove the button
// beside it off the edge — the same collision, arrived at from the other
// direction. So the title is clamped to a fixed maximum with an ellipsis, and
// the full text is on the `title` attribute for a hover.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { occurrences } from '@/utils/reminders'
import { urg } from '@/utils/colors'
import { REMINDER_MAX_WIDTH, REMINDER_MAX_WIDTH_PHONE } from '@/views/appShell'

const ui = useUiStore()
const app = useAppStore()
const { c, dark, B } = useStyles()
const { now, isPhone } = storeToRefs(ui)
const { deadlines, reminders, ideas } = storeToRefs(app)

interface Next {
  title: string
  ms: number
  kind: 'deadline' | 'reminder'
  due?: string
}

// Unchanged from the ticker this replaces: the soonest of the deadlines, the
// dated ideas and the reminders, with an overdue deadline winning outright.
const nextD = computed<Next | null>(() => {
  const ideaDeadlines = ideas.value
    .filter((i) => i.deadline)
    .map((i) => ({ title: i.title, due: i.deadline }))
  const withMs = [
    ...deadlines.value.map((t) => ({ title: t.title, due: t.due })),
    ...ideaDeadlines,
  ].map((t) => ({
    title: t.title,
    due: t.due,
    ms: new Date(t.due + 'T23:59:59').getTime() - now.value,
    kind: 'deadline' as const,
  }))
  const overdue = withMs.filter((t) => t.ms < 0).sort((a, b) => b.ms - a.ms)
  const upcoming = withMs.filter((t) => t.ms >= 0).sort((a, b) => a.ms - b.ms)
  const nextDeadline = overdue[0] || upcoming[0] || null

  const remNexts = reminders.value
    .map((r) => {
      const occ = occurrences(r, now.value)
      return occ.next
        ? { title: r.title, ms: occ.next - now.value, kind: 'reminder' as const }
        : null
    })
    .filter((x): x is { title: string; ms: number; kind: 'reminder' } => x !== null)
    .sort((a, b) => a.ms - b.ms)
  const nextReminder = remNexts[0]

  let result: Next | null = nextDeadline
  if (nextReminder && (!nextDeadline || nextDeadline.ms < 0 || nextReminder.ms < nextDeadline.ms)) {
    result = nextReminder
  }
  return result
})

const has = computed(() => !!nextD.value)

const title = computed(() => {
  const n = nextD.value
  if (!n) return ''
  return (n.kind === 'reminder' ? 'Reminder: ' : '') + n.title
})
const time = computed(() => {
  const n = nextD.value
  if (!n) return ''
  const isOverdue = n.ms < 0
  const days = Math.floor(Math.abs(n.ms) / 86400000)
  const hours = Math.floor((Math.abs(n.ms) % 86400000) / 3600000)
  return isOverdue ? 'overdue' : days + 'd ' + hours + 'h'
})
/** The whole thing, for the hover — a truncated title must stay readable. */
const full = computed(() => (title.value ? `${title.value} — ${time.value}` : ''))

const dotColor = computed(() => {
  const n = nextD.value
  if (!n) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (n.ms < 0) return 'var(--theme-danger)'
  if (n.kind === 'reminder') return 'var(--theme-success)'
  const d = n.due
    ? Math.round((new Date(n.due + 'T00:00:00').getTime() - today.getTime()) / 86400000)
    : 0
  return urg(d, dark.value)
})

// --- styles -----------------------------------------------------------------
// `marginLeft: auto` is what right-aligns it: the strip is a flex row, the
// page's actions are at its start, and this takes the slack between them. It is
// the alignment doing the separating, not a coordinate.
const pill = computed(() =>
  pxify({
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    minWidth: 0,
    maxWidth: '100%',
    padding: '7px 12px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.5)',
    border: B.value,
    boxShadow: c.value.shadow,
    cursor: 'pointer',
    // NO `position: fixed`, and nothing that takes this out of flow. That is
    // the entire point of the file.
  }),
)
const label = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.12em',
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const titleStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    // The three declarations that make an ellipsis actually happen. `minWidth:
    // 0` is the one people leave out, and without it a flex child refuses to
    // shrink below its content and the overflow never triggers.
    minWidth: 0,
    maxWidth: (isPhone.value ? REMINDER_MAX_WIDTH_PHONE : REMINDER_MAX_WIDTH) + 'px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const timeStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontVariantNumeric: 'tabular-nums',
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const dot = computed(() =>
  pxify({
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    background: dotColor.value,
    boxShadow: '0 0 8px ' + dotColor.value,
  }),
)

function jump() {
  ui.setTab('deadlines')
}
</script>

<template>
  <button
    v-if="has"
    type="button"
    class="rpill"
    :style="pill"
    :title="full"
    :aria-label="full"
    @click="jump"
  >
    <span :style="dot"></span>
    <span :style="label">NEXT</span>
    <span :style="titleStyle">{{ title }}</span>
    <span :style="timeStyle">{{ time }}</span>
  </button>
</template>

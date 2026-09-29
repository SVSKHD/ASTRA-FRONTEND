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
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { reminderDockShown, upcomingTime, useUpcoming } from '@/composables/useUpcoming'
import { REMINDER_MAX_WIDTH, REMINDER_MAX_WIDTH_PHONE } from '@/views/appShell'

const ui = useUiStore()
const { c, B } = useStyles()
const { isPhone } = storeToRefs(ui)

// The soonest thing coming up, from the same list the gutter card shows.
const { next: nextD, colorOf } = useUpcoming()

// Only while the reminder card is not on screen: where the gutter has room for
// the card, the card says this and more, and the corner stays clear.
const has = computed(() => !!nextD.value && !reminderDockShown.value)

const title = computed(() => {
  const n = nextD.value
  if (!n) return ''
  return (n.kind === 'reminder' ? 'Reminder: ' : '') + n.title
})
const time = computed(() => (nextD.value ? upcomingTime(nextD.value.ms) : ''))
/** The whole thing, for the hover — a truncated title must stay readable. */
const full = computed(() => (title.value ? `${title.value} — ${time.value}` : ''))

const dotColor = computed(() => (nextD.value ? colorOf(nextD.value) : ''))

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

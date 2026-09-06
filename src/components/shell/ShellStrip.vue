<script setup lang="ts">
// The top status strip (section 44, items 2–3).
//
// One row, three things, left to right: the brand mark, whatever header actions
// the current page teleports in, and the reminder pill pushed to the right by
// `margin-left: auto`.
//
// `#shell-strip-actions` is the teleport target every `<ListToolbar>` looks for.
// That is what makes "the same row as the page's own header actions" literally
// true rather than approximately true: the toolbar's buttons are DOM children
// of this strip, so the browser's own flex layout is what keeps them and the
// reminder apart. Two boxes in one flex row is the strongest guarantee of
// non-overlap there is — much stronger than any amount of coordinate arithmetic
// between two fixed elements, which is what was here before.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { stripGeometry } from '@/views/appShell'
import { STRIP_ACTIONS_ID } from '@/components/shell/shellKeys'
import ReminderPill from '@/components/shell/ReminderPill.vue'
import { tabLabel } from '@/tabs.config'

const { c, B } = useStyles()
const { isPhone } = storeToRefs(useUiStore())
const { tab } = storeToRefs(useUiStore())
const title = computed(() => (tab.value === 'overview' ? 'Dashboard' : tabLabel(tab.value)))

const strip = computed(() => pxify(stripGeometry({ isPhone: isPhone.value })))

const brandOrb = computed(() =>
  pxify({
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.5)',
    border: B.value,
    boxShadow: c.value.shadow,
  }),
)
const brandDot = computed(() =>
  pxify({
    width: 15,
    height: 15,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 34% 32%, ' + c.value.accent + ' 0%, transparent 72%)',
    boxShadow: '0 0 12px ' + c.value.accent,
  }),
)
/**
 * Where the page's toolbar lands.
 *
 * `flex: 1 1 auto` with `minWidth: 0` so it takes the slack and, when the page
 * has a lot of actions, shrinks rather than shoving the reminder off the edge.
 */
const actions = pxify({
  flex: '1 1 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  minWidth: 0,
})
/**
 * The page's name, IN THE ROW.
 *
 * It used to be `position: absolute; left: 50%`, centred on the strip — and
 * that cannot work here whatever the coordinates are. The strip is a flex row
 * holding the page's own header actions, which are as wide as the page needs
 * them to be: on Trades that is a three-tab strip, a CSV button and an Account
 * button, and they reach the middle of the row at any window under about
 * 1400px. An absolutely positioned element in the same row is not laid out with
 * respect to them, so it does not move out of the way — it lands on top, and
 * "Dashboard" was printed over the word "Account".
 *
 * (It was worse than that before this pass: the strip had no positioning
 * context of its own, so the 50% was 50% of the SHELL and the title floated in
 * the middle of the trades table. That is fixed in `appShell.ts`. This is the
 * other half — being in the right row is not the same as being laid out in it.)
 *
 * In flow, beside the brand, the flex row does the work: the title takes the
 * width it needs, the actions take the slack, and neither can overlap the
 * other because that is not a thing flex layout can produce.
 */
const titleStyle = computed(() =>
  pxify({
    flexShrink: 0,
    maxWidth: isPhone.value ? '34vw' : '24vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: isPhone.value ? '6px 12px' : '7px 16px',
    border: B.value,
    borderRadius: 'var(--radius-pill)',
    background: c.value.glass,
    backdropFilter: 'blur(18px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(18px) saturate(1.5)',
    boxShadow: 'inset 0 1px 0 color-mix(in srgb, white 16%, transparent), ' + c.value.shadow,
    color: c.value.text,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.04em',
  }),
)
</script>

<template>
  <header :style="strip" class="shell-strip">
    <div :style="brandOrb" aria-label="Aureon"><span :style="brandDot"></span></div>
    <div :style="titleStyle" :title="title">{{ title }}</div>
    <div :id="STRIP_ACTIONS_ID" :style="actions"></div>
    <ReminderPill />
  </header>
</template>

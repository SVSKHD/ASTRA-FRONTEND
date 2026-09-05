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
import { pxify } from '@/styles'
import { stripGeometry } from '@/views/appShell'
import { STRIP_ACTIONS_ID } from '@/components/shell/shellKeys'
import ReminderPill from '@/components/shell/ReminderPill.vue'

const { c, B } = useStyles()
const { isPhone } = storeToRefs(useUiStore())

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
</script>

<template>
  <header :style="strip" class="shell-strip">
    <div :style="brandOrb" aria-label="Aureon"><span :style="brandDot"></span></div>
    <div :id="STRIP_ACTIONS_ID" :style="actions"></div>
    <ReminderPill />
  </header>
</template>

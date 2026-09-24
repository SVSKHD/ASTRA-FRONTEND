<script setup lang="ts">
// The tip that teaches "/" then "n", and then stops.
//
// A shortcut nobody can see is a shortcut nobody uses, so it says so — centred
// under the tab, quiet, out of the way of the list. What matters as much is the
// second half: it counts the times the shortcut is actually used and, after
// three, never appears again. A tip is for somebody who does not know the thing
// yet; one that keeps arriving after they plainly do is furniture.
//
// It is named per tab from the same file that names the tabs, so it promises a
// todo on Todos and a goal on Goals — and stays quiet on News and Code, which
// make nothing, rather than advertising a shortcut that would do nothing there.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { tabNewItem } from '@/tabs.config'
import { NEW_ITEM_HINT_USES } from '@/views/globalKeys'

const app = useAppStore()
const ui = useUiStore()
const { c } = useStyles()
const { tab } = storeToRefs(ui)
const { newItemUses } = storeToRefs(app)

const noun = computed(() => tabNewItem(tab.value))
// Only once the workspace has arrived: the count lives on the user's document,
// so before it lands it reads 0 for everybody — and showing the tip on that
// would show it to the very people who have already learned it.
const show = computed(
  () => app.cloudReady && noun.value != null && newItemUses.value < NEW_ITEM_HINT_USES,
)

const wrap = pxify({
  display: 'flex',
  justifyContent: 'center',
  // Out of the flow: the tip sits under the list without taking a row from it,
  // and a list that grows past it simply covers it.
  pointerEvents: 'none',
  padding: '10px 0 2px',
})
const chip = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '5px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px dashed ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    ...typeStep('2xs'),
    whiteSpace: 'nowrap',
  }),
)
const kbd = computed(() =>
  pxify({
    fontFamily: 'var(--font-mono)',
    fontWeight: 'var(--weight-semibold)',
    color: c.value.accent,
  }),
)
</script>

<template>
  <div v-if="show" :style="wrap" aria-hidden="true">
    <span :style="chip">
      <span :style="kbd">/n</span>
      <span>makes a new {{ noun }}</span>
    </span>
  </div>
</template>

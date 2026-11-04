<script setup lang="ts">
// The application shell (section 44, items 1–5).
//
// Four regions, one grid, and exactly one scrollport. See `views/appShell.ts`
// for the geometry and the reasoning; this file is the arrangement and the
// paint.
//
// WHAT IT REPLACES, and why the replacement is a fix rather than a rearrangement:
// the dock, the reminder pill, the sync pill and the action cluster were four
// independent `position: fixed` elements with hand-chosen coordinates. Four
// elements out of flow cannot be laid out with respect to each other or to the
// page — they can only be given numbers that happen to work at the width they
// were tried at. Three of them collided. Docked into grid regions, collision is
// not something to be avoided by choosing better numbers; it is not expressible.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { pxify } from '@/styles'
import { contentGeometry, railGeometry, shellGeometry } from '@/views/appShell'
import { registerShell, unregisterShell } from '@/components/shell/shellKeys'
import FloatingDock from '@/components/FloatingDock.vue'
import ShellStrip from '@/components/shell/ShellStrip.vue'
import ShellBar from '@/components/shell/ShellBar.vue'
import MobileTabBar from '@/components/shell/MobileTabBar.vue'
import FocusOverlay from '@/components/todo/FocusOverlay.vue'
import WeeklyReview from '@/components/todo/WeeklyReview.vue'
import TodoSheet from '@/components/todo/TodoSheet.vue'

const { isPhone, isTablet } = storeToRefs(useUiStore())

const shell = computed(() =>
  pxify(shellGeometry({ isPhone: isPhone.value, isTablet: isTablet.value })),
)
const content = computed(() => pxify(contentGeometry({ isPhone: isPhone.value })))
const rail = computed(() =>
  pxify(railGeometry({ isPhone: isPhone.value, isTablet: isTablet.value })),
)

/**
 * The scrolling element, and the fact that the strip's teleport target exists.
 *
 * Published to the shell module on mount rather than `provide`d, because both
 * consumers sit ABOVE this component on the instance tree — see the comment in
 * `shellKeys.ts`, which is the whole reason that file is a module.
 *
 * `onMounted`, not setup: a Teleport whose target is not in the DOM yet warns
 * and drops its content, and this component's own template has to have run
 * before `#shell-strip-actions` is anything at all.
 */
const scroller = ref<HTMLElement | null>(null)
onMounted(() => registerShell(scroller.value))
onBeforeUnmount(() => unregisterShell())
</script>

<template>
  <div :style="shell" class="app-shell">
    <!-- Phones get an icon-only tab bar of the five primary tabs (Todo v2, 3a)
         that hides on scroll down; wider screens keep the carousel rail. -->
    <nav :style="rail" class="app-shell__rail">
      <MobileTabBar v-if="isPhone" />
      <FloatingDock v-else />
    </nav>

    <ShellStrip />

    <main ref="scroller" :style="content" class="app-shell__content">
      <slot />
    </main>

    <!-- The utility pill is desktop chrome; on a phone its four controls sit
         in the tab bar's More sheet instead of stacking a second bar. -->
    <ShellBar v-if="!isPhone" />

    <!-- Overlays that belong to no one tab: they cover the whole shell. -->
    <TodoSheet v-if="isPhone" />
    <WeeklyReview />
    <FocusOverlay />
  </div>
</template>

<style scoped>
/* The one scrollport. No scrollbar (style.css hides them all): arrows on its
   edges say there is more (directives/autoScrollArrows.ts). */
.app-shell__content {
  /* Scrolling past the top or bottom stops here instead of handing the
     gesture to the page — which on a phone is pull-to-refresh. */
  overscroll-behavior-y: contain;
}
</style>

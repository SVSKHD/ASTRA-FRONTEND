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
    <nav :style="rail" class="app-shell__rail"><FloatingDock /></nav>

    <ShellStrip />

    <main ref="scroller" :style="content" class="app-shell__content">
      <slot />
    </main>

    <ShellBar />
  </div>
</template>

<style scoped>
/* The one scrollport gets a scrollbar that matches the theme rather than the
   OS. The document no longer scrolls, so the global scrollbar rules in
   style.css have nothing to style. */
.app-shell__content {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--theme-accent) 45%, transparent) transparent;
}
.app-shell__content::-webkit-scrollbar {
  width: 10px;
}
.app-shell__content::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  background-clip: padding-box;
  border-radius: 999px;
  background-color: color-mix(in oklch, var(--theme-accent) 45%, transparent);
}
.app-shell__content::-webkit-scrollbar-track {
  background: transparent;
}
</style>

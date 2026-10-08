<script setup lang="ts">
// Shell only. The starfield and brand mark are shared chrome across every
// route — the workspace, a share page and the 404 all sit on the same sky.
//
// The sync pill used to live here too, fixed to the bottom-left of the viewport
// on every route. It is now a compact item in the workspace shell's bottom
// utility bar (section 44, item 4): it was the element that covered the dock,
// and a floating pill on a route with no writes to sync was reporting on
// nothing anyway.
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Starfield from '@/components/Starfield.vue'
import CursorTail from '@/components/CursorTail.vue'
import IconSprite from '@/components/ui/IconSprite.vue'
import ProgressStack from '@/components/ProgressStack.vue'
import WarningTray from '@/components/WarningTray.vue'
// "How to add a goal" (section 23). Mounted once, here, because it is opened
// from the goals toolbar, from the goal dialog and from /ui — three surfaces on
// two routes, and a panel mounted in each would be three of them. Loaded on
// demand: most sessions never ask for it.
const GoalHelpPanel = defineAsyncComponent(() => import('@/components/goals/GoalHelpPanel.vue'))
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { firebaseEnabled, onPersistenceResolved, supabaseEnabled } from '@/firebase'

const { s } = useStyles()
const app = useAppStore()
const route = useRoute()

// The workspace renders its own brand orb in the shell's top strip, so the
// corner mark would be a duplicate there. Keep it on the other routes (the share
// page, the 404) which have no chrome of their own.
// The screenshot stage draws a tab on its own and would otherwise get the
// corner mark stamped over the toolbar's title.
const showBrand = computed(
  () => route.name !== 'workspace' && route.name !== 'dev-shot' && route.name !== 'ui-showcase',
)

// One-time notice when offline persistence could not be enabled (private mode /
// unsupported browser): the app still works, just without offline durability.
// Firestore now loads after the first paint, so the answer arrives via the
// subscription rather than being readable at mount.
onMounted(() => {
  // Only the Firestore fallback ever had an offline cache to lose. On Supabase
  // "memory" is the normal state, and this would announce it on every load.
  if (!firebaseEnabled || supabaseEnabled) return
  onPersistenceResolved((mode) => {
    if (mode === 'memory') app.showToastMsg('Offline mode unavailable in this browser')
  })
})
</script>

<template>
  <!-- The icon set, once (section 21e). Every <Icon> in the app is a <use>
       pointing into this. -->
  <IconSprite />
  <Starfield />
  <CursorTail />
  <RouterView />
  <GoalHelpPanel v-if="app.goalHelpOpen" />
  <!-- The bottom-right corner, as one column so its two tenants never land on
       each other: work in flight as progress cards (route changes, the sync,
       long jobs such as a bulk delete — replacing the two-pixel bar that used
       to run across the top), and under them the alert tray. -->
  <div class="corner-br">
    <ProgressStack />
    <WarningTray />
  </div>
  <div v-if="showBrand" :style="s.brandWrap"><span :style="s.brand">AUREON</span></div>
</template>

<style scoped>
/* Bottom-right, stacked upward from the corner: the tray at the bottom, the
   progress cards above it. Only the cards and the tray take the pointer; the
   column itself lets clicks through to the page behind it. */
.corner-br {
  position: fixed;
  right: var(--sp-4);
  bottom: calc(var(--sp-4) + env(safe-area-inset-bottom, 0px));
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}
.corner-br > :deep(*) {
  pointer-events: auto;
}
</style>

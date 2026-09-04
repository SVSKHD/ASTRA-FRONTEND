<script setup lang="ts">
// Shell only. The starfield and brand mark are shared chrome across every
// route — the workspace, a share page and the 404 all sit on the same sky.
// The sync pill also lives here so it floats above every route.
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Starfield from '@/components/Starfield.vue'
import CursorTail from '@/components/CursorTail.vue'
import SyncPill from '@/components/SyncPill.vue'
import IconSprite from '@/components/ui/IconSprite.vue'
// "How to add a goal" (section 23). Mounted once, here, because it is opened
// from the goals toolbar, from the goal dialog and from /ui — three surfaces on
// two routes, and a panel mounted in each would be three of them. Loaded on
// demand: most sessions never ask for it.
const GoalHelpPanel = defineAsyncComponent(() => import('@/components/goals/GoalHelpPanel.vue'))
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { firebaseEnabled, onPersistenceResolved } from '@/firebase'

const { s } = useStyles()
const app = useAppStore()
const route = useRoute()

// The workspace renders its own floating AUREON orb (FloatingChrome), so the
// corner mark would be a duplicate there. Keep it on the other routes (the share
// page, the 404) which have no chrome of their own.
// The screenshot stage draws a tab on its own and would otherwise get the
// corner mark stamped over the toolbar's title.
const showBrand = computed(() => route.name !== 'workspace' && route.name !== 'dev-shot')

// One-time notice when offline persistence could not be enabled (private mode /
// unsupported browser): the app still works, just without offline durability.
// Firestore now loads after the first paint, so the answer arrives via the
// subscription rather than being readable at mount.
onMounted(() => {
  if (!firebaseEnabled) return
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
  <SyncPill />
  <div v-if="showBrand" :style="s.brandWrap"><span :style="s.brand">AUREON</span></div>
</template>

<script setup lang="ts">
// Shell only. The starfield and brand mark are shared chrome across every
// route — the workspace, a share page and the 404 all sit on the same sky.
// The sync pill also lives here so it floats above every route.
import { onMounted } from 'vue'
import Starfield from '@/components/Starfield.vue'
import CursorTail from '@/components/CursorTail.vue'
import SyncPill from '@/components/SyncPill.vue'
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { firebaseEnabled, persistenceMode } from '@/firebase'

const { s } = useStyles()
const app = useAppStore()

// One-time notice when offline persistence could not be enabled (private mode /
// unsupported browser): the app still works, just without offline durability.
onMounted(() => {
  if (firebaseEnabled && persistenceMode === 'memory') {
    app.showToastMsg('Offline mode unavailable in this browser')
  }
})
</script>

<template>
  <Starfield />
  <CursorTail />
  <RouterView />
  <SyncPill />
  <div :style="s.brandWrap"><span :style="s.brand">AUREON</span></div>
</template>

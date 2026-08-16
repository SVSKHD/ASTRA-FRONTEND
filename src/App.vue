<script setup lang="ts">
// Shell only. The starfield and brand mark are shared chrome across every
// route — the workspace, a share page and the 404 all sit on the same sky.
// The sync pill also lives here so it floats above every route.
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Starfield from '@/components/Starfield.vue'
import CursorTail from '@/components/CursorTail.vue'
import SyncPill from '@/components/SyncPill.vue'
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { firebaseEnabled, onPersistenceResolved } from '@/firebase'

const { s } = useStyles()
const app = useAppStore()
const route = useRoute()

// The workspace renders its own floating AUREON orb (FloatingChrome), so the
// corner mark would be a duplicate there. Keep it on the other routes (the share
// page, the 404) which have no chrome of their own.
const showBrand = computed(() => route.name !== 'workspace')

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
  <Starfield />
  <CursorTail />
  <RouterView />
  <SyncPill />
  <div v-if="showBrand" :style="s.brandWrap"><span :style="s.brand">AUREON</span></div>
</template>

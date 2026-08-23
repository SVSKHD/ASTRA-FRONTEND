<script setup lang="ts">
// The owner's /trips/:id route. It owns the loading / signed-out / not-found
// states and reads the trip (plus its attached notes) from the hydrated
// workspace, then hands off to TripDetail for the actual page — the same
// component the public shared-link page renders, so the two never drift.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import TripDetail from '@/components/trips/TripDetail.vue'
import type { Note, Trip } from '@/types'

const props = defineProps<{ id: number }>()

const app = useAppStore()
const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const { c, s, isMobile } = useStyles()
const { trips, cloudReady } = storeToRefs(app)
const { authReady, isSignedIn } = storeToRefs(auth)

const trip = computed<Trip | undefined>(() => trips.value.find((t) => t.id === props.id))
// Still fetching if auth has not settled, or a signed-in user's workspace doc
// has not hydrated yet. Once ready, an absent trip is genuinely not-found.
const loading = computed(() => !authReady.value || (isSignedIn.value && !cloudReady.value))
const needsAuth = computed(() => authReady.value && !isSignedIn.value)
const notFound = computed(() => cloudReady.value && !trip.value)
const attachedNotes = computed<Note[]>(() =>
  trip.value ? app.notes.filter((n) => trip.value!.noteIds.includes(n.id)) : [],
)

function back() {
  ui.setTab('trips')
  router.push('/')
}

const page = pxify({
  position: 'relative',
  zIndex: 1,
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  padding: isMobile.value ? '16px 12px 60px' : '28px 16px 80px',
})
const shell = pxify({
  width: '100%',
  maxWidth: 820,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
})
const skeleton = (h: number) =>
  pxify({
    height: h,
    borderRadius: 'var(--radius-dialog)',
    background:
      'linear-gradient(90deg,' +
      c.value.input +
      ' 25%,' +
      c.value.card +
      ' 50%,' +
      c.value.input +
      ' 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
  })
const centered = pxify({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 16px',
})
</script>

<template>
  <!-- Loading: glass skeletons, no missing sections -->
  <div v-if="loading" :style="page">
    <div :style="shell">
      <div :style="skeleton(40)"></div>
      <div :style="skeleton(isMobile ? 200 : 280)"></div>
      <div :style="skeleton(64)"></div>
      <div :style="skeleton(isMobile ? 260 : 320)"></div>
      <div :style="skeleton(280)"></div>
    </div>
  </div>

  <!-- Signed out -->
  <div v-else-if="needsAuth" :style="centered">
    <div :style="s.shareCard">
      <span :style="s.drawerTitle">Sign in to view this trip</span>
      <span :style="s.finMeta">This trip lives in your private workspace.</span>
      <div :style="s.dialogActions">
        <button :style="s.saveBtn" @click="auth.loginGoogle()">Sign in with Google</button>
        <button :style="s.cancelBtn" @click="back">Back to Trips</button>
      </div>
    </div>
  </div>

  <!-- Not found -->
  <div v-else-if="notFound" :style="centered">
    <div :style="s.shareCard">
      <span :style="s.drawerTitle">Trip not found</span>
      <span :style="s.finMeta">It may have been deleted.</span>
      <div :style="s.dialogActions">
        <button :style="s.saveBtn" @click="back">Back to Trips</button>
      </div>
    </div>
  </div>

  <!-- The trip -->
  <TripDetail v-else-if="trip" :trip="trip" :notes="attachedNotes" variant="owner" @back="back" />
</template>

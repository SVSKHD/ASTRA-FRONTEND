<script setup lang="ts">
// The full, deep-linkable page for one trip (/trips/:id). Unlike the quick-view
// dialog this is a whole scrollable page: a hero header, a full-width
// interactive map, the complete timeline with per-place photo galleries (each
// opening a lightbox), and the trip's attached notes. It reads the owner's
// workspace straight from the store, which hydrates from Firestore on load, so
// while that is in flight the page shows glass skeletons rather than empty
// sections. Back returns to the Trips tab with its scroll intact.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip } from '@/styles'
import TripMap from '@/components/trips/TripMap.vue'
import TripTimeline from '@/components/trips/TripTimeline.vue'
import TripLightbox from '@/components/trips/TripLightbox.vue'
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

const activePlace = ref<number | null>(null)
const mapSection = ref<HTMLElement | null>(null)
function focusPlace(placeId: number) {
  activePlace.value = placeId
  mapSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// --- lightbox ---------------------------------------------------------------
const lightboxPhotos = ref<string[]>([])
const lightboxIndex = ref(-1)
const lightboxOpen = computed(() => lightboxIndex.value >= 0 && lightboxPhotos.value.length > 0)
function openPhoto(placeId: number, index: number) {
  const place = trip.value?.places.find((p) => p.id === placeId)
  if (!place || !place.photos.length) return
  lightboxPhotos.value = place.photos
  lightboxIndex.value = index
}
function closeLightbox() {
  lightboxIndex.value = -1
  lightboxPhotos.value = []
}

// --- derived meta -----------------------------------------------------------
const cover = computed(() => {
  const t = trip.value
  if (!t) return ''
  if (t.photos[0]) return t.photos[0]
  for (const p of t.places) if (p.photos[0]) return p.photos[0]
  return ''
})
// First -> last place date, from the per-place visited times where present,
// falling back to the trip's own planned/visited date.
const dateRange = computed(() => {
  const t = trip.value
  if (!t) return ''
  const stamps = t.places
    .map((p) => Date.parse(p.visitedAt))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  if (stamps.length) {
    const from = fmt(stamps[0])
    const to = fmt(stamps[stamps.length - 1])
    return from === to ? from : from + ' → ' + to
  }
  const fallback = t.status === 'done' ? t.visitedDate || t.date : t.date
  if (!fallback) return 'No dates yet'
  return new Date(fallback + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
})
const attachedNotes = computed<Note[]>(() =>
  trip.value ? app.notes.filter((n) => trip.value!.noteIds.includes(n.id)) : [],
)

function back() {
  ui.setTab('trips')
  router.push('/')
}
function noteTitleLine(n: Note): string {
  const div = document.createElement('div')
  div.innerHTML = n.text
  return (div.textContent || '').trim().split('\n')[0].slice(0, 80) || 'Untitled note'
}

// --- styles -----------------------------------------------------------------
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
  gap: 16,
})
const backBtn = computed(() =>
  pxify({
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.glass,
    color: c.value.text,
    cursor: 'pointer',
    backdropFilter: 'blur(18px) saturate(1.5)',
  }),
)
const glass = (extra: Record<string, string | number> = {}) =>
  pxify({
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 24,
    boxShadow: c.value.shadow,
    ...extra,
  })
const heroStyle = computed(() =>
  cover.value
    ? pxify({
        position: 'relative',
        minHeight: isMobile.value ? 180 : 240,
        borderRadius: 24,
        overflow: 'hidden',
        border: '1px solid ' + c.value.border,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundImage:
          'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.72)), url(' + cover.value + ')',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      })
    : glass({ padding: isMobile.value ? '20px' : '28px' }),
)
const heroInner = computed(() =>
  pxify({
    padding: cover.value ? (isMobile.value ? '18px' : '24px') : 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    color: cover.value ? '#fff' : c.value.text,
  }),
)
const titleStyle = computed(() =>
  pxify({ fontSize: isMobile.value ? 24 : 32, fontWeight: 800, lineHeight: 1.12 }),
)
const metaRow = pxify({ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' })
function statusBadge(done: boolean) {
  return pxify({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid ' + (done ? c.value.accent : c.value.border),
    color: done ? c.value.accent : c.value.text,
    background: 'rgba(0,0,0,0.25)',
  })
}
const rangeStyle = computed(() => pxify({ fontSize: 13, fontWeight: 600, opacity: 0.92 }))
function chip(tag: string) {
  return pxify(tagChip(c.value, tag, false))
}
const sectionTitle = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
    padding: '2px 2px',
  }),
)
const sectionCard = computed(() => glass({ padding: isMobile.value ? '14px' : '18px' }))
const skeleton = (h: number) =>
  pxify({
    height: h,
    borderRadius: 20,
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
      <div :style="skeleton(isMobile ? 180 : 240)"></div>
      <div :style="skeleton(isMobile ? 240 : 300)"></div>
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
  <div v-else-if="trip" :style="page">
    <div :style="shell">
      <button :style="backBtn" @click="back">‹ Trips</button>

      <!-- Hero -->
      <div :style="heroStyle">
        <div :style="heroInner">
          <div :style="metaRow">
            <span :style="statusBadge(trip.status === 'done')">
              {{ trip.status === 'done' ? 'Done' : 'To visit' }}
            </span>
            <span :style="rangeStyle">{{ dateRange }}</span>
          </div>
          <span :style="titleStyle">{{ trip.title || 'Untitled trip' }}</span>
          <div v-if="trip.tag" :style="metaRow">
            <span :style="chip(trip.tag)">{{ trip.tag }}</span>
          </div>
        </div>
      </div>

      <!-- Map -->
      <span :style="sectionTitle">Map</span>
      <div ref="mapSection">
        <TripMap
          v-if="trip.places.some((p) => p.lat != null && p.lng != null)"
          :places="trip.places"
          :active="activePlace"
          :height="isMobile ? 260 : 380"
        />
        <div
          v-else
          :style="glass({ padding: '28px', textAlign: 'center', color: c.dim, fontSize: 13 })"
        >
          No places have a location yet.
        </div>
      </div>

      <!-- Timeline with per-place galleries -->
      <span :style="sectionTitle">Timeline</span>
      <div :style="sectionCard">
        <TripTimeline
          :places="trip.places"
          :active="activePlace"
          @select="focusPlace"
          @photo="openPhoto"
        />
      </div>

      <!-- Attached notes -->
      <template v-if="attachedNotes.length">
        <span :style="sectionTitle">Notes</span>
        <div
          v-for="n in attachedNotes"
          :key="n.id"
          :style="
            glass({ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' })
          "
        >
          <span :style="pxify({ fontSize: 14, fontWeight: 700, color: c.text })">
            {{ noteTitleLine(n) }}
          </span>
          <div
            class="rich"
            :style="pxify({ fontSize: 13, lineHeight: 1.6, color: c.text })"
            v-html="n.text"
          ></div>
        </div>
      </template>
    </div>
  </div>

  <TripLightbox
    v-if="lightboxOpen"
    :photos="lightboxPhotos"
    :index="lightboxIndex"
    @update:index="lightboxIndex = $event"
    @close="closeLightbox"
  />
</template>

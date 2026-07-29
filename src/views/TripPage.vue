<script setup lang="ts">
// The full, deep-linkable page for one trip (/trips/:id). A whole scrollable
// page rather than the quick-view dialog: a full-bleed hero, a trip-level stats
// row (days · places · photos · distance), a toggle between the day-filtered
// map and the day-by-day itinerary/timeline, per-place photo galleries, and the
// trip's attached notes rendered in full. Everything is real data from the
// owner's workspace, which hydrates from Firestore on load; glass skeletons
// stand in while that is in flight so no section is ever empty. Back returns to
// the Trips tab with its scroll intact.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip, type Style } from '@/styles'
import { formatWhen, routeDistanceKm, formatDistance } from '@/utils/geo'
import { groupPlacesByDay, dayColor } from '@/utils/tripDays'
import TripMap from '@/components/trips/TripMap.vue'
import TripItinerary from '@/components/trips/TripItinerary.vue'
import TripLightbox from '@/components/trips/TripLightbox.vue'
import type { Note, Trip, TripPlace } from '@/types'

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

const view = ref<'map' | 'itinerary'>('itinerary')
const activePlace = ref<number | null>(null)
const selectedDay = ref<number | null>(null) // null = all days
const mapSection = ref<HTMLElement | null>(null)
function focusPlace(placeId: number) {
  activePlace.value = placeId
  view.value = 'map'
  mapSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// --- day grouping + global ordering ----------------------------------------
const days = computed(() => (trip.value ? groupPlacesByDay(trip.value.places) : []))
// Places in day-then-time order — the single order that numbers pins, sequences
// the lightbox, and measures the route.
const orderedPlaces = computed<TripPlace[]>(() => days.value.flatMap((d) => d.places))
const placeMeta = computed(() => {
  const number: Record<number, number> = {}
  const color: Record<number, string> = {}
  let n = 0
  for (const d of days.value) {
    const tint = d.unscheduled ? c.value.dim : dayColor(d.dayNumber - 1)
    for (const p of d.places) {
      n += 1
      number[p.id] = n
      color[p.id] = tint
    }
  }
  return { number, color }
})

// Which places the map shows: the selected day only, else everything.
const mapPlaces = computed<TripPlace[]>(() => {
  if (selectedDay.value == null) return trip.value?.places ?? []
  const d = days.value.find((g) => g.dayNumber === selectedDay.value)
  return d ? d.places : (trip.value?.places ?? [])
})
const hasPins = computed(() =>
  (trip.value?.places ?? []).some((p) => p.lat != null && p.lng != null),
)

// --- lightbox: every trip photo, ordered by day + time, with captions -------
const photoModel = computed(() => {
  const urls: string[] = []
  const captions: string[] = []
  const startByPlace = new Map<number, number>()
  for (const p of orderedPlaces.value) {
    startByPlace.set(p.id, urls.length)
    const when = formatWhen(p.visitedAt)
    for (const url of p.photos) {
      urls.push(url)
      captions.push((p.name || 'Untitled place') + (when ? ' · ' + when : ''))
    }
  }
  return { urls, captions, startByPlace }
})
const lightboxIndex = ref(-1)
const lightboxOpen = computed(() => lightboxIndex.value >= 0 && photoModel.value.urls.length > 0)
function openPhoto(placeId: number, index: number) {
  const start = photoModel.value.startByPlace.get(placeId)
  if (start == null) return
  lightboxIndex.value = start + index
}
function closeLightbox() {
  lightboxIndex.value = -1
}

// --- stats ------------------------------------------------------------------
const stats = computed(() => {
  const t = trip.value
  const totalDays = days.value.filter((d) => !d.unscheduled).length
  const totalPlaces = t?.places.length ?? 0
  const totalPhotos =
    (t?.photos.length ?? 0) + (t?.places.reduce((sum, p) => sum + p.photos.length, 0) ?? 0)
  const distance = formatDistance(routeDistanceKm(orderedPlaces.value))
  return [
    { label: 'Days', value: String(totalDays || (totalPlaces ? 1 : 0)) },
    { label: 'Places', value: String(totalPlaces) },
    { label: 'Photos', value: String(totalPhotos) },
    { label: 'Distance', value: distance },
  ]
})

// --- meta -------------------------------------------------------------------
const cover = computed(() => {
  const t = trip.value
  if (!t) return ''
  if (t.photos[0]) return t.photos[0]
  for (const p of t.places) if (p.photos[0]) return p.photos[0]
  return ''
})
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
const glass = (extra: Style = {}) =>
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
        minHeight: isMobile.value ? 200 : 280,
        borderRadius: 24,
        overflow: 'hidden',
        border: '1px solid ' + c.value.border,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundImage:
          'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.78)), url(' + cover.value + ')',
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
// Stats row
const statsRow = pxify({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
})
const statCard = computed(() =>
  glass({ padding: '12px 10px', borderRadius: 16, textAlign: 'center' }),
)
const statValue = computed(() => pxify({ fontSize: 18, fontWeight: 800, color: c.value.text }))
const statLabel = computed(() =>
  pxify({
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
    marginTop: 2,
  }),
)
// View toggle + day filter
const toolbar = pxify({ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' })
const segTrack = computed(() =>
  pxify({
    display: 'inline-flex',
    padding: 4,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    gap: 2,
  }),
)
function segBtn(activeState: boolean) {
  return pxify({
    padding: '6px 14px',
    borderRadius: 9,
    border: 'none',
    background: activeState ? c.value.card : 'transparent',
    color: activeState ? c.value.accent : c.value.dim,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  })
}
const chipRow = pxify({ display: 'flex', gap: 6, flexWrap: 'wrap' })
function dayChip(selected: boolean, tint: string) {
  return pxify({
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid ' + (selected ? tint : c.value.border),
    background: selected ? c.value.input : 'transparent',
    color: selected ? tint : c.value.dim,
    cursor: 'pointer',
  })
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

      <!-- Stats -->
      <div :style="statsRow">
        <div v-for="stat in stats" :key="stat.label" :style="statCard">
          <div :style="statValue">{{ stat.value }}</div>
          <div :style="statLabel">{{ stat.label }}</div>
        </div>
      </div>

      <!-- View toggle + day filter -->
      <div :style="toolbar">
        <div :style="segTrack">
          <button :style="segBtn(view === 'itinerary')" @click="view = 'itinerary'">
            Itinerary
          </button>
          <button :style="segBtn(view === 'map')" @click="view = 'map'">Map</button>
        </div>
        <div v-if="view === 'map' && days.length" :style="chipRow">
          <button :style="dayChip(selectedDay === null, c.accent)" @click="selectedDay = null">
            All
          </button>
          <button
            v-for="d in days.filter((g) => !g.unscheduled)"
            :key="d.key"
            :style="dayChip(selectedDay === d.dayNumber, dayColor(d.dayNumber - 1))"
            @click="selectedDay = d.dayNumber"
          >
            Day {{ d.dayNumber }}
          </button>
        </div>
      </div>

      <!-- Map -->
      <div v-show="view === 'map'" ref="mapSection">
        <TripMap
          v-if="hasPins"
          :places="mapPlaces"
          :active="activePlace"
          :color-by-id="placeMeta.color"
          :number-by-id="placeMeta.number"
          :height="isMobile ? 300 : 420"
        />
        <div
          v-else
          :style="glass({ padding: '28px', textAlign: 'center', color: c.dim, fontSize: 13 })"
        >
          No places have a location yet.
        </div>
      </div>

      <!-- Itinerary / segmented timeline -->
      <div v-show="view === 'itinerary'">
        <TripItinerary :days="days" :active="activePlace" @select="focusPlace" @photo="openPhoto" />
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
    :photos="photoModel.urls"
    :captions="photoModel.captions"
    :index="lightboxIndex"
    @update:index="lightboxIndex = $event"
    @close="closeLightbox"
  />
</template>

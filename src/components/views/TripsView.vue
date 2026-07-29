<script setup lang="ts">
// The Trips tab. Two glass sub-tabs — To Visit and Done — over the same trip
// list, each card showing the trip name, date, tags and a small static map of
// its places. A trip is opened in its detail dialog (map, ordered places,
// timeline). A one-tap "Visited" moves a To-Visit trip to Done (prompting for
// the date); the card then leaves its list with the same FLIP migration the
// day accordions use. Filter by tag and sort by date or name in both sub-tabs.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip } from '@/styles'
import { ymd } from '@/utils/dayGroups'
import TripMap from '@/components/trips/TripMap.vue'
import type { Trip, TripStatus } from '@/types'

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { trips } = storeToRefs(app)

// N / ⌘K opens the create dialog for this tab.
defineExpose({ focus: () => app.openCreate('trip') })

const sub = ref<TripStatus>('tovisit')
const filterTag = ref('')
const sortKey = ref<'date' | 'name'>('date')

// One-tap move-to-Done: a tiny inline date prompt on the card being marked.
const promptId = ref<number | null>(null)
const promptDate = ref('')

const allTags = computed(() => {
  const set = new Set<string>()
  trips.value.forEach((t) => t.tag && set.add(t.tag))
  return [...set].sort()
})

function tripDate(t: Trip): string {
  return t.status === 'done' ? t.visitedDate || t.date : t.date
}
const list = computed<Trip[]>(() => {
  let out = trips.value.filter((t) => t.status === sub.value)
  if (filterTag.value) out = out.filter((t) => t.tag === filterTag.value)
  out = [...out].sort((a, b) =>
    sortKey.value === 'name'
      ? a.title.localeCompare(b.title)
      : (tripDate(b) || '').localeCompare(tripDate(a) || ''),
  )
  return out
})
const counts = computed(() => ({
  tovisit: trips.value.filter((t) => t.status === 'tovisit').length,
  done: trips.value.filter((t) => t.status === 'done').length,
}))

function dateLabel(t: Trip): string {
  const value = tripDate(t)
  if (!value) return 'No date'
  const label = new Date(value + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return (t.status === 'done' ? 'Visited ' : '') + label
}
function pinned(t: Trip) {
  return t.places.filter((p) => p.lat != null && p.lng != null)
}

function startVisited(t: Trip) {
  promptId.value = t.id
  promptDate.value = t.visitedDate || ymd(new Date())
}
function confirmVisited(t: Trip) {
  app.moveTripToDone(t.id, promptDate.value)
  promptId.value = null
}
function reopen(t: Trip) {
  app.moveTripToVisit(t.id)
}

// --- swipe between sub-tabs (mobile), without triggering the global tab swipe
let touchX: number | null = null
function onTouchStart(e: TouchEvent) {
  touchX = e.touches[0].clientX
}
function onTouchEnd(e: TouchEvent) {
  if (touchX == null) return
  const dx = e.changedTouches[0].clientX - touchX
  touchX = null
  if (Math.abs(dx) < 60) return
  e.stopPropagation()
  sub.value = dx < 0 ? 'done' : 'tovisit'
}

// --- styles -----------------------------------------------------------------
const segTrack = computed(() =>
  pxify({
    display: 'flex',
    padding: 4,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    gap: 2,
  }),
)
function segBtn(active: boolean) {
  return pxify({
    flex: 1,
    padding: '8px 12px',
    borderRadius: 9,
    border: 'none',
    background: active ? c.value.card : 'transparent',
    color: active ? c.value.accent : c.value.dim,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  })
}
const segCount = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
const toolbar = pxify({ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' })
const selectStyle = computed(() =>
  pxify({
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    color: c.value.text,
    fontSize: 12,
    cursor: 'pointer',
  }),
)
const cardsWrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  position: 'relative',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: 2,
})
const cardStyle = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    cursor: 'pointer',
  }),
)
const thumbWrap = pxify({ position: 'relative', width: '100%' })
const noMap = computed(() =>
  pxify({
    width: '100%',
    height: 110,
    borderRadius: 14,
    border: '1px dashed ' + c.value.border,
    display: 'grid',
    placeItems: 'center',
    color: c.value.dim,
    fontSize: 11.5,
    background: c.value.input,
  }),
)
const titleStyle = computed(() =>
  pxify({ fontSize: 15, fontWeight: 700, color: c.value.text, lineHeight: 1.3 }),
)
const metaRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' })
const dateStyle = computed(() => pxify({ fontSize: 11.5, color: c.value.dim }))
function chip(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
const placeCount = computed(() =>
  pxify({
    fontSize: 10.5,
    color: c.value.dim,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }),
)
const actionsRow = pxify({ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' })
const visitBtn = computed(() =>
  pxify({
    fontSize: 11.5,
    fontWeight: 600,
    padding: '7px 12px',
    borderRadius: 11,
    border: '1px solid ' + c.value.accent,
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
const ghostBtn = computed(() =>
  pxify({
    fontSize: 11.5,
    fontWeight: 600,
    padding: '7px 12px',
    borderRadius: 11,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.text,
    cursor: 'pointer',
  }),
)
const del = computed(() =>
  pxify({
    background: 'none',
    border: 'none',
    color: c.value.dim,
    fontSize: 18,
    cursor: 'pointer',
  }),
)
const promptRow = computed(() =>
  pxify({
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '8px 10px',
    borderRadius: 12,
    background: c.value.input,
  }),
)
const promptInput = computed(() =>
  pxify({
    padding: '7px 10px',
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    color: c.value.text,
    fontSize: 12,
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <!-- Header + create -->
    <div :style="pxify({ display: 'flex', alignItems: 'center', gap: 10 })">
      <span :style="pxify({ flex: 1, fontSize: 15, fontWeight: 700, color: c.text })">Trips</span>
      <button :style="s.newBtn" @click="app.openCreate('trip')">New trip</button>
    </div>

    <!-- Sub-tabs -->
    <div :style="segTrack">
      <button :style="segBtn(sub === 'tovisit')" @click="sub = 'tovisit'">
        To visit <span :style="segCount">{{ counts.tovisit }}</span>
      </button>
      <button :style="segBtn(sub === 'done')" @click="sub = 'done'">
        Done <span :style="segCount">{{ counts.done }}</span>
      </button>
    </div>

    <!-- Filter + sort -->
    <div :style="toolbar">
      <select :style="selectStyle" v-model="filterTag" aria-label="Filter by tag">
        <option value="">All tags</option>
        <option v-for="t in allTags" :key="t" :value="t">{{ t }}</option>
      </select>
      <select :style="selectStyle" v-model="sortKey" aria-label="Sort trips">
        <option value="date">By date</option>
        <option value="name">By name</option>
      </select>
    </div>

    <div v-if="list.length === 0" :style="s.empty">
      {{
        sub === 'tovisit' ? 'No trips to visit yet — plan one.' : 'No visited trips recorded yet.'
      }}
    </div>

    <!-- Cards -->
    <TransitionGroup
      name="rowflip"
      tag="div"
      :style="cardsWrap"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div v-for="t in list" :key="t.id" :style="cardStyle" @click="app.openEdit('trip', t.id)">
        <div :style="thumbWrap" @click.stop="app.openEdit('trip', t.id)">
          <TripMap v-if="pinned(t).length" :places="t.places" :interactive="false" :height="110" />
          <div v-else :style="noMap">No map yet — add a place</div>
        </div>

        <span :style="titleStyle">{{ t.title || 'Untitled trip' }}</span>
        <div :style="metaRow">
          <span :style="dateStyle">{{ dateLabel(t) }}</span>
          <span :style="placeCount"
            >📍 {{ t.places.length }} place{{ t.places.length === 1 ? '' : 's' }}</span
          >
          <span v-if="t.tag" :style="chip(t.tag)">{{ t.tag }}</span>
        </div>

        <!-- Inline visited-date prompt -->
        <div v-if="promptId === t.id" :style="promptRow" @click.stop>
          <span :style="dateStyle">Visited on</span>
          <input :style="promptInput" type="date" v-model="promptDate" />
          <button :style="visitBtn" @click="confirmVisited(t)">Confirm</button>
          <button :style="ghostBtn" @click="promptId = null">Cancel</button>
        </div>

        <div v-else :style="actionsRow" @click.stop>
          <button v-if="t.status === 'tovisit'" :style="visitBtn" @click="startVisited(t)">
            ✓ Visited
          </button>
          <button v-else :style="ghostBtn" @click="reopen(t)">Move to To-visit</button>
          <button :style="ghostBtn" @click="app.openEdit('trip', t.id)">Open</button>
          <button :style="ghostBtn" @click="app.share('trip', t)">Share ↗</button>
          <span :style="pxify({ flex: 1 })"></span>
          <button
            :style="del"
            title="Delete trip"
            @click="app.deleteWithUndo('trips', 'trip', t.id)"
          >
            ×
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
// The Trips tab. Two glass sub-tabs — To Visit and Done — over the same trip
// list, each card showing the trip name, date, tags and a small static map of
// its places. A trip is opened in its detail dialog (map, ordered places,
// timeline). A one-tap "Visited" moves a To-Visit trip to Done (prompting for
// the date); the card then leaves its list with the same FLIP migration the
// day accordions use. Filter by tag and sort by date or name in both sub-tabs.
import { computed, nextTick, onMounted, ref } from 'vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip, typeStep } from '@/styles'
import { ymd } from '@/utils/dayGroups'
import SmartImage from '@/components/trips/SmartImage.vue'
import type { Trip, TripStatus } from '@/types'

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { trips } = storeToRefs(app)

// Module-scoped so it survives this view unmounting when you open a trip's full
// page — coming back restores where the list was scrolled.
let savedScroll = 0
const scroller = ref<HTMLElement | null>(null)
function onScroll() {
  if (scroller.value) savedScroll = scroller.value.scrollTop
}
onMounted(() => {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = savedScroll
  })
})

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
// The card's lead image is the trip's cover photo — the trip's first photo, or
// the first photo of any place. SmartImage shows a placeholder if there is none.
function coverOf(t: Trip): string {
  if (t.photos[0]) return t.photos[0]
  for (const p of t.places) if (p.photos[0]) return p.photos[0]
  return ''
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
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    gap: 2,
  }),
)
function segBtn(active: boolean) {
  return pxify({
    flex: 1,
    padding: '8px 12px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: active ? c.value.card : 'transparent',
    color: active ? c.value.accent : c.value.dim,
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--sp-2)',
  })
}
const segCount = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
const toolbar = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  alignItems: 'center',
  flexWrap: 'wrap',
})
const scrollerStyle = pxify({ flex: 1, minHeight: 0, overflowY: 'auto', padding: 2 })
const cardsWrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-3)',
  position: 'relative',
})
const cardStyle = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    padding: 12,
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    cursor: 'pointer',
  }),
)
const thumbWrap = pxify({ position: 'relative', width: '100%' })
const titleStyle = computed(() =>
  pxify({
    ...typeStep('base'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    lineHeight: 1.3,
  }),
)
const metaRow = pxify({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
})
const dateStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
function chip(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
const placeCount = computed(() =>
  pxify({
    ...typeStep('2xs'),
    color: c.value.dim,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
  }),
)
const actionsRow = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  alignItems: 'center',
  flexWrap: 'wrap',
})
const visitBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '7px 12px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.accent,
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
const ghostBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '7px 12px',
    borderRadius: 'var(--radius-card)',
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
    ...typeStep('md'),
    cursor: 'pointer',
  }),
)
const promptRow = computed(() =>
  pxify({
    display: 'flex',
    gap: 'var(--sp-2)',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    background: c.value.input,
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <!-- Header + create -->
    <div :style="pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' })">
      <span
        :style="
          pxify({
            flex: 1,
            ...typeStep('base'),
            fontWeight: 'var(--weight-semibold)',
            color: c.text,
          })
        "
        >Trips</span
      >
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
      <Select
        v-model="filterTag"
        aria-label="Filter by tag"
        :options="[
          { value: '', label: 'All tags' },
          ...allTags.map((t) => ({ value: String(t), label: t })),
        ]"
      />
      <Select
        v-model="sortKey"
        aria-label="Sort trips"
        :options="[
          { value: 'date', label: 'By date' },
          { value: 'name', label: 'By name' },
        ]"
      />
    </div>

    <div v-if="list.length === 0" :style="s.empty">
      {{
        sub === 'tovisit' ? 'No trips to visit yet — plan one.' : 'No visited trips recorded yet.'
      }}
    </div>

    <!-- Cards -->
    <div
      ref="scroller"
      :style="scrollerStyle"
      @scroll="onScroll"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <TransitionGroup name="rowflip" tag="div" :style="cardsWrap">
        <div v-for="t in list" :key="t.id" :style="cardStyle" @click="app.openEdit('trip', t.id)">
          <div :style="thumbWrap" @click.stop="app.openEdit('trip', t.id)">
            <SmartImage :src="coverOf(t)" :height="110" :radius="14" />
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
            <GlassDatePicker v-model="promptDate" size="sm" placeholder="Visited on" />
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
  </div>
</template>

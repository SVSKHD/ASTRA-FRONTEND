<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import ListToolbar from '@/components/ListToolbar.vue'
import type { Trip } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { trips } = storeToRefs(app)

// Create and edit both live in ItemDialog now, so N / ⌘K opens that rather
// than focusing a form this tab no longer carries.
defineExpose({ focus: () => app.openCreate('trip') })

interface TripGroup {
  date: string
  label: string
  locations: Trip[]
}

function dayLabel(value: string) {
  const today = localDateValue()
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = localDateValue(tomorrowDate)
  if (value === today) return 'Today'
  if (value === tomorrow) return 'Tomorrow'
  return new Date(value + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const groups = computed<TripGroup[]>(() => {
  const byDate = new Map<string, Trip[]>()
  const sorted = [...trips.value].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date.localeCompare(b.date),
  )
  sorted.forEach((trip) => {
    const items = byDate.get(trip.date) || []
    items.push(trip)
    byDate.set(trip.date, items)
  })
  return [...byDate.entries()].map(([groupDate, locations]) => ({
    date: groupDate,
    label: dayLabel(groupDate),
    locations,
  }))
})

const groupStyle = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    borderRadius: 18,
    border: '1px dashed ' + c.value.border,
    background: 'rgba(255,255,255,0.015)',
  }),
)
const row = computed(() => pxify(rowBase(c.value)))
const pinWrap = computed(() =>
  pxify({
    width: 34,
    height: 34,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 12,
    color: c.value.accent,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
const locationName = computed(() =>
  pxify({ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: c.value.text }),
)
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Trips" new-label="New trip" @new="app.openCreate('trip')" />

    <div v-if="trips.length === 0" :style="s.empty">No trips planned — add a day and location.</div>

    <div :style="s.dayGroups">
      <section v-for="group in groups" :key="group.date" :style="groupStyle">
        <div :style="s.dayGroupHead">
          <span :style="s.dayGroupLabelBase">{{ group.label }}</span>
          <span :style="s.dayCount">{{ group.locations.length }}</span>
        </div>

        <div v-for="trip in group.locations" :key="trip.id" :style="row" v-hover-style="s.rowHover">
          <span :style="pinWrap" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              :stroke="c.accent"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </span>
          <div :style="s.taskMain" @click="app.openEdit('trip', trip.id)">
            <span :style="locationName">{{ trip.location }}</span>
            <span :style="s.finMeta">{{ group.label }}</span>
          </div>
          <button :style="s.editBtn" @click="app.openEdit('trip', trip.id)">Edit</button>
          <button :style="s.shareBtn" @click="app.share('trip', trip)">↗</button>
          <button :style="s.del" @click="app.deleteWithUndo('trips', 'trip', trip.id)">×</button>
        </div>
      </section>
    </div>
  </div>
</template>

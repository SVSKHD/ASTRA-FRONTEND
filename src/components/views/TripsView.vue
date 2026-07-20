<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import type { Trip } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { trips, editing, draft } = storeToRefs(app)

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const location = ref('')
const date = ref(localDateValue())
const locationInputRef = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => locationInputRef.value?.focus() })

function add() {
  const place = location.value.trim()
  if (!place || !date.value) {
    app.showToastMsg('Add both a day and location')
    return
  }
  app.addTrip(place, date.value)
  location.value = ''
  locationInputRef.value?.focus()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') add()
}

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

function isEditing(trip: Trip) {
  return editing.value.type === 'trip' && editing.value.id === trip.id
}

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
    <div :style="s.inputRow">
      <input
        ref="locationInputRef"
        v-model="location"
        :style="s.input"
        placeholder="Add a location…"
        @keydown="onKey"
      />
    </div>
    <div :style="s.inputRow">
      <input v-model="date" :style="s.input" type="date" aria-label="Trip day" />
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" aria-label="Add trip" @click="add">
        +
      </button>
    </div>

    <div v-if="trips.length === 0" :style="s.empty">No trips planned — add a day and location.</div>

    <div :style="s.dayGroups">
      <section v-for="group in groups" :key="group.date" :style="groupStyle">
        <div :style="s.dayGroupHead">
          <span :style="s.dayGroupLabelBase">{{ group.label }}</span>
          <span :style="s.dayCount">{{ group.locations.length }}</span>
        </div>

        <div v-for="trip in group.locations" :key="trip.id" :style="row" v-hover-style="s.rowHover">
          <template v-if="isEditing(trip)">
            <div
              :style="s.taskMain"
              @keydown.enter="app.saveEdit()"
              @keydown.esc="app.cancelEdit()"
            >
              <input
                :style="s.editInput"
                :value="draft.location as string"
                autofocus
                @input="app.setDraft('location', ($event.target as HTMLInputElement).value)"
              />
              <input
                :style="s.editInputSmall"
                type="date"
                :value="draft.date as string"
                @input="app.setDraft('date', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <button :style="s.saveBtn" @click="app.saveEdit()">Save</button>
            <button :style="s.cancelBtn" @click="app.cancelEdit()">Cancel</button>
          </template>

          <template v-else>
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
            <div :style="s.taskMain">
              <button
                :style="{
                  ...locationName,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                }"
                @click="app.startEdit('trip', trip)"
              >
                {{ trip.location }}
              </button>
              <span :style="s.finMeta">{{ group.label }}</span>
            </div>
            <button :style="s.editBtn" @click="app.startEdit('trip', trip)">Edit</button>
            <button :style="s.shareBtn" @click="app.share('trip', trip)">↗</button>
            <button :style="s.del" @click="app.deleteWithUndo('trips', 'trip', trip.id)">×</button>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

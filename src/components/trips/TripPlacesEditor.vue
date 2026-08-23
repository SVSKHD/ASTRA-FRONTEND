<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
// The ordered list of places inside a trip: add, edit, remove and drag to
// reorder. Each place carries its own map location (via the Nominatim search),
// its own visited date & time, rich notes (the slash-command editor) and photo
// URLs. Reordering rewrites the trip's place order, which is what renumbers the
// map pins and the timeline.
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import LocationSearch from '@/components/trips/LocationSearch.vue'
import RichEditor from '@/components/RichEditor.vue'
import type { GeoResult } from '@/utils/geo'
import type { TripPlace } from '@/types'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const props = defineProps<{ tripId: number; places: TripPlace[]; active: number | null }>()
const emit = defineEmits<{ (e: 'select', placeId: number): void }>()

const app = useAppStore()
const { c } = useStyles()

const expanded = ref<Set<number>>(new Set())
function toggle(id: number) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
function isOpen(id: number) {
  return expanded.value.has(id)
}

function add() {
  const newId = app.addTripPlace(props.tripId)
  if (newId != null) {
    const next = new Set(expanded.value)
    next.add(newId)
    expanded.value = next
  }
}
function onLocation(place: TripPlace, r: GeoResult) {
  app.updateTripPlace(props.tripId, place.id, {
    name: place.name || r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
  })
  emit('select', place.id)
}
function setField(place: TripPlace, field: keyof TripPlace, value: unknown) {
  app.updateTripPlace(props.tripId, place.id, { [field]: value } as Partial<TripPlace>)
}
function remove(place: TripPlace) {
  app.removeTripPlace(props.tripId, place.id)
}

// Photos ---------------------------------------------------------------------
const photoDraft = ref<Record<number, string>>({})
function addPhoto(place: TripPlace) {
  const url = (photoDraft.value[place.id] || '').trim()
  if (!url) return
  app.updateTripPlace(props.tripId, place.id, { photos: [...place.photos, url] })
  photoDraft.value = { ...photoDraft.value, [place.id]: '' }
}
function removePhoto(place: TripPlace, i: number) {
  app.updateTripPlace(props.tripId, place.id, {
    photos: place.photos.filter((_, idx) => idx !== i),
  })
}

// Drag to reorder ------------------------------------------------------------
const dragId = ref<number | null>(null)
function onDragStart(e: DragEvent, place: TripPlace) {
  dragId.value = place.id
  try {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', String(place.id))
  } catch {
    /* ignore */
  }
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  try {
    e.dataTransfer!.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}
function onDrop(target: TripPlace) {
  const from = dragId.value
  dragId.value = null
  if (from == null || from === target.id) return
  const ids = props.places.map((p) => p.id)
  const fromIdx = ids.indexOf(from)
  const toIdx = ids.indexOf(target.id)
  if (fromIdx < 0 || toIdx < 0) return
  ids.splice(fromIdx, 1)
  ids.splice(toIdx, 0, from)
  app.reorderTripPlaces(props.tripId, ids)
}

// Styles ---------------------------------------------------------------------
function cardStyle(place: TripPlace) {
  return pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + (place.id === props.active ? c.value.accent : c.value.border),
    background: c.value.card,
    opacity: dragId.value === place.id ? 0.5 : 1,
  })
}
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' })
function numBadge(active: boolean) {
  return pxify({
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    background: active ? c.value.accent : c.value.input,
    color: active ? c.value.onAccent : c.value.text,
    border: '1px solid ' + c.value.border,
    cursor: 'pointer',
  })
}
const grip = pxify({
  cursor: 'grab',
  color: 'currentColor',
  opacity: 0.4,
  ...typeStep('base'),
  flexShrink: 0,
})
const nameBtn = () =>
  pxify({
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: c.value.text,
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  })
const iconBtn = () =>
  pxify({
    flexShrink: 0,
    width: 26,
    height: 26,
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    ...typeStep('base'),
  })
const labelStyle = () =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
  })
pxify({
  width: '100%',
  padding: '9px 11px',
  borderRadius: 'var(--radius-card)',
  border: '1px solid ' + c.value.border,
  background: c.value.input,
  color: c.value.text,
  ...typeStep('sm'),
})
const field = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' })
const photoRow = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
  alignItems: 'center',
})
const photoThumb = () =>
  pxify({
    width: 46,
    height: 46,
    borderRadius: 'var(--radius-control)',
    objectFit: 'cover',
    position: 'relative',
  })
const addBtn = () =>
  pxify({
    alignSelf: 'flex-start',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '9px 14px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    color: c.value.accent,
    cursor: 'pointer',
  })
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 10px">
    <div
      v-for="(place, i) in places"
      :key="place.id"
      :style="cardStyle(place)"
      draggable="true"
      @dragstart="onDragStart($event, place)"
      @dragover="onDragOver"
      @drop="onDrop(place)"
    >
      <div :style="headRow">
        <span :style="grip" title="Drag to reorder">⠿</span>
        <button
          :style="numBadge(place.id === active)"
          title="Show on map"
          @click="emit('select', place.id)"
        >
          {{ i + 1 }}
        </button>
        <button :style="nameBtn()" @click="toggle(place.id)">
          {{ place.name || 'Untitled place' }}
        </button>
        <button
          :style="iconBtn()"
          :title="isOpen(place.id) ? 'Collapse' : 'Edit'"
          @click="toggle(place.id)"
        >
          {{ isOpen(place.id) ? '▾' : '✎' }}
        </button>
        <button :style="iconBtn()" title="Remove place" @click="remove(place)">×</button>
      </div>

      <template v-if="isOpen(place.id)">
        <div :style="field">
          <span :style="labelStyle()">Location</span>
          <LocationSearch
            :model-value="place.name"
            placeholder="Search a place…"
            @update:model-value="setField(place, 'name', $event)"
            @select="onLocation(place, $event)"
          />
          <span v-if="place.address" :style="{ ...typeStep('2xs'), color: c.dim }">
            📍 {{ place.address }}
          </span>
        </div>

        <div :style="field">
          <span :style="labelStyle()">Visited date &amp; time</span>
          <GlassDatePicker
            mode="datetime"
            size="sm"
            :model-value="place.visitedAt"
            placeholder="Visited at"
            @update:model-value="setField(place, 'visitedAt', String($event ?? ''))"
          />
        </div>

        <div :style="field">
          <span :style="labelStyle()">Notes</span>
          <RichEditor
            :model-value="place.notes"
            placeholder="What happened here? Type / for commands…"
            @update:model-value="setField(place, 'notes', $event)"
          />
        </div>

        <div :style="field">
          <span :style="labelStyle()">Photos</span>
          <div v-if="place.photos.length" :style="photoRow">
            <span
              v-for="(url, pi) in place.photos"
              :key="pi"
              style="position: relative; display: inline-flex"
            >
              <img :src="url" :style="photoThumb()" alt="Trip photo" loading="lazy" />
              <button
                :style="{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: 'none',
                  background: c.card,
                  color: c.dim,
                  cursor: 'pointer',
                  ...typeStep('xs'),
                }"
                title="Remove photo"
                @click="removePhoto(place, pi)"
              >
                ×
              </button>
            </span>
          </div>
          <div :style="photoRow">
            <TextInput
              type="url"
              placeholder="Paste an image URL…"
              :model-value="photoDraft[place.id] || ''"
              @update:model-value="
                photoDraft = {
                  ...photoDraft,
                  [place.id]: $event,
                }
              "
              @keydown.enter.prevent="addPhoto(place)"
            />
            <button :style="iconBtn()" title="Add photo" @click="addPhoto(place)">+</button>
          </div>
        </div>
      </template>
    </div>

    <button :style="addBtn()" @click="add">+ Add place</button>
  </div>
</template>

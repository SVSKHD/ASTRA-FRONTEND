<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
// The trip's own dialog — it owns both create and edit (the generic ItemDialog
// stands aside for trips). Create is a short form; saving it opens the trip here
// in edit mode, where the map, the ordered places, the timeline and attached
// notes all live. A sticky Map ↔ Timeline toggle sits at the top of the body so
// it stays reachable while the content scrolls, on mobile and desktop alike.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { DANGER, pxify, type Style, typeStep } from '@/styles'
import { ymd } from '@/utils/dayGroups'
import TagPicker from '@/components/TagPicker.vue'
// Leaflet is ~43KB gzipped and only ever needed once a trip's map is on screen,
// so the map arrives with the dialog rather than with the app.
const TripMap = defineAsyncComponent(() => import('@/components/trips/TripMap.vue'))
import TripTimeline from '@/components/trips/TripTimeline.vue'
import TripPlacesEditor from '@/components/trips/TripPlacesEditor.vue'
import { noteTitle } from '@/utils/notes'
import type { Note, Trip } from '@/types'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const app = useAppStore()
const router = useRouter()
const { c, s, isMobile } = useStyles()
const { itemDialog, dialogDraft, dialogClosing, trips } = storeToRefs(app)

// The dialog is a quick view; the full page is the whole trip. Opening it closes
// the dialog and deep-links to /trips/:id.
function openFullPage() {
  const t = trip.value
  if (!t) return
  app.closeItemDialog()
  router.push('/trips/' + t.id)
}

const isTrip = computed(() => itemDialog.value?.type === 'trip')
const isCreate = computed(() => itemDialog.value?.mode === 'create')
// Read the live trip straight from the store so every write-through is
// reflected without a local copy to reconcile.
const trip = computed<Trip | undefined>(() =>
  itemDialog.value && itemDialog.value.id != null
    ? trips.value.find((t) => t.id === itemDialog.value!.id)
    : undefined,
)

const view = ref<'map' | 'timeline'>('map')
const activePlace = ref<number | null>(null)
const visitedPromptOpen = ref(false)
const visitedDate = ref('')

watch(
  () => trip.value?.id,
  () => {
    view.value = 'map'
    activePlace.value = null
    visitedPromptOpen.value = false
  },
)

// Clicking a place badge or a timeline node highlights that pin on the map.
function focusPlace(id: number) {
  activePlace.value = id
  view.value = 'map'
}

// --- create-mode draft ------------------------------------------------------
function draftVal(key: string): string {
  return String(dialogDraft.value[key] ?? '')
}
function setDraft(key: string, value: unknown) {
  app.setDialogDraft(key, value)
}
function createTrip() {
  app.commitCreate()
}

// --- edit-mode write-throughs ----------------------------------------------
function setTitle(v: string) {
  if (trip.value) app.updateTrip(trip.value.id, { title: v, location: v })
}
function setField(field: keyof Trip, value: unknown) {
  if (trip.value) app.updateTrip(trip.value.id, { [field]: value } as Partial<Trip>)
}
function markVisited() {
  visitedDate.value = trip.value?.visitedDate || ymd(new Date())
  visitedPromptOpen.value = true
}
function confirmVisited() {
  if (trip.value) app.moveTripToDone(trip.value.id, visitedDate.value)
  visitedPromptOpen.value = false
}
function reopenTrip() {
  if (trip.value) app.moveTripToVisit(trip.value.id)
}
function shareTrip() {
  if (trip.value) app.share('trip', trip.value)
}
function removeTrip() {
  if (trip.value) {
    const id = trip.value.id
    app.closeItemDialog()
    app.deleteWithUndo('trips', 'trip', id)
  }
}

// --- trip-level photos ------------------------------------------------------
const photoDraft = ref('')
function addPhoto() {
  const url = photoDraft.value.trim()
  if (!url || !trip.value) return
  app.updateTrip(trip.value.id, { photos: [...trip.value.photos, url] })
  photoDraft.value = ''
}
function removePhoto(i: number) {
  if (!trip.value) return
  app.updateTrip(trip.value.id, { photos: trip.value.photos.filter((_, idx) => idx !== i) })
}

// --- attached notes ---------------------------------------------------------
const attachedNotes = computed<Note[]>(() =>
  trip.value ? app.notes.filter((n) => trip.value!.noteIds.includes(n.id)) : [],
)
const unattachedNotes = computed<Note[]>(() =>
  trip.value ? app.notes.filter((n) => !trip.value!.noteIds.includes(n.id)) : [],
)
// A one-shot action wearing a Select. The model is cleared after every pick,
// so the control keeps reading "Attach a note…" rather than showing the last
// note attached, which is not a value anybody set.
const attachChoice = ref('')
function attachNote(value: string) {
  const nid = Number(value)
  attachChoice.value = ''
  if (nid && trip.value) app.attachNote('trip', trip.value.id, nid)
}

// --- styles -----------------------------------------------------------------
const cardBase = computed<Style>(() => ({
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 16,
  width: isMobile.value ? 'calc(100vw - 20px)' : 'min(94vw, 760px)',
  height: isMobile.value ? 'calc(100vh - 20px)' : 'min(88vh, 860px)',
  background: c.value.glass,
  backdropFilter: 'blur(30px) saturate(1.6)',
  '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
  border: '1px solid ' + c.value.border,
  borderRadius: isMobile.value ? 22 : 28,
  boxShadow: c.value.shadow,
  color: c.value.text,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: dialogClosing.value
    ? 'springOut .22s ease forwards'
    : 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
}))
const cardStyle = computed(() => pxify(cardBase.value))
const createCardStyle = computed(() =>
  pxify({ ...cardBase.value, height: 'auto', maxHeight: '86vh' }),
)
const headerStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: isMobile.value ? '16px 16px 10px' : '20px 22px 12px',
    borderBottom: '1px solid ' + c.value.border,
  }),
)
function statusBadge(done: boolean) {
  return pxify({
    flexShrink: 0,
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '4px 9px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + (done ? c.value.accent : c.value.border),
    color: done ? c.value.accent : c.value.dim,
    background: done ? c.value.input : 'transparent',
  })
}
const bodyStyle = pxify({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  padding: '14px 18px 20px',
})
const stickyBar = computed(() =>
  pxify({
    position: 'sticky',
    top: -14,
    zIndex: 5,
    margin: '-14px -18px 0',
    padding: '10px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    flexWrap: 'wrap',
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(24px) saturate(1.6)',
    borderBottom: '1px solid ' + c.value.border,
  }),
)
const segTrack = computed(() =>
  pxify({
    display: 'inline-flex',
    padding: 4,
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    gap: 2,
  }),
)
function segBtn(activeState: boolean) {
  return pxify({
    padding: '6px 14px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: activeState ? c.value.card : 'transparent',
    color: activeState ? c.value.accent : c.value.dim,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    boxShadow: activeState ? 'inset 0 1px 0 rgba(255,255,255,0.25)' : 'none',
  })
}
const primaryBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '8px 14px',
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
    padding: '8px 12px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.text,
    cursor: 'pointer',
  }),
)
const labelStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const fieldRaw: Style = { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }
const field = pxify(fieldRaw)
const sectionTitle = computed(() =>
  pxify({
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    marginTop: 4,
  }),
)
const rowWrapRaw: Style = { display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }
const rowWrap = pxify(rowWrapRaw)
const del = computed(() =>
  pxify({
    background: 'none',
    border: 'none',
    color: c.value.dim,
    ...typeStep('lg'),
    cursor: 'pointer',
    flexShrink: 0,
  }),
)
const iconBtn = computed(() =>
  pxify({
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    ...typeStep('base'),
  }),
)
const noteChip = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    ...typeStep('xs'),
    padding: '4px 8px',
    borderRadius: 'var(--radius-control)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.text,
    cursor: 'pointer',
  }),
)
const photoThumb = pxify({
  width: 60,
  height: 60,
  borderRadius: 'var(--radius-card)',
  objectFit: 'cover',
})
const dangerBtn = computed(() =>
  pxify({
    alignSelf: 'flex-start',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: DANGER,
    cursor: 'pointer',
  }),
)
</script>

<template>
  <template v-if="isTrip">
    <div :style="s.dialogOverlay" @click="app.closeItemDialog()"></div>

    <!-- Create: a short form. Saving it opens the trip in edit mode below. -->
    <div v-if="isCreate" :style="createCardStyle">
      <div :style="headerStyle">
        <span :style="pxify({ flex: 1, ...typeStep('md'), fontWeight: 'var(--weight-semibold)' })"
          >New trip</span
        >
        <button :style="del" aria-label="Close" @click="app.closeItemDialog()">×</button>
      </div>
      <div :style="bodyStyle" @keydown.esc="app.closeItemDialog()">
        <div :style="field">
          <span :style="labelStyle">Trip name</span>
          <TextInput
            :model-value="draftVal('title')"
            placeholder="Weekend in Lisbon…"
            autofocus
            @update:model-value="setDraft('title', $event)"
            @keydown.enter.prevent="createTrip()"
          />
        </div>
        <div :style="field">
          <span :style="labelStyle">Planned date</span>
          <GlassDatePicker
            :model-value="draftVal('date')"
            placeholder="Planned date"
            @update:model-value="setDraft('date', String($event ?? ''))"
          />
        </div>
        <div :style="field">
          <span :style="labelStyle">Notes</span>
          <TextArea
            :model-value="draftVal('description')"
            placeholder="What's the plan?"
            @update:model-value="setDraft('description', $event)"
          />
        </div>
        <TagPicker
          :model-value="draftVal('tag')"
          label="Tag"
          @update:model-value="setDraft('tag', $event)"
        />
        <div :style="pxify({ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' })">
          <button :style="ghostBtn" @click="app.closeItemDialog()">Cancel</button>
          <button :style="primaryBtn" @click="createTrip()">Create trip</button>
        </div>
      </div>
    </div>

    <!-- Edit: the full trip. -->
    <div v-else-if="trip" :style="cardStyle">
      <div :style="headerStyle">
        <TextInput
          :model-value="trip.title"
          placeholder="Trip name"
          @update:model-value="setTitle"
        />
        <span :style="statusBadge(trip.status === 'done')">
          {{ trip.status === 'done' ? 'Done' : 'To visit' }}
        </span>
        <button :style="iconBtn" title="Open full page" @click="openFullPage">⤢</button>
        <button :style="iconBtn" title="Share trip" @click="shareTrip">↗</button>
        <button :style="del" aria-label="Close" @click="app.closeItemDialog()">×</button>
      </div>

      <div :style="bodyStyle" @keydown.esc="app.closeItemDialog()">
        <!-- Sticky Map / Timeline toggle + one-tap visited -->
        <div :style="stickyBar">
          <div :style="segTrack">
            <button :style="segBtn(view === 'map')" @click="view = 'map'">Map</button>
            <button :style="segBtn(view === 'timeline')" @click="view = 'timeline'">
              Timeline
            </button>
          </div>
          <span :style="pxify({ flex: 1 })"></span>
          <button v-if="trip.status !== 'done'" :style="primaryBtn" @click="markVisited">
            Mark visited
          </button>
          <button v-else :style="ghostBtn" @click="reopenTrip">Move to To-visit</button>
        </div>

        <!-- Visited-date prompt -->
        <div v-if="visitedPromptOpen" :style="pxify({ ...rowWrapRaw, alignItems: 'flex-end' })">
          <div :style="pxify({ ...fieldRaw, flex: 1 })">
            <span :style="labelStyle">Visited on</span>
            <GlassDatePicker v-model="visitedDate" placeholder="Visited on" />
          </div>
          <button :style="primaryBtn" @click="confirmVisited">Confirm</button>
          <button :style="ghostBtn" @click="visitedPromptOpen = false">Cancel</button>
        </div>

        <!-- Map or timeline -->
        <TripMap
          v-if="view === 'map'"
          :places="trip.places"
          :active="activePlace"
          :height="isMobile ? 240 : 300"
          @select="focusPlace"
        />
        <TripTimeline v-else :places="trip.places" :active="activePlace" @select="focusPlace" />

        <!-- Details -->
        <div :style="field">
          <span :style="labelStyle">Description</span>
          <TextArea
            :model-value="trip.description"
            placeholder="Trip notes…"
            @update:model-value="setField('description', $event)"
          />
        </div>
        <div :style="rowWrap">
          <div :style="pxify({ ...fieldRaw, flex: 1, minWidth: 150 })">
            <span :style="labelStyle">Planned date</span>
            <GlassDatePicker
              :model-value="trip.date"
              placeholder="Planned date"
              @update:model-value="setField('date', String($event ?? ''))"
            />
          </div>
          <div
            v-if="trip.status === 'done'"
            :style="pxify({ ...fieldRaw, flex: 1, minWidth: 150 })"
          >
            <span :style="labelStyle">Visited date</span>
            <GlassDatePicker
              :model-value="trip.visitedDate"
              placeholder="Visited date"
              @update:model-value="setField('visitedDate', String($event ?? ''))"
            />
          </div>
        </div>
        <TagPicker
          :model-value="trip.tag"
          label="Tag"
          @update:model-value="setField('tag', $event)"
        />

        <!-- Places -->
        <span :style="sectionTitle">Places ({{ trip.places.length }})</span>
        <TripPlacesEditor
          :trip-id="trip.id"
          :places="trip.places"
          :active="activePlace"
          @select="focusPlace"
        />

        <!-- Trip photos -->
        <span :style="sectionTitle">Photos</span>
        <div v-if="trip.photos.length" :style="rowWrap">
          <span
            v-for="(url, i) in trip.photos"
            :key="i"
            style="position: relative; display: inline-flex"
          >
            <img :src="url" :style="photoThumb" alt="Trip photo" loading="lazy" />
            <button
              :style="
                pxify({
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: 'none',
                  background: c.card,
                  color: c.dim,
                  cursor: 'pointer',
                  ...typeStep('xs'),
                })
              "
              title="Remove photo"
              @click="removePhoto(i)"
            >
              ×
            </button>
          </span>
        </div>
        <div :style="rowWrap">
          <TextInput
            type="url"
            placeholder="Paste an image URL…"
            v-model="photoDraft"
            @keydown.enter.prevent="addPhoto"
          />
          <button :style="iconBtn" title="Add photo" @click="addPhoto">+</button>
        </div>

        <!-- Attached notes -->
        <span :style="sectionTitle">Notes</span>
        <div
          v-if="attachedNotes.length"
          :style="pxify({ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' })"
        >
          <span
            v-for="n in attachedNotes"
            :key="n.id"
            :style="noteChip"
            title="Open note"
            @click="app.openNoteView(n.id)"
          >
            {{ noteTitle(n.text) }}
            <span
              :style="pxify({ color: c.dim, cursor: 'pointer' })"
              title="Detach"
              @click.stop="app.detachNote('trip', trip.id, n.id)"
              >×</span
            >
          </span>
        </div>
        <Select
          :model-value="attachChoice"
          @update:model-value="attachNote"
          :options="[
            {
              value: '',
              label: `${unattachedNotes.length ? 'Attach a note…' : 'No more notes to attach'}`,
            },
            ...unattachedNotes.map((n) => ({ value: String(n.id), label: `${noteTitle(n.text)}` })),
          ]"
        />

        <button :style="dangerBtn" @click="removeTrip">Delete trip</button>
      </div>
    </div>
  </template>
</template>

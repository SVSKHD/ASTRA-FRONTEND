<script setup lang="ts">
// Standalone page for a shared item — deliberately NOT gated on the workspace.
// The previous SharedBanner rendered inside `v-if="showWorkspace"`, so a
// recipient who was not signed in, hydrated and unlocked saw nothing at all.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { fetchShare, type ShareDoc, type ShareLoad } from '@/utils/shares'
import { TYPE_BY_PLURAL } from '@/utils/share'
import ReminderTimeline from '@/components/ReminderTimeline.vue'
import TripDetail from '@/components/trips/TripDetail.vue'
import { repFreqLabel } from '@/utils/reminders'
import { STATUS_LABEL, isStatus, statusFromDone } from '@/types'
import type { ItemType, Reminder, Trip, TripPlace } from '@/types'

const props = defineProps<{ plural: string; shareId: string }>()

const router = useRouter()
const auth = useAuthStore()
const { c, s } = useStyles()
const { authReady, isSignedIn } = storeToRefs(auth)

const load = ref<ShareLoad | null>(null)
const share = computed<ShareDoc | null>(() =>
  load.value?.status === 'ready' ? load.value.share : null,
)

// The plural in the path is part of the link's identity; a note id served under
// /todos/ is a malformed link, not a note.
const expectedType = computed<ItemType | undefined>(() => TYPE_BY_PLURAL[props.plural])
const typeMismatch = computed(
  () => !!share.value && !!expectedType.value && share.value.type !== expectedType.value,
)

async function run() {
  load.value = null
  load.value = await fetchShare(props.shareId)
}

onMounted(run)
// A private share fetched while signed out returns needs-auth; retry once the
// visitor signs in so the page resolves without a manual refresh.
watch(isSignedIn, (signedIn) => {
  if (signedIn && load.value?.status === 'needs-auth') run()
})

const item = computed<Record<string, string | number>>(
  () => (share.value?.item || {}) as Record<string, string | number>,
)

const heading = computed(() => {
  if (!share.value) return 'Shared item'
  return 'Shared ' + share.value.type
})

// Shares captured before the three-state lifecycle only carry `done`.
function sharedStatus(it: Record<string, unknown>): string {
  const s = it.status
  return STATUS_LABEL[isStatus(s) ? s : statusFromDone(it.done)]
}

// Per-type summary lines. Notes render their stored HTML instead.
const lines = computed<string[]>(() => {
  const sv = share.value
  if (!sv || typeMismatch.value) return []
  const it = item.value
  const out: string[] = []
  if (sv.type === 'todo') {
    out.push(String(it.text ?? ''))
    if (it.description) out.push(String(it.description))
    if (it.tag) out.push('Tag: ' + it.tag)
    out.push('Status: ' + sharedStatus(it))
  }
  if (sv.type === 'task') {
    out.push(String(it.title ?? ''))
    if (it.tag) out.push('Tag: ' + it.tag)
    out.push('Status: ' + sharedStatus(it))
    if (it.deadline) out.push('Due: ' + it.deadline)
    if (it.repo) out.push('Repo: ' + it.repo)
    if (it.notes) out.push(String(it.notes))
  }
  if (sv.type === 'deadline') {
    out.push(String(it.title ?? ''))
    if (it.due) out.push('Due: ' + it.due)
  }
  if (sv.type === 'reminder') {
    out.push(String(it.title ?? ''))
    if (it.note) out.push(String(it.note))
    if (it.start) out.push('Starts: ' + it.start)
    // Without this the projected dates read as arbitrary: a 26-week repeat and
    // a 26-day one differ only in the gaps between rows.
    out.push('Repeats: ' + repFreqLabel(share.value?.item.repeat as Reminder['repeat']))
  }
  if (sv.type === 'finance') {
    out.push(String(it.note || it.category || ''))
    out.push('$' + Number(it.amount || 0).toFixed(2) + ' · ' + String(it.category ?? ''))
    if (it.date) out.push('On: ' + it.date)
  }
  // Trips render as the full TripDetail page (see sharedTrip), not text lines.
  if (sv.type === 'idea') {
    out.push(String(it.title ?? ''))
    if (it.description) out.push(String(it.description))
    if (it.ideaType) out.push('Type: ' + it.ideaType)
    if (it.tag) out.push('Tag: ' + it.tag)
    if (it.deadline) out.push('Deadline: ' + it.deadline)
  }
  if (sv.type === 'stock') {
    out.push(String(it.symbol ?? '') + (it.name ? ' · ' + it.name : ''))
    if (it.why) out.push(String(it.why))
    if (it.targetPrice) out.push('Target: ' + it.targetPrice)
    if (it.watchPrice) out.push('Watch: ' + it.watchPrice)
    if (it.tag) out.push('Tag: ' + it.tag)
  }
  return out.filter((line) => line !== '')
})

const isNote = computed(() => share.value?.type === 'note')
const noteHtml = computed(() => String(item.value.text ?? ''))

// A shared trip renders the exact same full detail page as /trips/:id, in a
// read-only public variant, rebuilt from the frozen snapshot — every place
// (lat/lng, dates, notes) and photo URL travels in the share doc, so nothing is
// summarised away. Attached workspace notes are the owner's private notes and
// are not part of the snapshot, so the notes section is simply empty.
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const sharedTrip = computed<Trip | null>(() => {
  if (share.value?.type !== 'trip' || typeMismatch.value) return null
  const it = share.value.item as Record<string, unknown>
  const rawPlaces = Array.isArray(it.places) ? (it.places as Record<string, unknown>[]) : []
  const places: TripPlace[] = rawPlaces.map((p, i) => ({
    id: typeof p.id === 'number' ? p.id : i + 1,
    name: typeof p.name === 'string' ? p.name : '',
    address: typeof p.address === 'string' ? p.address : '',
    lat: typeof p.lat === 'number' ? p.lat : null,
    lng: typeof p.lng === 'number' ? p.lng : null,
    visitedAt: typeof p.visitedAt === 'string' ? p.visitedAt : '',
    notes: typeof p.notes === 'string' ? p.notes : '',
    photos: Array.isArray(p.photos)
      ? p.photos.filter((x): x is string => typeof x === 'string')
      : [],
  }))
  return {
    id: typeof it.id === 'number' ? it.id : 0,
    title: (it.title as string) || (it.location as string) || 'Shared trip',
    status: it.status === 'done' ? 'done' : 'tovisit',
    date: typeof it.date === 'string' ? it.date : '',
    visitedDate: typeof it.visitedDate === 'string' ? it.visitedDate : '',
    description: typeof it.description === 'string' ? it.description : '',
    tag: typeof it.tag === 'string' ? it.tag : '',
    photos: Array.isArray(it.photos)
      ? it.photos.filter((x): x is string => typeof x === 'string')
      : [],
    places,
    noteIds: [],
    location: (it.location as string) || '',
    createdAt: num(it.createdAt),
    updatedAt: num(it.updatedAt),
  }
})

// A shared reminder is worth little without its schedule, so the same timeline
// the workspace uses is rendered here from the frozen snapshot.
const sharedReminder = computed<Reminder | null>(() => {
  if (share.value?.type !== 'reminder' || typeMismatch.value) return null
  const raw = share.value.item as Partial<Reminder>
  if (!raw.start) return null
  return {
    id: Number(raw.id ?? 0),
    title: String(raw.title ?? ''),
    note: String(raw.note ?? ''),
    start: String(raw.start),
    repeat: (raw.repeat as Reminder['repeat']) || { type: 'none' },
    priority: (raw.priority as Reminder['priority']) || 'normal',
    calSync: 'local',
    calEventId: null,
    lastFiredOcc: null,
    // A share is a frozen snapshot; it carries no stamps of its own, and the
    // timeline does not read them. 0 is the "unknown" sentinel.
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? 0),
  }
})
const nowMs = Date.now()

const linesStyle = pxify({ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 })
const noteStyle = computed(() => pxify({ fontSize: 13, lineHeight: 1.5, color: c.value.text }))
const centeredPage = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
  }),
)
const badgeStyle = computed(() =>
  pxify({
    alignSelf: 'flex-start',
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    border: '1px solid ' + c.value.border,
    borderRadius: 999,
    padding: '3px 9px',
  }),
)

function goHome() {
  router.push('/')
}
</script>

<template>
  <!-- A shared trip is the full read-only detail page, not a summary card. -->
  <TripDetail
    v-if="sharedTrip"
    :trip="sharedTrip"
    variant="public"
    :badge-label="share?.isPublic ? 'Public' : 'Private'"
    @open-app="goHome"
  />

  <div v-else :style="centeredPage">
    <div :style="s.shareCard">
      <!-- Loading -->
      <template v-if="!load">
        <span :style="s.drawerTitle">Opening shared item…</span>
        <span :style="s.loadingOrbit"></span>
      </template>

      <!-- Private share, viewer not signed in -->
      <template v-else-if="load.status === 'needs-auth'">
        <span :style="s.drawerTitle">This share is private</span>
        <span :style="s.finMeta">
          Sign in with the account that created it to view this item.
        </span>
        <div :style="s.dialogActions">
          <button v-if="authReady && !isSignedIn" :style="s.saveBtn" @click="auth.loginGoogle()">
            Sign in with Google
          </button>
          <button :style="s.cancelBtn" @click="goHome">Back to Aureon</button>
        </div>
      </template>

      <!-- Missing, or the plural in the path does not match the item -->
      <template v-else-if="load.status === 'not-found' || typeMismatch">
        <span :style="s.drawerTitle">Not found in this universe</span>
        <span :style="s.finMeta">This link doesn't point to anything here.</span>
        <div :style="s.dialogActions">
          <button :style="s.saveBtn" @click="goHome">Back to Aureon</button>
        </div>
      </template>

      <!-- Firebase unreachable -->
      <template v-else-if="load.status === 'unavailable'">
        <span :style="s.drawerTitle">Could not open this share</span>
        <span :style="s.finMeta">Firebase is unreachable right now.</span>
        <div :style="s.dialogActions">
          <button :style="s.saveBtn" @click="run">Retry</button>
          <button :style="s.cancelBtn" @click="goHome">Back to Aureon</button>
        </div>
      </template>

      <!-- The item -->
      <template v-else>
        <span :style="badgeStyle">{{ share?.isPublic ? 'Public' : 'Private' }}</span>
        <span :style="s.drawerTitle">{{ heading }}</span>
        <div :style="s.taskMain">
          <div v-if="isNote" :style="noteStyle" v-html="noteHtml"></div>
          <div v-else :style="[linesStyle, { color: c.text }]">
            <span v-for="(line, i) in lines" :key="i">{{ line }}</span>
          </div>
        </div>
        <ReminderTimeline
          v-if="sharedReminder"
          :reminder="sharedReminder"
          :now="nowMs"
          :upcoming="12"
        />
        <div :style="s.dialogActions">
          <button :style="s.saveBtn" @click="goHome">Open Aureon</button>
        </div>
      </template>
    </div>
  </div>
</template>

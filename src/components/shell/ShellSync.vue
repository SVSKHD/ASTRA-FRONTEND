<script setup lang="ts">
// The sync indicator (section 44, item 4).
//
// It was a fixed pill at the bottom-left of the viewport, which on a desktop is
// exactly where the rail is and on a phone is exactly where the dock is. It
// covered both. It is now a compact item in the bottom utility bar — in flow,
// in a region, unable to sit on top of anything.
//
// THREE STATES, AND THE FIRST ONE IS NOTHING.
//
//   synced           no visible indicator at all. A permanent green tick that
//                    says "fine" is a light that is on when nothing is wrong,
//                    which is a light nobody reads. Silence is the healthy
//                    state.
//   syncing          a progress ring and the count of writes in flight.
//   queued/blocked   a dot and the count — accent when the writes are merely
//                    waiting for a network, danger when the rules refused them,
//                    because those need different things from the reader.
//
// The old pill also flashed "All changes saved" for two seconds after every
// sync. That is the fourth state, and it is the one that made the thing a
// notification rather than a status; it is gone.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useConnectivity } from '@/composables/useConnectivity'
import { useOutbox } from '@/composables/useOutbox'
import { pxify, typeStep } from '@/styles'
import { formatRelative } from '@/utils/timestamps'
import ProgressRing from '@/components/ui/ProgressRing.vue'

const { c, s, B } = useStyles()
const { now } = storeToRefs(useUiStore())
const { isOnline, isSyncing, pendingCount, lastSyncedAt, retry } = useConnectivity()
// The outbox holds writes the RULES refused, which is a different fact from a
// write waiting on a network and gets a different colour.
const outbox = useOutbox()

export type SyncState = 'synced' | 'syncing' | 'queued' | 'blocked'

const state = computed<SyncState>(() => {
  if (outbox.entries.value.length) return 'blocked'
  if (isSyncing.value) return 'syncing'
  if (!isOnline.value && pendingCount.value > 0) return 'queued'
  if (!isOnline.value) return 'queued'
  return 'synced'
})

/** Synced shows nothing. Everything else is worth a glance. */
const visible = computed(() => state.value !== 'synced')

const count = computed(() =>
  state.value === 'blocked' ? outbox.entries.value.length : pendingCount.value,
)

const tone = computed(() => {
  if (state.value === 'blocked') return 'var(--theme-danger)'
  if (state.value === 'syncing') return c.value.accent
  return c.value.accent
})

const text = computed(() => {
  switch (state.value) {
    case 'syncing':
      return count.value ? `Syncing ${count.value}` : 'Syncing'
    case 'blocked':
      return `${count.value} blocked`
    case 'queued':
      return count.value ? `${count.value} queued` : 'Offline'
    default:
      return ''
  }
})

const detail = computed(() => {
  switch (state.value) {
    case 'blocked':
      return 'These writes were refused. Retrying re-sends them under the id they were minted with, so nothing duplicates.'
    case 'queued':
      return 'Working offline. Changes are saved on this device and sync automatically when you reconnect.'
    default:
      return 'Changes sync automatically.'
  }
})
const lastSyncedLabel = computed(() =>
  lastSyncedAt.value ? formatRelative(lastSyncedAt.value, now.value) : 'not yet this session',
)

const open = ref(false)
watch(visible, (v) => {
  if (!v) open.value = false
})

// --- styles -----------------------------------------------------------------
const wrap = pxify({ position: 'relative', display: 'inline-flex', minWidth: 0 })
const item = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    minWidth: 0,
    maxWidth: 200,
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + tone.value,
    background: 'transparent',
    color: c.value.text,
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  }),
)
const dot = computed(() =>
  pxify({
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    background: tone.value,
    boxShadow: '0 0 8px ' + tone.value,
  }),
)
const textStyle = pxify({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
// The popover opens UPWARD out of the bar, which is the only direction with
// room. It is absolutely positioned against its own wrapper, not the viewport.
const menu = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    bottom: 'calc(100% + 8px)',
    width: 250,
    padding: 12,
    borderRadius: 'var(--radius-dialog)',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: B.value,
    boxShadow: c.value.shadow,
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    zIndex: 30,
  }),
)
const meta = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim, lineHeight: 1.5 }))
const scrim = pxify({ position: 'fixed', inset: 0, zIndex: 29 })

function doRetry() {
  retry()
  open.value = false
}
</script>

<template>
  <div v-if="visible" :style="wrap" aria-live="polite">
    <div v-if="open" :style="scrim" @click="open = false"></div>
    <button
      type="button"
      class="ssync"
      :style="item"
      :aria-label="text"
      :aria-expanded="open"
      @click="open = !open"
    >
      <!-- Syncing gets the ring, the other two get a dot. A ring that is not
           turning is just a circle, so it only appears when something is
           actually in flight. -->
      <ProgressRing v-if="state === 'syncing'" :size="12" indeterminate />
      <span v-else :style="dot"></span>
      <span :style="textStyle">{{ text }}</span>
    </button>

    <div v-if="open" :style="menu" role="menu" @click.stop>
      <span :style="meta">{{ detail }}</span>
      <span :style="meta">Last synced: {{ lastSyncedLabel }}</span>
      <button type="button" :style="s.saveBtn" @click="doRetry">Retry sync now</button>
    </div>
  </div>
</template>

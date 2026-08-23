<script setup lang="ts">
// The offline/sync status pill: fixed bottom-left on desktop, above the bottom
// nav on mobile. Three states with animated transitions and an aria-live region
// so each change is announced once:
//   offline — grey, cloud-slash, "Offline — changes saved locally [· N pending]"
//   syncing — accent, spinning icon, "Syncing N…" with an indeterminate line
//   synced  — green check, "All changes saved", auto-fades after 2s
// It stays hidden on a clean initial load (nothing was ever pending). Clicking
// it opens a small popover with a manual retry for stuck writes.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useConnectivity } from '@/composables/useConnectivity'
import { pxify, typeStep } from '@/styles'
import { formatRelative } from '@/utils/timestamps'
import Icon from '@/components/ui/Icon.vue'

const ui = useUiStore()
const { c, s } = useStyles()
const { isMobile, now } = storeToRefs(ui)
const { isOnline, isSyncing, pendingCount, lastSyncedAt, retry } = useConnectivity()

type Mode = 'hidden' | 'offline' | 'syncing' | 'synced'
const mode = ref<Mode>('hidden')
let syncedTimer: ReturnType<typeof setTimeout> | undefined

watch(
  [isOnline, isSyncing, pendingCount],
  () => {
    if (!isOnline.value) {
      clearTimeout(syncedTimer)
      mode.value = 'offline'
      return
    }
    if (isSyncing.value) {
      clearTimeout(syncedTimer)
      mode.value = 'syncing'
      return
    }
    // Online and nothing pending. If we were mid-sync or offline, flash the
    // synced confirmation, then retire the pill. Otherwise stay hidden — a
    // clean initial load must not announce "All changes saved".
    if (mode.value === 'syncing' || mode.value === 'offline') {
      mode.value = 'synced'
      clearTimeout(syncedTimer)
      syncedTimer = setTimeout(() => {
        if (mode.value === 'synced') mode.value = 'hidden'
      }, 2000)
    } else if (mode.value !== 'synced') {
      mode.value = 'hidden'
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(syncedTimer))

const visible = computed(() => mode.value !== 'hidden')
const menuOpen = ref(false)
watch(visible, (v) => {
  if (!v) menuOpen.value = false
})

const text = computed(() => {
  if (mode.value === 'offline') {
    return pendingCount.value > 0
      ? `Offline — changes saved locally · ${pendingCount.value} pending`
      : 'Offline — changes saved locally'
  }
  if (mode.value === 'syncing') return `Syncing ${pendingCount.value}…`
  if (mode.value === 'synced') return 'All changes saved'
  return ''
})

const accent = computed(
  () =>
    mode.value === 'synced'
      ? 'oklch(0.72 0.15 150)'
      : mode.value === 'syncing'
        ? c.value.accent
        : 'oklch(0.62 0.03 250)', // grey-slate for offline
)
const lastSyncedLabel = computed(() =>
  lastSyncedAt.value ? formatRelative(lastSyncedAt.value, now.value) : 'not yet this session',
)

// --- styles -----------------------------------------------------------------
const wrapStyle = computed(() =>
  pxify({
    position: 'fixed',
    left: isMobile.value ? 12 : 20,
    bottom: isMobile.value ? 'calc(84px + env(safe-area-inset-bottom, 0px))' : 20,
    zIndex: 9,
  }),
)
const pillStyle = computed(() =>
  pxify({
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    maxWidth: isMobile.value ? 'calc(100vw - 24px)' : 360,
    padding: '8px 13px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.5)',
    border: '1px solid ' + accent.value,
    boxShadow: '0 8px 24px rgba(0,0,0,0.28), 0 0 16px ' + accent.value + '55',
    color: c.value.text,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    overflow: 'hidden',
    userSelect: 'none',
  }),
)
const dotStyle = computed(() =>
  pxify({
    width: 16,
    height: 16,
    flexShrink: 0,
    color: accent.value,
    display: 'grid',
    placeItems: 'center',
    animation: mode.value === 'syncing' ? 'spin 1s linear infinite' : 'none',
  }),
)
const textStyle = pxify({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
const progressLine = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    width: '40%',
    background: accent.value,
    borderRadius: 2,
    animation: 'indeterminate 1.1s ease-in-out infinite',
  }),
)

// popover
const menuStyle = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    bottom: 'calc(100% + 8px)',
    minWidth: 220,
    padding: 12,
    borderRadius: 'var(--radius-dialog)',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    boxShadow: '0 14px 34px rgba(0,0,0,0.34)',
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    animation: 'sheetUp .2s ease',
  }),
)
const menuMeta = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim, lineHeight: 1.5 }))
const overlayStyle = pxify({ position: 'fixed', inset: 0, zIndex: 8 })

function togglePopover() {
  menuOpen.value = !menuOpen.value
}
function doRetry() {
  retry()
  menuOpen.value = false
}
</script>

<template>
  <Transition name="sync-pill">
    <div v-if="visible" :style="wrapStyle" aria-live="polite">
      <div v-if="menuOpen" :style="overlayStyle" @click="menuOpen = false"></div>
      <div
        :style="pillStyle"
        role="status"
        :aria-label="text"
        tabindex="0"
        @click="togglePopover"
        @keydown.enter.prevent="togglePopover"
        @keydown.space.prevent="togglePopover"
      >
        <span :style="dotStyle">
          <!-- offline: cloud-slash -->
          <Icon name="cloud-off" size="xs" :style="{ color: c.dim }" />
          <!-- syncing: circular arrows -->
          <Icon name="refresh-cw" size="xs" :style="{ color: c.dim }" />
          <!-- synced: check -->
          <Icon name="check" size="xs" :style="{ color: c.dim }" />
        </span>
        <span :style="textStyle">{{ text }}</span>
        <span v-if="mode === 'syncing'" :style="progressLine"></span>
      </div>

      <div v-if="menuOpen" :style="menuStyle" role="menu" @click.stop>
        <span :style="menuMeta">
          {{
            mode === 'offline'
              ? 'Working offline. Changes are saved on this device and sync automatically when you reconnect.'
              : 'Changes sync automatically.'
          }}
        </span>
        <span :style="menuMeta">Last synced: {{ lastSyncedLabel }}</span>
        <button :style="s.saveBtn" @click="doRetry">Retry sync now</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sync-pill-enter-active,
.sync-pill-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sync-pill-enter-from,
.sync-pill-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>

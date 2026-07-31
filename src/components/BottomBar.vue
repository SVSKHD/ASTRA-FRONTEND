<script setup lang="ts">
// Mobile navigation: a glass bottom bar with the five primary tabs plus a "More"
// item that opens a bottom sheet with the rest (Trips, Ideas, Stocks) and the
// secondary actions (Notes, Settings). Tab ordering comes from tabs.config, the
// same source the rail reads. Respects the home-indicator safe area.
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { PRIMARY_TABS, SECONDARY_TABS } from '@/tabs.config'
import TabGlyph from '@/components/TabGlyph.vue'
import type { TabKey } from '@/types'

const ui = useUiStore()
const auth = useAuthStore()
const { c, B } = useStyles()
const { tab } = storeToRefs(ui)

const moreOpen = ref(false)
// The More item is "active" whenever the current tab is one of the secondary
// ones, so the bar still shows where you are even when the tab isn't a slot.
const moreActive = () => SECONDARY_TABS.some((t) => t.key === tab.value)

function pick(key: TabKey) {
  ui.setTab(key)
  moreOpen.value = false
}
function openNotes() {
  moreOpen.value = false
  ui.toggleDrawer()
}
function openSettings() {
  moreOpen.value = false
  auth.toggleAvatarMenu()
}

const bar = pxify({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 9,
  display: 'grid',
  gridTemplateColumns: 'repeat(6, 1fr)',
  alignItems: 'stretch',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  background: c.value.glass,
  backdropFilter: 'blur(24px) saturate(1.5)',
  '-webkit-backdrop-filter': 'blur(24px) saturate(1.5)',
  borderTop: B.value,
  boxShadow: '0 -6px 24px rgba(0,0,0,0.12)',
})
function slot(active: boolean) {
  return pxify({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 56,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: active ? c.value.accent : c.value.dim,
  })
}
// The accent indicator sits above the icon on the active slot.
function topBar(active: boolean) {
  return pxify({
    position: 'absolute',
    top: 0,
    width: 22,
    height: 3,
    borderRadius: 3,
    background: active ? c.value.accent : 'transparent',
    boxShadow: active ? '0 0 8px ' + c.value.accent : 'none',
  })
}
const iconBox = pxify({ width: 22, height: 22 })
const slotLabel = pxify({ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.01em' })

const scrim = pxify({
  position: 'fixed',
  inset: 0,
  zIndex: 18,
  background: 'rgba(0,0,0,0.32)',
  animation: 'fadeUp .2s ease both',
})
const sheet = pxify({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 19,
  background: c.value.glass,
  backdropFilter: 'blur(28px) saturate(1.6)',
  '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
  borderTop: B.value,
  borderTopLeftRadius: 26,
  borderTopRightRadius: 26,
  padding: '10px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
  boxShadow: '0 -12px 40px rgba(0,0,0,0.28)',
  animation: 'slideUpSheet .28s cubic-bezier(.4,1.3,.4,1) both',
})
const grab = pxify({
  width: 40,
  height: 4,
  borderRadius: 3,
  background: c.value.border,
  margin: '2px auto 12px',
})
const sheetGrid = pxify({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
})
function sheetItem(active: boolean) {
  return pxify({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px 8px',
    borderRadius: 16,
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active ? c.value.card : c.value.input,
    color: active ? c.value.accent : c.value.text,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  })
}
const sheetIcon = pxify({ width: 24, height: 24 })
</script>

<template>
  <div :style="bar" role="tablist" aria-label="Primary">
    <button
      v-for="t in PRIMARY_TABS"
      :key="t.key"
      :style="slot(tab === t.key)"
      role="tab"
      :aria-selected="tab === t.key"
      :aria-label="t.label"
      @click="pick(t.key)"
    >
      <span :style="topBar(tab === t.key)"></span>
      <span :style="iconBox">
        <TabGlyph
          :name="t.key"
          :filled="tab === t.key"
          :col="tab === t.key ? c.accent : c.dim"
          :ko="c.card"
        />
      </span>
      <span :style="slotLabel">{{ t.label }}</span>
    </button>

    <button :style="slot(moreActive() || moreOpen)" aria-label="More" @click="moreOpen = !moreOpen">
      <span :style="topBar(moreActive())"></span>
      <span :style="iconBox">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          :stroke="moreActive() || moreOpen ? c.accent : c.dim"
          stroke-width="2.2"
          stroke-linecap="round"
        >
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      </span>
      <span :style="slotLabel">More</span>
    </button>
  </div>

  <template v-if="moreOpen">
    <div :style="scrim" @click="moreOpen = false"></div>
    <div :style="sheet" role="dialog" aria-label="More tabs">
      <div :style="grab"></div>
      <div :style="sheetGrid">
        <button
          v-for="t in SECONDARY_TABS"
          :key="t.key"
          :style="sheetItem(tab === t.key)"
          @click="pick(t.key)"
        >
          <span :style="sheetIcon">
            <TabGlyph
              :name="t.key"
              :filled="tab === t.key"
              :col="tab === t.key ? c.accent : c.dim"
              :ko="c.card"
            />
          </span>
          <span>{{ t.label }}</span>
        </button>

        <button :style="sheetItem(false)" @click="openNotes">
          <span :style="sheetIcon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              :stroke="c.dim"
              stroke-width="1.9"
              stroke-linecap="round"
            >
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <line x1="7.5" y1="8" x2="16.5" y2="8" />
              <line x1="7.5" y1="12" x2="16.5" y2="12" />
              <line x1="7.5" y1="16" x2="13" y2="16" />
            </svg>
          </span>
          <span>Notes</span>
        </button>

        <button :style="sheetItem(false)" @click="openSettings">
          <span :style="sheetIcon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              :stroke="c.dim"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3.2" />
              <path
                d="M12 3v2.2M12 18.8V21M4.2 7l1.9 1.1M17.9 15.9 19.8 17M3 13.5l2.2-.6M18.8 11.1 21 10.5M4.2 17l1.9-1.1M17.9 8.1 19.8 7"
              />
            </svg>
          </span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  </template>
</template>

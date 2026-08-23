<script setup lang="ts">
// The floating icon dock — a detached glass capsule that replaces the flat
// sidebar. Icon-only, no labels: it is a vertical carousel (horizontal at the
// bottom on phones) showing five icons at a time, the active one centered,
// largest and glowing, its neighbours scaled and faded with distance. The wheel,
// a drag, or ↑/↓ rotate it; it wraps around. Labels are communicated by hover
// tooltips. Ordering comes from tabs.config so the dock and everything else
// agree.
import { computed, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { TABS, TAB_ORDER } from '@/tabs.config'
import TabGlyph from '@/components/TabGlyph.vue'
import type { TabKey } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const { c, B } = useStyles()
const { tab, isPhone, isTablet, now } = storeToRefs(ui)

const horizontal = computed(() => isPhone.value)
const n = TABS.length
const activeIndex = computed(() => Math.max(0, TAB_ORDER.indexOf(tab.value)))

// Shortest signed ring distance from the active icon, in −4..4 for nine tabs, so
// the carousel wraps (last sits next to first).
function ringDelta(i: number): number {
  let d = i - activeIndex.value
  if (d > n / 2) d -= n
  if (d < -n / 2) d += n
  return d
}

const SPACING = computed(() => (isTablet.value ? 40 : 46))
// Per-distance size/opacity ramp, straight from the spec.
function sizeFor(d: number): number {
  const a = Math.abs(d)
  if (a === 0) return 24
  if (a === 1) return 20
  return 17
}
function opacityFor(d: number): number {
  const a = Math.abs(d)
  if (a === 0) return 1
  if (a === 1) return 0.7
  if (a === 2) return 0.4
  return 0
}

const badges = computed<Partial<Record<TabKey, number>>>(() => {
  void now.value
  return {
    todo: app.pendingOverdue('todos').length,
    tasks: app.pendingOverdue('tasks').length,
  }
})

// ---- rotation -------------------------------------------------------------
function rotate(step: number) {
  ui.cycleTab(step)
}
function jumpTo(key: TabKey) {
  ui.setTab(key)
}

// Wheel rotates, one detent at a time (accumulated so a trackpad's many small
// deltas don't spin it wildly).
let wheelAcc = 0
let wheelLock = false
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (wheelLock) return
  wheelAcc += horizontal.value ? e.deltaX || e.deltaY : e.deltaY
  if (Math.abs(wheelAcc) < 24) return
  rotate(wheelAcc > 0 ? 1 : -1)
  wheelAcc = 0
  wheelLock = true
  setTimeout(() => (wheelLock = false), 90)
}

// Drag rotates: every SPACING px dragged past the start steps one icon.
let dragStart: number | null = null
let dragAcc = 0
function onPointerDown(e: PointerEvent) {
  dragStart = horizontal.value ? e.clientX : e.clientY
  dragAcc = 0
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (dragStart == null) return
  const pos = horizontal.value ? e.clientX : e.clientY
  const delta = pos - dragStart - dragAcc
  const threshold = SPACING.value
  if (delta <= -threshold) {
    rotate(1)
    dragAcc -= threshold
  } else if (delta >= threshold) {
    rotate(-1)
    dragAcc += threshold
  }
}
function onPointerUp() {
  dragStart = null
}
onBeforeUnmount(() => {
  dragStart = null
})

// ---- styles ---------------------------------------------------------------
// The capsule floats off the edge; its inner track is masked so items dissolve
// at the rounded ends.
const capsule = computed(() => {
  const base = {
    position: 'fixed' as const,
    zIndex: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(24px) saturate(1.5)',
    border: B.value,
    boxShadow: c.value.shadow + ', inset 0 1px 0 rgba(255,255,255,0.18)',
    touchAction: 'none' as const,
  }
  if (horizontal.value) {
    return pxify({
      ...base,
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      height: 60,
      maxWidth: '86vw',
      padding: '0 10px',
      borderRadius: 'var(--radius-pill)',
    })
  }
  return pxify({
    ...base,
    top: '50%',
    transform: 'translateY(-50%)',
    left: isTablet.value ? 12 : 28,
    width: isTablet.value ? 56 : 64,
    maxHeight: '62vh',
    padding: '10px 0',
    borderRadius: 'var(--radius-pill)',
    flexDirection: 'column' as const,
  })
})
// The track is a fixed window of five slots; items are absolutely centered and
// translated out from the middle by their ring distance.
const track = computed(() => {
  const span = SPACING.value * 5
  const mask = 'linear-gradient(VAR, transparent 0%, #000 18%, #000 82%, transparent 100%)'.replace(
    'VAR',
    horizontal.value ? 'to right' : 'to bottom',
  )
  return pxify({
    position: 'relative',
    width: horizontal.value ? span : 44,
    height: horizontal.value ? 44 : span,
    flexShrink: 0,
    maskImage: mask,
    '-webkit-mask-image': mask,
  })
})
function itemStyle(d: number) {
  const off = d * SPACING.value
  return pxify({
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: horizontal.value
      ? `translate(calc(-50% + ${off}px), -50%)`
      : `translate(-50%, calc(-50% + ${off}px))`,
    opacity: opacityFor(d),
    pointerEvents: opacityFor(d) === 0 ? 'none' : 'auto',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    // Spring-ish ease with slight overshoot; disabled under reduced-motion by
    // the global stylesheet rule.
    transition: 'transform .32s cubic-bezier(.34,1.56,.64,1), opacity .32s ease',
  })
}
function glyphWrap(d: number) {
  const sz = sizeFor(d)
  const active = d === 0
  return pxify({
    position: 'relative',
    width: sz,
    height: sz,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    boxShadow: active
      ? '0 0 0 3px ' + c.value.accent + '55, 0 0 16px ' + c.value.accent + '66'
      : 'none',
    transition: 'width .32s cubic-bezier(.34,1.56,.64,1), height .32s cubic-bezier(.34,1.56,.64,1)',
  })
}
const badgeDot = computed(() =>
  pxify({
    position: 'absolute',
    top: -2,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: c.value.accent,
    boxShadow: '0 0 0 2px ' + c.value.glass,
  }),
)
const tip = computed(() =>
  pxify({
    position: 'absolute',
    left: horizontal.value ? '50%' : 'calc(100% + 12px)',
    bottom: horizontal.value ? 'calc(100% + 12px)' : 'auto',
    top: horizontal.value ? 'auto' : '50%',
    transform: horizontal.value ? 'translateX(-50%)' : 'translateY(-50%)',
    padding: '5px 11px',
    borderRadius: 'var(--radius-card)',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    whiteSpace: 'nowrap',
    color: c.value.text,
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.6)',
    border: B.value,
    boxShadow: c.value.shadow,
    zIndex: 40,
    pointerEvents: 'none',
  }),
)
</script>

<template>
  <nav
    :style="capsule"
    class="dock"
    aria-label="Sections"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div :style="track">
      <button
        v-for="(t, i) in TABS"
        :key="t.key"
        class="dock-item"
        :style="itemStyle(ringDelta(i))"
        :aria-label="t.label"
        :aria-current="tab === t.key ? 'page' : undefined"
        :tabindex="opacityFor(ringDelta(i)) === 0 ? -1 : 0"
        @click="jumpTo(t.key)"
      >
        <span :style="glyphWrap(ringDelta(i))">
          <TabGlyph
            :name="t.key"
            :filled="tab === t.key"
            :col="tab === t.key ? c.accent : c.dim"
            :ko="c.card"
          />
          <span v-if="badges[t.key]" :style="badgeDot"></span>
        </span>
        <span class="dock-tip" :style="tip">{{ t.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* Tooltips appear only after a 350ms hover, per spec. */
.dock-tip {
  opacity: 0;
  transition: opacity 0.15s ease;
  transition-delay: 0s;
}
.dock-item:hover .dock-tip {
  opacity: 1;
  transition-delay: 0.35s;
}
</style>

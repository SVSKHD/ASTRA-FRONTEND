<script setup lang="ts">
// The icon dock. Icon-only, no labels: a vertical carousel (horizontal at the
// bottom on phones) showing five icons at a time, the active one centered,
// largest and glowing, its neighbours scaled and faded with distance. The wheel,
// a drag, or ↑/↓ rotate it; it wraps around. Labels are communicated by hover
// tooltips. Ordering comes from tabs.config so the dock and everything else
// agree.
//
// IT IS NO LONGER FIXED (section 44, item 2). It used to be a detached capsule
// at `position: fixed`, floating over the starfield with nothing reserving room
// for it — which is why the sync pill, also fixed and also bottom-left, landed
// on top of it. It now fills the shell's `rail` region: the grid gives it a
// column of its own and the content area starts where that column ends.
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

const SPACING = computed(() => (isTablet.value ? 44 : 50))
// Per-distance size/opacity ramp. These are the GLYPH's size now; the disc
// around it is `discFor` below, and it is deliberately a good deal larger, so
// the highlight is a ring of space around the icon rather than a line drawn on
// top of its edges.
function sizeFor(d: number): number {
  const a = Math.abs(d)
  if (a === 0) return 22
  if (a === 1) return 18
  return 16
}
/**
 * The disc behind the glyph.
 *
 * The active one is a padded, filled circle — not a hairline ring hugging the
 * artwork. The old highlight was `box-shadow: 0 0 0 3px` on a 24px box holding
 * a 22px glyph: one pixel of gap on each side, so the ring read as part of the
 * icon's outline instead of as a selection, and on the busier glyphs (the
 * candlesticks, the calendar) it merged with them completely.
 */
function discFor(d: number): number {
  return d === 0 ? 36 : 30
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
// The capsule fills its region; its inner track is masked so items dissolve at
// the rounded ends. `position: relative`, never fixed — the rail region is what
// places it, and a fixed child of a grid area is a child of the viewport.
const capsule = computed(() => {
  const base = {
    position: 'relative' as const,
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
      height: 56,
      maxWidth: '92vw',
      padding: '0 10px',
      borderRadius: 'var(--radius-pill)',
    })
  }
  return pxify({
    ...base,
    width: isTablet.value ? 56 : 64,
    // A ceiling, not a height: the rail column is as tall as the shell and the
    // capsule should not be. `maxHeight: 100%` keeps it inside the region on a
    // short window instead of pushing the grid past the viewport.
    maxHeight: '100%',
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
    width: horizontal.value ? span : 48,
    height: horizontal.value ? 48 : span,
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
    width: 44,
    height: 44,
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
/**
 * The disc's SIZE only. Its paint is in the stylesheet below.
 *
 * Deliberately split: the size is the one part that depends on ring distance
 * and so has to be computed per item, and the paint is the part that has a
 * hover state — which an inline style cannot express, and which `v-hover-style`
 * would get wrong here because it restores the style it snapshotted on enter,
 * and clicking an icon changes that style underneath it.
 */
function glyphWrap(d: number) {
  const size = discFor(d)
  return pxify({
    width: size,
    height: size,
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
        <span
          class="dock-glyph"
          :class="{ 'is-active': tab === t.key }"
          :style="glyphWrap(ringDelta(i))"
        >
          <TabGlyph
            :name="t.key"
            :filled="tab === t.key"
            :size="sizeFor(ringDelta(i))"
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
/*
 * THE ACTIVE ICON'S HIGHLIGHT.
 *
 * It used to be `box-shadow: 0 0 0 3px` on a 24px box around a 22px glyph —
 * one pixel of clearance on each side, which reads as an outline the artwork
 * grew rather than as "this is the tab you are on", and which disappeared
 * entirely into the busier glyphs. It is now a padded disc: a filled circle
 * seven pixels wider than the glyph on every side, its own edge against the
 * glass, and a soft ring outside that.
 *
 * Three layers because each says something the others cannot — the fill says
 * which one, the border gives it an edge on a light theme, the ring and glow
 * lift it off the capsule. The transparent border on the inactive state is what
 * keeps the layout from shifting by a pixel when an icon becomes the active one.
 */
.dock-glyph {
  position: relative;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  transition:
    width 0.32s cubic-bezier(0.34, 1.56, 0.64, 1),
    height 0.32s cubic-bezier(0.34, 1.56, 0.64, 1),
    background 0.24s ease,
    border-color 0.24s ease,
    box-shadow 0.24s ease;
}
.dock-glyph.is-active {
  background: color-mix(in oklch, var(--theme-accent) 22%, transparent);
  border-color: color-mix(in oklch, var(--theme-accent) 60%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in oklch, var(--theme-accent) 16%, transparent),
    0 4px 14px color-mix(in oklch, var(--theme-accent) 32%, transparent);
}
/* A neighbour under the pointer gets the same disc at a fraction of the
   strength, so "what will I land on" is answerable before the click. */
.dock-item:hover .dock-glyph:not(.is-active),
.dock-item:focus-visible .dock-glyph:not(.is-active) {
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
  border-color: color-mix(in oklch, var(--theme-accent) 30%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .dock-glyph {
    transition: none;
  }
}

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

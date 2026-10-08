<script setup lang="ts">
// The icon dock: a soft pill in the shell's rail holding a scrolling column of
// section icons, with the accent tile FIXED in the middle slot. Choosing a
// section does not move the tile to it — the column scrolls until that icon
// sits in the tile, and only then does the tab's content change. A "⋯" under a
// hairline opens the full list by name. Labels live in hover tooltips and
// aria-labels; ordering comes from tabs.config.
//
// THE COLUMN is a ring: every section, wrapping round, so there is always an
// icon above and below the middle. It is drawn as a run of virtual slots
// around `pos` — slot v shows TABS[v mod n] and is keyed by v — so moving
// `pos` slides the same elements along rather than re-rendering them, and the
// ones that scroll past the faded ends simply drop off. `pos` is the slot in
// the tile; it is unbounded, so the ring never has a seam to jump across.
//
// ACCIDENTAL TAB CHANGES are guarded the way the old carousel guarded them: the
// wheel only turns the column once the pointer has rested on the dock, so a
// page scroll passing over cannot change tab, and a tab is only switched once
// the column has come to rest (CHANGE_MS after the last step).
//
// IT IS NOT FIXED (section 44, item 2): it fills the shell's `rail` region —
// the grid gives it a column of its own — so nothing else lands on top of it.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { TABS, TAB_ORDER } from '@/tabs.config'
import TabGlyph from '@/components/TabGlyph.vue'
import Icon from '@/components/ui/Icon.vue'
import type { TabKey } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const { c } = useStyles()
const { tab, isTablet, now } = storeToRefs(ui)

const n = TABS.length
// Slots above and below the tile that are fully shown, and one more each way
// that is drawn faded so icons scroll in and out rather than popping.
const REACH = 3
const mod = (v: number) => ((v % n) + n) % n
const tabAt = (v: number) => TABS[mod(v)]

// ---- the column's position ------------------------------------------------------
const indexOf = (key: TabKey) => Math.max(0, TAB_ORDER.indexOf(key))
const pos = ref(indexOf(tab.value))
// The nearest slot showing `key`, going whichever way round is shorter.
function nearestSlot(key: TabKey): number {
  let d = indexOf(key) - mod(pos.value)
  if (d > n / 2) d -= n
  if (d < -n / 2) d += n
  return pos.value + d
}
const slots = computed(() => {
  const out: { v: number; d: number }[] = []
  for (let d = -REACH - 1; d <= REACH + 1; d++) out.push({ v: pos.value + d, d })
  return out
})
// What is in the tile right now — which may be ahead of the open tab while the
// column is still scrolling to it.
const centred = computed(() => tabAt(pos.value).key)

// The tab follows the column once it has stopped. A second step before then
// restarts the wait, so scrolling through several sections opens only the one
// it stops on.
const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
const CHANGE_MS = reduced ? 0 : 380
let changeTimer: ReturnType<typeof setTimeout> | undefined
function settle() {
  clearTimeout(changeTimer)
  const commit = () => {
    if (tab.value !== centred.value) ui.setTab(centred.value)
  }
  if (CHANGE_MS === 0) commit()
  else changeTimer = setTimeout(commit, CHANGE_MS)
}
// A long way round (from the menu, or a shortcut) is walked one slot at a time,
// each step re-aiming the same easing, so the column visibly scrolls there
// instead of every icon swapping at once. Within reach it is one move.
const STEP_MS = reduced ? 0 : 55
let stepTimer: ReturnType<typeof setInterval> | undefined
function moveTo(v: number, after?: () => void) {
  clearInterval(stepTimer)
  // The icon under the tooltip is about to slide away from it.
  hoverD.value = null
  if (Math.abs(v - pos.value) <= REACH || STEP_MS === 0) {
    pos.value = v
    after?.()
    return
  }
  stepTimer = setInterval(() => {
    pos.value += v > pos.value ? 1 : -1
    if (pos.value === v) {
      clearInterval(stepTimer)
      after?.()
    }
  }, STEP_MS)
}
function scrollTo(v: number) {
  menuOpen.value = false
  if (v === pos.value) return settle()
  moveTo(v, settle)
}
function pick(key: TabKey) {
  scrollTo(nearestSlot(key))
}
// The tab changed somewhere else (a shortcut, a link): scroll the column to it
// — unless it is already in the tile, or already on its way there.
let target: TabKey = tab.value
watch(tab, (key) => {
  if (centred.value !== key && target !== key) moveTo(nearestSlot(key))
})
watch(centred, (key) => (target = key))
onBeforeUnmount(() => {
  clearTimeout(changeTimer)
  clearInterval(stepTimer)
})

// ---- the tooltip ------------------------------------------------------------------
// One tooltip for the whole column, drawn outside the window (which clips), and
// placed beside whichever slot the pointer or focus is on.
const trackEl = ref<HTMLElement | null>(null)
const hoverD = ref<number | null>(null)
const hoverLabel = computed(() =>
  hoverD.value == null ? '' : tabAt(pos.value + hoverD.value).label,
)
const hoverTipStyle = computed(() => {
  const el = trackEl.value
  const d = hoverD.value ?? 0
  const y = el ? el.offsetTop + el.offsetHeight / 2 + d * SPACING.value : 0
  return pxify({ ...tip.value, top: y })
})

// ---- wheel -----------------------------------------------------------------------
const WHEEL_DWELL_MS = 300
let hoverSince = 0
let wheelAcc = 0
let wheelLock = false
function onPointerEnter() {
  hoverSince = performance.now()
}
function onPointerLeave() {
  hoverSince = 0
  wheelAcc = 0
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!hoverSince || performance.now() - hoverSince < WHEEL_DWELL_MS || wheelLock) return
  wheelAcc += e.deltaY
  if (Math.abs(wheelAcc) < 40) return
  scrollTo(pos.value + (wheelAcc > 0 ? 1 : -1))
  wheelAcc = 0
  wheelLock = true
  setTimeout(() => (wheelLock = false), 140)
}

// ---- badges --------------------------------------------------------------------
const badges = computed<Partial<Record<TabKey, number>>>(() => {
  void now.value
  return {
    todo: app.pendingOverdue('todos').length,
    tasks: app.pendingOverdue('tasks').length,
  }
})

// ---- the "⋯" menu -----------------------------------------------------------
const menuOpen = ref(false)
const moreBtn = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
// Fixed to the viewport (so the rail never clips it), just right of the pill
// and bottom-aligned with "⋯" so it grows upward.
const menuPos = ref({ left: 0, bottom: 0 })
function toggleMenu() {
  if (!menuOpen.value && moreBtn.value) {
    const r = moreBtn.value.getBoundingClientRect()
    const pill = moreBtn.value.closest('.dock')?.getBoundingClientRect() ?? r
    menuPos.value = { left: pill.right + 12, bottom: Math.max(8, window.innerHeight - r.bottom) }
  }
  menuOpen.value = !menuOpen.value
}
const menuStyle = computed(() => pxify({ left: menuPos.value.left, bottom: menuPos.value.bottom }))
function onDocPointer(e: PointerEvent) {
  const t = e.target as Node
  if (menu.value?.contains(t) || moreBtn.value?.contains(t)) return
  menuOpen.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !menuOpen.value) return
  menuOpen.value = false
  moreBtn.value?.focus()
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  window.removeEventListener('keydown', onKey)
})

// ---- sizes --------------------------------------------------------------------
const TILE = computed(() => (isTablet.value ? 40 : 48))
const GLYPH = computed(() => (isTablet.value ? 20 : 22))
const SPACING = computed(() => TILE.value + (isTablet.value ? 10 : 14))

const capsule = computed(() =>
  pxify({
    position: 'relative',
    width: isTablet.value ? 52 : 64,
    maxHeight: '100%',
    padding: isTablet.value ? '12px 0' : '16px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: isTablet.value ? 8 : 10,
    borderRadius: 'var(--radius-pill)',
  }),
)
// The window: 2·REACH+1 slots tall, the tile drawn in its middle.
const track = computed(() =>
  pxify({
    position: 'relative',
    width: TILE.value + 8,
    height: SPACING.value * (REACH * 2 + 1),
    flexShrink: 0,
  }),
)
const tileStyle = computed(() =>
  pxify({
    width: TILE.value,
    height: TILE.value,
    marginLeft: -TILE.value / 2,
    marginTop: -TILE.value / 2,
  }),
)
function slotStyle(d: number) {
  const a = Math.abs(d)
  return pxify({
    width: TILE.value,
    height: TILE.value,
    marginLeft: -TILE.value / 2,
    marginTop: -TILE.value / 2,
    transform: `translateY(${d * SPACING.value}px) scale(${a > REACH ? 0.8 : a === REACH ? 0.9 : 1})`,
    opacity: a > REACH ? 0 : a === REACH ? 0.45 : 1,
  })
}
const tileSize = computed(() => pxify({ width: TILE.value, height: TILE.value }))
const tip = computed(() =>
  pxify({
    position: 'absolute',
    left: 'calc(100% + 14px)',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '5px 11px',
    borderRadius: 12,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    whiteSpace: 'nowrap',
    zIndex: 40,
    pointerEvents: 'none',
  }),
)
const menuItemLabel = computed(() => pxify({ ...typeStep('sm') }))
</script>

<template>
  <nav
    :style="capsule"
    class="dock"
    aria-label="Sections"
    @wheel="onWheel"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <div ref="trackEl" :style="track" class="dock-track">
      <!-- The tile: fixed in the middle; the icons scroll through it. -->
      <span class="dock-tile" :style="tileStyle" aria-hidden="true"></span>
      <button
        v-for="sl in slots"
        :key="sl.v"
        type="button"
        class="dock-item"
        :class="{ 'is-centre': sl.d === 0, 'is-edge': Math.abs(sl.d) > REACH }"
        :style="slotStyle(sl.d)"
        :aria-label="tabAt(sl.v).label"
        :aria-current="sl.d === 0 && tab === tabAt(sl.v).key ? 'page' : undefined"
        :tabindex="Math.abs(sl.d) > REACH ? -1 : 0"
        :aria-hidden="Math.abs(sl.d) > REACH ? 'true' : undefined"
        @click="scrollTo(sl.v)"
        @pointerenter="hoverD = sl.d"
        @pointerleave="hoverD = null"
        @focus="hoverD = sl.d"
        @blur="hoverD = null"
      >
        <TabGlyph
          :name="tabAt(sl.v).key"
          :filled="sl.d === 0"
          :size="GLYPH"
          col="currentColor"
          :ko="c.accent"
        />
        <span v-if="badges[tabAt(sl.v).key]" class="dock-badge"></span>
      </button>
    </div>
    <span
      class="dock-tip dock-tip--float"
      :class="{ 'is-on': hoverD != null }"
      :style="hoverTipStyle"
      aria-hidden="true"
      >{{ hoverLabel }}</span
    >

    <span class="dock-rule" aria-hidden="true"></span>

    <div class="dock-more-wrap">
      <button
        ref="moreBtn"
        type="button"
        class="dock-btn dock-more"
        :class="{ 'is-open': menuOpen }"
        :style="tileSize"
        aria-label="More sections"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="toggleMenu"
      >
        <Icon name="more-horizontal" size="md" />
        <span v-if="!menuOpen" class="dock-tip" :style="tip">All sections</span>
      </button>

      <!-- Every section by name; picking one scrolls the column to it. -->
      <Transition name="dock-menu">
        <div
          v-if="menuOpen"
          ref="menu"
          class="dock-menu"
          :style="menuStyle"
          role="menu"
          aria-label="All sections"
        >
          <button
            v-for="(t, i) in TABS"
            :key="t.key"
            type="button"
            role="menuitem"
            class="dock-menu__item"
            :class="{ 'is-active': tab === t.key }"
            :style="{ '--i': i }"
            :aria-current="tab === t.key ? 'page' : undefined"
            @click="pick(t.key)"
          >
            <TabGlyph
              :name="t.key"
              :filled="tab === t.key"
              :size="18"
              col="currentColor"
              :ko="c.card"
            />
            <span :style="menuItemLabel">{{ t.label }}</span>
            <span v-if="badges[t.key]" class="dock-badge dock-badge--inline"></span>
          </button>
        </div>
      </Transition>
    </div>
  </nav>
</template>

<style scoped>
/* The pill: an opaque, warm surface lifted off the page by a soft shadow. */
.dock {
  background: color-mix(in oklch, var(--theme-card) 88%, var(--glass-solid, #fff));
  border: 1px solid color-mix(in oklch, var(--theme-text) 6%, transparent);
  box-shadow: var(--shadow-float);
  touch-action: pan-x;
}

/* The window the column scrolls through. Its ends fade, so an icon leaving or
   arriving at the edge dissolves instead of being cut off. */
.dock-track {
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%);
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 9%,
    #000 91%,
    transparent 100%
  );
}

/* The accent tile, fixed in the middle slot, with a soft accent glow under it. */
.dock-tile {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 0;
  border-radius: 16px;
  background: var(--theme-accent);
  box-shadow:
    0 12px 22px -10px color-mix(in oklch, var(--theme-accent) 85%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  pointer-events: none;
  animation: dock-tile-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes dock-tile-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}

/* Every icon sits at the window's centre and is translated out to its slot, so
   a scroll is one transform per icon on a single easing — the column moves as
   one piece and settles with a touch of overshoot. */
.dock-item {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1),
    opacity 0.3s ease,
    color 0.25s ease,
    background 0.2s ease;
}
.dock-item.is-edge {
  pointer-events: none;
}
.dock-item.is-centre {
  color: var(--theme-on-accent);
  cursor: default;
}
.dock-item:not(.is-centre):hover,
.dock-item:not(.is-centre):focus-visible {
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-text);
}
.dock-item:focus-visible,
.dock-btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
/* The glyph lifts under the pointer; the one arriving in the tile pops once. */
.dock-item > :deep(svg) {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dock-item:not(.is-centre):hover > :deep(svg) {
  transform: translateY(-2px) scale(1.08);
}
.dock-item.is-centre > :deep(svg) {
  animation: dock-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 0.18s;
}
@keyframes dock-pop {
  40% {
    transform: scale(1.16);
  }
}

.dock-btn {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dock-btn:hover,
.dock-more.is-open {
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-text);
}
.dock-btn:active {
  transform: scale(0.9);
}
.dock-more > :deep(svg) {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dock-more.is-open > :deep(svg) {
  transform: rotate(90deg);
}

.dock-rule {
  flex-shrink: 0;
  width: 60%;
  height: 1px;
  margin: 2px 0;
  background: color-mix(in oklch, var(--theme-text) 12%, transparent);
}

/* An overdue dot breathes, softly, so it is noticed without nagging. */
.dock-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--theme-danger);
  box-shadow: 0 0 0 2px var(--theme-card);
  animation: dock-breathe 2.4s ease-in-out infinite;
}
@keyframes dock-breathe {
  50% {
    box-shadow:
      0 0 0 2px var(--theme-card),
      0 0 0 6px color-mix(in oklch, var(--theme-danger) 22%, transparent);
  }
}
.dock-item.is-centre .dock-badge {
  box-shadow: 0 0 0 2px var(--theme-accent);
  animation: none;
}
.dock-badge--inline {
  position: static;
  margin-left: auto;
}

/* Tooltips slide out from the rail after a short hover. The track clips its
   icons, so a tooltip inside it is drawn only for the icons in view — which
   is every one a pointer can reach. */
.dock-tip {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-card) 92%, var(--glass-solid, #fff));
  border: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
  box-shadow: var(--shadow-soft);
  opacity: 0;
  translate: -6px 0;
  transition:
    opacity 0.15s ease,
    translate 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.dock-tip--float.is-on,
.dock-btn:hover .dock-tip {
  opacity: 1;
  translate: 0 0;
  transition-delay: 0.35s;
}

.dock-more-wrap {
  position: relative;
}
.dock-menu {
  position: fixed;
  z-index: 60;
  min-width: 200px;
  max-height: min(70vh, 520px);
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 18px;
  background: color-mix(in oklch, var(--theme-card) 94%, var(--glass-solid, #fff));
  border: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
  box-shadow: var(--shadow-float);
  transform-origin: bottom left;
}
.dock-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    padding-left 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  animation: dock-row-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(var(--i, 0) * 18ms + 40ms);
}
@keyframes dock-row-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
}
.dock-menu__item:hover,
.dock-menu__item:focus-visible {
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
  color: var(--theme-text);
  padding-left: 16px;
  outline: none;
}
.dock-menu__item.is-active {
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
}
.dock-menu__item span {
  color: var(--theme-text);
}
.dock-menu-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.32s cubic-bezier(0.34, 1.36, 0.64, 1);
}
.dock-menu-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.16s ease;
}
.dock-menu-enter-from,
.dock-menu-leave-to {
  opacity: 0;
  transform: translateX(-10px) scale(0.92);
}
@media (prefers-reduced-motion: reduce) {
  .dock-item,
  .dock-item > :deep(svg),
  .dock-btn,
  .dock-more > :deep(svg),
  .dock-tip,
  .dock-menu__item,
  .dock-menu-enter-active,
  .dock-menu-leave-active {
    transition: none;
  }
  .dock-tile,
  .dock-item.is-centre > :deep(svg),
  .dock-badge,
  .dock-menu__item {
    animation: none;
  }
}
</style>

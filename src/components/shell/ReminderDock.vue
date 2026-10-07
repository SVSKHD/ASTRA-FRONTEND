<script setup lang="ts">
// The left gutter beside the stage: a greeting with the weather (GreetCard),
// then the reminder card.
//
// On a wide screen the stage stops at its maximum width and leaves starfield
// either side of it. That gutter is where "what is coming up" now lives: a glass
// card listing reminders and deadlines soonest first, folded behind its own
// header like every other accordion in the app. The NEXT pill in the top strip
// stands down while this is on screen (see `reminderDockShown`).
//
// It only appears where it fits. The card measures the gap between the edge of
// the content region and the stage; below MIN_WIDTH of room it hides, and the
// pill in the strip carries the next item as it always did. The stage is never
// moved or narrowed to make room — the card lives in space nothing else uses.
//
// The dock can also be picked up by its grip bar and dropped anywhere in the
// region, and pinned so a stray drag cannot move it. Where it was dropped and
// whether it is pinned are kept in localStorage, so it stays put across tabs
// and reloads. "Back to the side" (or a double-click on the bar) returns it to
// the gutter.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAccordionState } from '@/composables/useAccordionState'
import { storeToRefs } from 'pinia'
import {
  daysToGo,
  reminderDockShown,
  useUpcoming,
  whenLabel,
  type Upcoming,
} from '@/composables/useUpcoming'
import { vScrollFade } from '@/directives/scrollFade'
import Caret from '@/components/ui/Caret.vue'
import Icon from '@/components/ui/Icon.vue'
import GreetCard from '@/components/shell/GreetCard.vue'
import QuoteCard from '@/components/shell/QuoteCard.vue'
import { lateLabel, useOverdue } from '@/composables/useOverdue'

const props = defineProps<{ stage: HTMLElement | null }>()

const MIN_WIDTH = 200
const GAP = 20
const SHOWN = 8

const ui = useUiStore()
const { now } = storeToRefs(ui)
const { list: upcomingAll, colorOf } = useUpcoming()
// Only what is still ahead: anything late is in the Overdue card below.
const list = computed(() => upcomingAll.value.filter((u) => u.ms >= 0))
const { list: late } = useOverdue()

// The flag a row wears: a reminder's own priority, or "Deadline".
const FLAG: Record<string, string> = { high: 'High', normal: 'Normal', low: 'Low' }
function flagLabel(u: Upcoming): string {
  return u.priority ? FLAG[u.priority] : 'Deadline'
}
// Within three days, the count is drawn in the accent so it stands out.
function isSoon(u: Upcoming): boolean {
  return u.ms >= 0 && u.ms < 3 * 86400000
}
const acc = useAccordionState()
const KEY = 'dock:reminders'
const open = computed(() => acc.isOpen(KEY, true))
const LATE_KEY = 'dock:overdue'
const lateOpen = computed(() => acc.isOpen(LATE_KEY, true))
const lateShown = computed(() => late.value.slice(0, SHOWN))
const lateMore = computed(() => Math.max(0, late.value.length - SHOWN))

// Where the dock was dropped (null: its default place — the gutter on a wide
// screen, the bottom-right corner on a laptop or tablet), whether it is pinned
// there, and whether the floating widget is folded down to its bubble (null: not
// chosen yet, so it starts as a bubble where there is no gutter). Coordinates are
// relative to the region the stage sits in.
type DockPos = { x: number; y: number }
const DOCK_KEY = 'aureon:reminderDock'
const FLOAT_MAX_W = 360
// Below this the region is a phone: the dock stays hidden and the pill in the
// strip carries the next item.
const FLOAT_MIN_REGION = 560
const EDGE = 8
const STEP = 16

function loadDock(): { pos: DockPos | null; pinned: boolean; mini: boolean | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(DOCK_KEY) ?? 'null')
    const p = raw?.pos
    const pos =
      p && [p.x, p.y].every((n) => typeof n === 'number' && Number.isFinite(n))
        ? { x: p.x as number, y: p.y as number }
        : null
    const mini = typeof raw?.mini === 'boolean' ? (raw.mini as boolean) : null
    return { pos, pinned: raw?.pinned === true, mini }
  } catch {
    return { pos: null, pinned: false, mini: null }
  }
}
const saved = loadDock()
const pos = ref<DockPos | null>(saved.pos)
const pinned = ref(saved.pinned)
const mini = ref<boolean | null>(saved.mini)
function persist() {
  try {
    localStorage.setItem(
      DOCK_KEY,
      JSON.stringify({ pos: pos.value, pinned: pinned.value, mini: mini.value }),
    )
  } catch {
    /* ignore (private mode / quota) */
  }
}

const el = ref<HTMLElement | null>(null)
const scrollEl = ref<HTMLElement | null>(null)

// The room to the left of the stage, and the size of the region the dock can
// roam, re-measured whenever the stage or the region around it changes size.
const room = ref(0)
const regionW = ref(0)
const regionH = ref(0)
function measure() {
  room.value = props.stage ? props.stage.offsetLeft : 0
  const region = props.stage?.parentElement
  regionW.value = region?.clientWidth ?? 0
  regionH.value = region?.clientHeight ?? 0
  // A smaller window must not strand a dropped dock off-screen.
  if (pos.value && regionW.value) pos.value = clampPos(pos.value)
}

// The whole gutter, less a margin either side: the card reaches across to the
// stage rather than floating as a narrow tile in the middle of the space.
const width = computed(() => room.value - GAP * 2)
const gutterFits = computed(() => width.value >= MIN_WIDTH)
// In the gutter only when it fits there and has not been dragged out of it.
// Everywhere else (a laptop, a tablet, or after a drag) it is a floating widget.
const docked = computed(() => !pos.value && gutterFits.value)
const floating = computed(() => !docked.value)
const fits = computed(() => docked.value || regionW.value >= FLOAT_MIN_REGION)
const floatW = computed(() => Math.min(FLOAT_MAX_W, regionW.value - GAP * 2))
const isMini = computed(() => floating.value && (mini.value ?? !gutterFits.value))
// The NEXT pill stands down only while the full list is on screen; the bubble
// shows counts, not the next item, so the pill keeps that job.
watch(
  () => fits.value && !isMini.value,
  (f) => (reminderDockShown.value = f),
  { immediate: true },
)

function boxSize(): { w: number; h: number } {
  if (isMini.value) return { w: el.value?.offsetWidth || 180, h: el.value?.offsetHeight || 44 }
  return { w: floatW.value, h: 56 }
}
function clampPos(p: DockPos): DockPos {
  const box = boxSize()
  const maxX = Math.max(EDGE, regionW.value - box.w - EDGE)
  const maxY = Math.max(EDGE, regionH.value - box.h - EDGE)
  return {
    x: Math.round(Math.min(Math.max(p.x, EDGE), maxX)),
    y: Math.round(Math.min(Math.max(p.y, EDGE), maxY)),
  }
}

let ro: ResizeObserver | null = null
watch(
  () => props.stage,
  (stage) => {
    ro?.disconnect()
    ro = null
    if (!stage || typeof ResizeObserver === 'undefined') return measure()
    ro = new ResizeObserver(measure)
    ro.observe(stage)
    if (stage.parentElement) ro.observe(stage.parentElement)
    measure()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  ro?.disconnect()
  reminderDockShown.value = false
})

const shown = computed(() => list.value.slice(0, SHOWN))
const more = computed(() => Math.max(0, list.value.length - SHOWN))

function go(u: Upcoming) {
  ui.setTab(u.kind === 'reminder' ? 'reminders' : 'deadlines')
}

const cardStyle = computed(() => {
  if (docked.value) {
    return {
      width: width.value + 'px',
      left: Math.max(GAP, (room.value - width.value) / 2) + 'px',
    }
  }
  const w = isMini.value ? 'auto' : floatW.value + 'px'
  // Not moved yet: anchored to the bottom-right corner, so opening the bubble
  // grows the card upward out of it.
  if (!pos.value) {
    return {
      width: w,
      left: 'auto',
      top: 'auto',
      right: GAP + 'px',
      bottom: GAP + 'px',
      maxHeight: regionH.value - GAP * 2 + 'px',
    }
  }
  return {
    width: w,
    left: pos.value.x + 'px',
    top: pos.value.y + 'px',
    maxHeight: Math.max(160, regionH.value - pos.value.y - GAP) + 'px',
  }
})

// ---- moving it -------------------------------------------------------------
const dragging = ref(false)
// Captured on pointerdown: where in the card it was grabbed (scaled to the
// width it will float at) and the region's origin on screen.
let grab: {
  id: number
  bar: HTMLElement
  sx: number
  sy: number
  ox: number
  oy: number
  px: number
  py: number
} | null = null

function onBarDown(e: PointerEvent) {
  if (pinned.value || e.button !== 0 || !el.value) return
  const region = el.value.offsetParent as HTMLElement | null
  if (!region) return
  const card = el.value.getBoundingClientRect()
  const origin = region.getBoundingClientRect()
  // Leaving the gutter, the card narrows to the floating width; keep the point
  // under the finger in proportion so it does not jump away from it.
  const scale = isMini.value ? 1 : floatW.value / card.width
  grab = {
    id: e.pointerId,
    bar: e.currentTarget as HTMLElement,
    sx: e.clientX,
    sy: e.clientY,
    ox: (e.clientX - card.left) * scale,
    oy: e.clientY - card.top,
    px: origin.left,
    py: origin.top,
  }
}
function onBarMove(e: PointerEvent) {
  if (!grab || e.pointerId !== grab.id) return
  // A few pixels of slack so a tap on the bar (or the bubble) stays a click.
  if (!dragging.value) {
    if (Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy) < 5) return
    dragging.value = true
    // Captured only once it is a drag: the release then lands on the bar, not
    // on a button under the finger, so a drag never also toggles something.
    grab.bar.setPointerCapture(e.pointerId)
  }
  pos.value = clampPos({ x: e.clientX - grab.px - grab.ox, y: e.clientY - grab.py - grab.oy })
}
function onBarUp(e: PointerEvent) {
  if (!grab || e.pointerId !== grab.id) return
  grab = null
  if (dragging.value) persist()
  dragging.value = false
}
function onBarDbl(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.rdock__tool, .rdock__open')) return
  reset()
}

// The grip is also a button: arrow keys nudge the dock, Shift for bigger steps.
function onGripKey(e: KeyboardEvent) {
  if (pinned.value || !el.value) return
  const d = e.shiftKey ? STEP * 3 : STEP
  const move: Record<string, [number, number]> = {
    ArrowLeft: [-d, 0],
    ArrowRight: [d, 0],
    ArrowUp: [0, -d],
    ArrowDown: [0, d],
  }
  if (e.key === 'Home') {
    e.preventDefault()
    return reset()
  }
  const m = move[e.key]
  if (!m) return
  e.preventDefault()
  const base = pos.value ?? { x: el.value.offsetLeft, y: el.value.offsetTop }
  pos.value = clampPos({ x: base.x + m[0], y: base.y + m[1] })
  persist()
}

function togglePin() {
  pinned.value = !pinned.value
  persist()
}
function reset() {
  if (pinned.value || !pos.value) return
  pos.value = null
  persist()
}
// Open the bubble into the full card, or fold it back down.
async function setMini(v: boolean) {
  mini.value = v
  persist()
  if (v || !pos.value) return
  // Opened from a bubble low on the screen: lift it so the card has room to
  // show itself rather than squeezing into the strip below.
  await nextTick()
  if (!pos.value || !el.value || !scrollEl.value) return
  const natural = el.value.offsetHeight - scrollEl.value.clientHeight + scrollEl.value.scrollHeight
  const y = Math.min(pos.value.y, regionH.value - GAP - Math.min(natural, regionH.value * 0.8))
  pos.value = clampPos({ x: pos.value.x, y })
  persist()
}
</script>

<template>
  <aside
    v-if="fits"
    ref="el"
    class="rdock"
    :class="{
      'is-floating': floating,
      'is-mini': isMini,
      'is-dragging': dragging,
      'is-pinned': pinned,
    }"
    :style="cardStyle"
    aria-label="Coming up"
  >
    <!-- The grip bar: drag it to move the dock, pin it to hold it there. Folded
         down, it is the whole widget: a bubble with the counts that opens on tap. -->
    <div
      class="rdock__bar"
      :title="pinned ? 'Pinned — unpin to move' : 'Drag to move · double-click to send back'"
      @pointerdown="onBarDown"
      @pointermove="onBarMove"
      @pointerup="onBarUp"
      @pointercancel="onBarUp"
      @dblclick="onBarDbl"
    >
      <button
        type="button"
        class="rdock__grip"
        :disabled="pinned"
        aria-label="Move the dock (arrow keys, Home to send back)"
        @keydown="onGripKey"
      >
        <Icon name="grip" size="xs" />
      </button>
      <button
        v-if="isMini"
        type="button"
        class="rdock__open"
        :aria-label="`Open reminders: ${list.length} coming up, ${late.length} overdue`"
        @click="setMini(false)"
      >
        <Icon name="bell" size="sm" class="rdock__bell" />
        <span class="rdock__open-label">Reminders</span>
        <span class="rdock__count">{{ list.length }}</span>
        <span v-if="late.length" class="rdock__count is-overdue">{{ late.length }}</span>
      </button>
      <span v-else class="rdock__bar-label">{{ pinned ? 'Pinned' : 'Coming up' }}</span>
      <button
        v-if="pos && !pinned && !isMini"
        type="button"
        class="rdock__tool"
        :title="gutterFits ? 'Back to the side' : 'Back to the corner'"
        :aria-label="
          gutterFits ? 'Send the dock back to the side' : 'Send the dock back to the corner'
        "
        @click="reset"
      >
        <Icon name="rotate-ccw" size="xs" />
      </button>
      <button
        v-if="floating && !isMini"
        type="button"
        class="rdock__tool"
        title="Minimise"
        aria-label="Fold the dock down to a bubble"
        @click="setMini(true)"
      >
        <Icon name="minimize" size="xs" />
      </button>
      <button
        type="button"
        class="rdock__tool"
        :class="{ 'is-on': pinned }"
        :aria-pressed="pinned"
        :title="pinned ? 'Unpin' : 'Pin it here'"
        :aria-label="pinned ? 'Unpin the dock' : 'Pin the dock here'"
        @click="togglePin"
      >
        <Icon name="pin" size="xs" />
      </button>
    </div>

    <div v-if="!isMini" ref="scrollEl" class="rdock__scroll">
      <!-- Hello, the date and the weather, above what is coming up. -->
      <GreetCard />
      <button
        type="button"
        class="rdock__head"
        :aria-expanded="open"
        aria-controls="rdock-body"
        @click="acc.toggle(KEY, true)"
      >
        <Icon name="bell" size="sm" class="rdock__bell" />
        <span class="rdock__title">Reminders</span>
        <span v-if="list.length" class="rdock__count">{{ list.length }}</span>
        <Caret :open="open" />
      </button>

      <!-- The list is a second card of its own, floating under the bar: it unfolds
         out of the bar when it opens and folds back into it when it closes. -->
      <div class="rdock__fold" :class="{ 'is-open': open }" :inert="!open">
        <div class="rdock__fold-inner">
          <div class="rdock__panel">
            <div id="rdock-body" v-scroll-fade class="rdock__body">
              <button
                v-for="u in shown"
                :key="u.key"
                type="button"
                class="rdock__item"
                :title="u.title + ' — ' + flagLabel(u) + ', ' + daysToGo(u.at, now)"
                @click="go(u)"
              >
                <span class="rdock__dot" :style="{ background: colorOf(u) }"></span>
                <span class="rdock__main">
                  <span class="rdock__name">{{ u.title || '(untitled)' }}</span>
                  <!-- Its importance, and when. -->
                  <span class="rdock__meta">
                    <span class="rdock__flag" :class="'is-' + (u.priority ?? 'deadline')">
                      <Icon name="flag" size="xs" />{{ flagLabel(u) }}
                    </span>
                    <span class="rdock__when">{{ whenLabel(u) }}</span>
                  </span>
                </span>
                <span
                  class="rdock__time"
                  :class="{ 'is-overdue': u.ms < 0, 'is-soon': isSoon(u) }"
                  >{{ daysToGo(u.at, now) }}</span
                >
              </button>
              <p v-if="!list.length" class="rdock__empty">Nothing coming up.</p>
              <button v-if="more" type="button" class="rdock__more" @click="ui.setTab('reminders')">
                + {{ more }} more
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- A line to steady the eye between what is coming and what is late. -->
      <QuoteCard />

      <!-- Overdue: late tasks, deadlines, dated ideas and carried-over todos,
         latest first. The same bar-and-card fold as the reminders. -->
      <button
        type="button"
        class="rdock__head"
        :aria-expanded="lateOpen"
        aria-controls="rdock-late"
        @click="acc.toggle(LATE_KEY, true)"
      >
        <Icon name="alert-circle" size="sm" class="rdock__bell rdock__bell--late" />
        <span class="rdock__title">Overdue</span>
        <span v-if="late.length" class="rdock__count is-overdue">{{ late.length }}</span>
        <Caret :open="lateOpen" />
      </button>
      <div class="rdock__fold" :class="{ 'is-open': lateOpen }" :inert="!lateOpen">
        <div class="rdock__fold-inner">
          <div class="rdock__panel">
            <div id="rdock-late" v-scroll-fade class="rdock__body">
              <button
                v-for="o in lateShown"
                :key="o.key"
                type="button"
                class="rdock__item"
                :title="o.title + ' — ' + lateLabel(o.days)"
                @click="ui.setTab(o.tab)"
              >
                <span class="rdock__dot" :style="{ background: 'var(--theme-danger)' }"></span>
                <span class="rdock__main">
                  <span class="rdock__name">{{ o.title || '(untitled)' }}</span>
                  <span class="rdock__meta">
                    <span class="rdock__flag">{{
                      o.kind === 'Todo' ? 'Carried todo' : o.kind
                    }}</span>
                  </span>
                </span>
                <span class="rdock__time is-overdue">{{ lateLabel(o.days) }}</span>
              </button>
              <p v-if="!late.length" class="rdock__empty">Nothing overdue. 🎉</p>
              <span v-if="lateMore" class="rdock__empty">+ {{ lateMore }} more</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Two floating glass cards, one above the other: the bar, and — when it is
   open — the list. The aside itself is only their column. */
.rdock {
  position: absolute;
  top: 18px;
  z-index: 3;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100% - 36px);
  min-height: 0;
  /* Glides back to the gutter on reset; follows the pointer exactly while dragged. */
  transition:
    left 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.2s ease;
}
/* Dropped over the stage, it sits above everything else in the region. */
.rdock.is-floating {
  z-index: 6;
}
.rdock.is-dragging {
  transition: none;
  user-select: none;
  filter: drop-shadow(0 18px 36px color-mix(in oklch, black 38%, transparent));
}
/* Five cards can outgrow a short window; the column scrolls, the page does not. */
.rdock__scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

/* The grip bar: a slim glass strip, quiet until the dock is hovered. */
.rdock__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 32px;
  padding: 0 4px 0 2px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 6%, var(--glass-card, var(--theme-card)));
  border: 1px solid color-mix(in oklch, var(--theme-accent) 16%, transparent);
  backdrop-filter: blur(30px) saturate(1.6);
  -webkit-backdrop-filter: blur(30px) saturate(1.6);
  color: var(--theme-dim);
  cursor: grab;
  touch-action: none;
  opacity: 0.7;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}
.rdock:hover .rdock__bar,
.rdock:focus-within .rdock__bar,
.rdock.is-dragging .rdock__bar {
  opacity: 1;
}
.rdock.is-dragging .rdock__bar {
  cursor: grabbing;
  background: color-mix(in oklch, var(--theme-accent) 14%, var(--glass-card, var(--theme-card)));
}
.rdock.is-pinned .rdock__bar {
  cursor: default;
}
/* Floating over the stage, or on a touch screen with no hover to reveal it,
   the bar is the only handle there is, so it is always fully drawn. */
.rdock.is-floating .rdock__bar {
  opacity: 1;
}
@media (hover: none) {
  .rdock__bar {
    opacity: 1;
  }
}
/* Folded down: the bar becomes a bubble — taller, lifted, easy to hit with a
   finger — and the aside shrinks to fit it. */
.rdock.is-mini {
  gap: 0;
}
.rdock.is-mini .rdock__bar {
  height: 44px;
  padding: 0 6px 0 4px;
  background: color-mix(in oklch, var(--theme-accent) 12%, var(--glass-card, var(--theme-card)));
  border-color: color-mix(in oklch, var(--theme-accent) 28%, transparent);
  box-shadow: 0 10px 28px color-mix(in oklch, black 32%, transparent);
  color: var(--theme-text);
}
.rdock__open {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px 0 6px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background var(--dur-fast, 120ms) ease;
}
.rdock__open:hover {
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
}
.rdock__open:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.rdock__open-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.rdock__grip {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: inherit;
}
.rdock__grip:disabled {
  opacity: 0.35;
}
.rdock__bar-label {
  flex: 1;
  min-width: 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rdock.is-pinned .rdock__bar-label {
  color: var(--theme-accent);
}
.rdock__tool {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    background var(--dur-fast, 120ms) ease,
    color var(--dur-fast, 120ms) ease,
    transform 0.2s ease;
}
.rdock__tool:hover {
  background: color-mix(in srgb, var(--theme-text) 9%, transparent);
  color: var(--theme-text);
}
/* Pinned: the pin stands upright in the accent. Unpinned it leans over. */
.rdock__tool:last-child {
  transform: rotate(40deg);
}
.rdock__tool.is-on {
  transform: none;
  background: color-mix(in oklch, var(--theme-accent) 20%, transparent);
  color: var(--theme-accent);
}
.rdock__grip:focus-visible,
.rdock__tool:focus-visible,
.rdock__head:focus-visible,
.rdock__more:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .rdock,
  .rdock__tool {
    transition: none;
  }
}
/* The shared surface: glass warmed with the theme's accent so each card reads
   as its own surface against the starfield rather than a hole in it. */
.rdock__head,
.rdock__panel {
  border-radius: var(--radius-dialog);
  background: color-mix(in oklch, var(--theme-accent) 9%, var(--glass-card, var(--theme-card)));
  border: 1px solid color-mix(in oklch, var(--theme-accent) 22%, transparent);
  backdrop-filter: blur(30px) saturate(1.6);
  -webkit-backdrop-filter: blur(30px) saturate(1.6);
}
.rdock__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: 14px 16px;
  /* A hairline lift: the bar sits close to the starfield. */
  box-shadow: 0 2px 10px color-mix(in oklch, black 22%, transparent);
  transition: background var(--dur-fast, 120ms) ease;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rdock__head:hover {
  background: color-mix(in oklch, var(--theme-accent) 15%, var(--glass-card, var(--theme-card)));
}
.rdock__bell {
  color: var(--theme-accent);
}
.rdock__bell--late {
  color: var(--theme-danger);
}
.rdock__title {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.rdock__count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.rdock__count.is-overdue {
  background: color-mix(in srgb, var(--theme-danger) 18%, transparent);
  color: var(--theme-danger);
}
/* The fold animates its real height (a grid row going 0fr → 1fr), so the
   cards below glide down and back up instead of jumping. Closed, it also
   swallows the column's gap so nothing is left hanging under the bar. */
.rdock__fold {
  display: grid;
  grid-template-rows: 0fr;
  margin-top: -10px;
  transition:
    grid-template-rows 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    margin-top 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.rdock__fold.is-open {
  grid-template-rows: 1fr;
  margin-top: -4px;
}
/* Clips the panel while it folds. The side padding is the panel's inset from
   the bar; the bottom padding (given back by the negative margin) leaves room
   for its shadow so the clip does not cut it off. */
.rdock__fold-inner {
  min-height: 0;
  overflow: hidden;
  padding: 0 14px 24px;
  margin-bottom: -24px;
}
/* The list card floats a little higher than the bar — a softer, wider
   shadow — so it reads as lifted over the page. It slides down out of the
   bar and fades in as the fold opens, and the reverse as it closes. */
.rdock__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  box-shadow: 0 12px 28px color-mix(in oklch, black 30%, transparent);
  transform-origin: top center;
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
  transition:
    opacity 0.2s ease,
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.rdock__fold.is-open .rdock__panel {
  opacity: 1;
  transform: none;
  transition:
    opacity 0.26s ease 0.06s,
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .rdock__fold,
  .rdock__panel,
  .rdock__fold.is-open .rdock__panel {
    transition: opacity 0.15s ease;
    transform: none;
  }
}
.rdock__body {
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
}
.rdock__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--dur-fast, 120ms) ease,
    transform var(--dur-fast, 120ms) ease;
}
.rdock__item:hover,
.rdock__item:focus-visible {
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  outline: none;
}
.rdock__item:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in oklch, var(--theme-accent) 60%, transparent);
}
.rdock__item:active {
  transform: scale(0.985);
}
.rdock__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rdock__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.rdock__name {
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rdock__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.rdock__when {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The importance flag: High in the danger colour, Normal in the accent, Low
   and deadlines quiet. */
.rdock__flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 1px 6px 1px 4px;
  border-radius: var(--radius-pill);
  font-weight: var(--weight-semibold);
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
}
.rdock__flag.is-high {
  background: color-mix(in srgb, var(--theme-danger) 16%, transparent);
  color: var(--theme-danger);
}
.rdock__flag.is-normal {
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}
.rdock__time {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-dim);
}
.rdock__time.is-soon {
  color: var(--theme-accent);
}
.rdock__time.is-overdue {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.rdock__empty {
  margin: 0;
  padding: 6px 10px 4px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.rdock__more {
  align-self: flex-start;
  margin: 2px 10px 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
</style>

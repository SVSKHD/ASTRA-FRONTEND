<script setup lang="ts">
// A side drawer for secondary flows that should not take the whole screen.
//
// Four widths, because the things a drawer holds are different shapes: a short
// form fits in 380px, a reference table does not, and a detail pane is read
// beside the list it came from — `compact` gives that one a readable column and
// `large` the 50/50 split. All of them are drawers rather than modals: they
// stay attached to the edge and leave the page they came from visible beside
// them.
//
// `compact` and `large` are also the two the reader chooses between, via the
// button in the header. Two modes rather than a remembered pixel width: the
// question being answered is "am I reading this, or glancing at it while I work
// down the list", and that has two answers. The drag handle is still there for
// everything between them, and a drag wins over the mode until the mode is
// changed again.
//
// `modal: false` makes it a companion pane instead: no scrim, so the list it
// was opened from stays clickable and picking another row swaps what the pane
// shows rather than closing it. That is the shape every detail pane in the app
// uses — it floats over the tab rather than taking a column out of it, so the
// content keeps the full width whether the pane is open or not.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'

export type SlideOverSize = 'md' | 'lg' | 'compact' | 'large'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    side?: 'left' | 'right'
    size?: SlideOverSize
    modal?: boolean
    /** Show the compact/large toggle in the header. */
    modes?: boolean
  }>(),
  {
    side: 'right',
    size: 'md',
    modal: true,
    modes: false,
  },
)
const emit = defineEmits<{
  close: []
  'update:size': [size: SlideOverSize]
  /** The pane's current width in px, so a view can make room for it. */
  width: [px: number]
}>()

/** The compact column. Wide enough for a stat row and a wrapped sentence. */
const COMPACT_PX = 420

// `large` is a share of the window, so it is measured rather than declared —
// and re-measured on a resize, because a pane pinned to half of the window it
// was opened in is not half of the window an hour later.
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
function defaultWidth(): number {
  if (props.size === 'large') return Math.round(viewportWidth.value / 2)
  if (props.size === 'compact') return COMPACT_PX
  return props.size === 'lg' ? 560 : 380
}
const drawerWidth = ref(defaultWidth())
// Once it has been dragged, the drag wins: a width somebody chose is not
// something a window resize gets to overrule. Choosing a mode is choosing
// again, so that clears it.
const userSized = ref(false)
const resizeStart = ref<{ pointer: number; width: number } | null>(null)
const drawerStyle = computed(() => ({ width: `${drawerWidth.value}px` }))

function onViewportResize(): void {
  viewportWidth.value = window.innerWidth
  drawerWidth.value = userSized.value ? clampWidth(drawerWidth.value) : defaultWidth()
}
onMounted(() => {
  viewportWidth.value = window.innerWidth
  if (!userSized.value) drawerWidth.value = defaultWidth()
  window.addEventListener('resize', onViewportResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onViewportResize))

// A mode change is a fresh answer, so it overrides whatever the grip left
// behind — otherwise "Compact" on a pane dragged wide does nothing visible and
// reads as a broken button.
watch(
  () => props.size,
  () => {
    userSized.value = false
    drawerWidth.value = defaultWidth()
  },
)
// The width goes out to whoever is making room for the pane, on every cause of
// a change: the mode, a drag, a window resize, and the first open.
watch(drawerWidth, (px) => emit('width', px), { immediate: true })
watch(
  () => props.open,
  (open) => emit('width', open ? drawerWidth.value : 0),
  { immediate: true },
)

function clampWidth(width: number): number {
  const max = viewportWidth.value - 32
  const ceiling = props.size === 'md' ? 560 : props.size === 'lg' ? 720 : max
  return Math.max(280, Math.min(Math.min(ceiling, max), width))
}

const nextMode = computed<SlideOverSize>(() => (props.size === 'compact' ? 'large' : 'compact'))
const modeLabel = computed(() => (props.size === 'compact' ? 'Maximise pane' : 'Compact pane'))

function beginResize(event: PointerEvent): void {
  // Without this the browser starts a text selection under the cursor and the
  // drag ends with half the pane highlighted.
  event.preventDefault()
  resizeStart.value = { pointer: event.clientX, width: drawerWidth.value }
  userSized.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function resize(event: PointerEvent): void {
  if (!resizeStart.value) return
  const delta = event.clientX - resizeStart.value.pointer
  drawerWidth.value = clampWidth(resizeStart.value.width + (props.side === 'left' ? delta : -delta))
}

function endResize(): void {
  resizeStart.value = null
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (!direction) return
  event.preventDefault()
  userSized.value = true
  drawerWidth.value = clampWidth(drawerWidth.value + direction * (props.side === 'left' ? 24 : -24))
}

// A modal drawer holds focus, so its own Escape handler is enough. A companion
// pane does not: the focus is usually still out in the list it was opened from,
// and a pane with no way out but the × is a pane people leave open. Escape
// while an editor has the focus belongs to that editor (inline edit cancels
// with it), so those are left alone.
function onWindowKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const el = event.target as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
  emit('close')
}
function listenForEscape(on: boolean): void {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onWindowKey)
  if (on) window.addEventListener('keydown', onWindowKey)
}
watch(
  () => props.open && !props.modal,
  (on) => listenForEscape(on),
  { immediate: true },
)
onBeforeUnmount(() => listenForEscape(false))
</script>

<template>
  <!-- To the body, and this is not a detail. `position: fixed` is measured
       against the nearest ancestor with a transform, a filter or a
       backdrop-filter — and every tab in this app sits inside a glass panel
       that has one. Left where it is declared, the drawer is fixed to the
       PANEL: it ends where the panel's content ends rather than at the bottom
       of the window, and its edge lands a gutter short of the window's. That is
       a drawer inside the tab wearing a drawer's clothes. Teleported, it is
       what it claims to be — attached to the window, over everything, whatever
       the tab underneath is doing.

       Transitions rather than a mount animation, so the pane slides out as well
       as in. A drawer that appears with a movement and vanishes without one
       reads as two different objects. -->
  <Teleport to="body">
    <Transition name="ui-drawer-scrim">
      <div v-if="open && modal" class="ui-drawer__scrim" @click="emit('close')"></div>
    </Transition>
    <Transition :name="`ui-drawer-${side}`">
      <aside
        v-if="open"
        class="ui-drawer"
        :class="[
          `ui-drawer--${side}`,
          `ui-drawer--${size}`,
          { 'ui-drawer--dragging': resizeStart !== null },
        ]"
        :style="drawerStyle"
        :role="modal ? 'dialog' : 'complementary'"
        :aria-modal="modal ? 'true' : undefined"
        :aria-label="title"
        @keydown.esc="emit('close')"
      >
        <div
          class="ui-drawer__grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize drawer"
          tabindex="0"
          @pointerdown="beginResize"
          @pointermove="resize"
          @pointerup="endResize"
          @pointercancel="endResize"
          @keydown="resizeWithKeyboard"
        ></div>
        <header class="ui-drawer__head">
          <h2 class="ui-drawer__title">{{ title }}</h2>
          <button
            v-if="modes"
            class="ui-drawer__mode"
            type="button"
            :aria-label="modeLabel"
            :title="modeLabel"
            :aria-pressed="size === 'large'"
            @click="emit('update:size', nextMode)"
          >
            <Icon :name="size === 'compact' ? 'maximize' : 'minimize'" size="xs" />
          </button>
          <button class="ui-drawer__x" type="button" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="ui-drawer__body"><slot /></div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-drawer__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklch, var(--glass-solid) 42%, transparent);
}
.ui-drawer {
  position: fixed;
  top: var(--sp-3);
  bottom: var(--sp-3);
  z-index: 51;
  min-width: 280px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--theme-text);
  /* NOT a scroll container. It used to be, and that quietly broke the resize
     grip: the grip sits 4px outside the drawer's left edge, and a box with
     `overflow-y: auto` clips on BOTH axes — so the handle was cropped to a
     hairline and a drag on it selected the text behind instead of resizing.
     The body scrolls instead, which also pins the header. */
  overflow: visible;
  /* Carries its own separation from the page. A modal drawer could lean on the
     scrim for that; a companion pane has none. */
  box-shadow: var(--layer-overlay-shadow);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-drawer {
    background: var(--glass-solid);
  }
}
.ui-drawer--md {
  --drawer-w: 380px;
}
.ui-drawer--lg {
  --drawer-w: 560px;
}
.ui-drawer--compact {
  --drawer-w: 420px;
}
/* Half the window, and half of a phone is not a pane — it is two unusable
   columns, so below the breakpoint both modes take the width they can get. */
.ui-drawer--large {
  --drawer-w: 50vw;
}
@media (max-width: 720px) {
  .ui-drawer--large,
  .ui-drawer--compact {
    width: calc(100vw - 32px) !important;
  }
}
/* The width is driven from script (the mode, the grip, the window), so the
   transition is what makes a mode change read as the pane growing rather than
   as a new pane. The grip sets it aside while dragging: a lagging edge under
   the cursor is the one place this would feel broken. */
.ui-drawer {
  transition: width var(--dur-med) var(--ease-out);
}
.ui-drawer--dragging {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .ui-drawer {
    transition: none;
  }
}
.ui-drawer--right {
  right: var(--sp-3);
}
.ui-drawer--left {
  left: var(--sp-3);
}
.ui-drawer__grip {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 72px;
  border-radius: var(--radius-pill);
  background: var(--glass-border);
  cursor: ew-resize;
  transform: translateY(-50%);
  /* A drag here is a resize, never a text selection or a page pan. */
  user-select: none;
  touch-action: none;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.ui-drawer__grip:hover,
.ui-drawer__grip:focus-visible {
  background: var(--theme-accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent) 50%, transparent);
  outline: none;
}
.ui-drawer--right .ui-drawer__grip {
  left: -4px;
}
.ui-drawer--left .ui-drawer__grip {
  right: -4px;
}
/* In and out from its own edge. A companion pane opens often enough that the
   movement is what says where it came from and where it went — landing and
   vanishing in place reads as a flicker. */
.ui-drawer-right-enter-active,
.ui-drawer-right-leave-active,
.ui-drawer-left-enter-active,
.ui-drawer-left-leave-active {
  transition:
    transform var(--dur-med) var(--ease-out),
    opacity var(--dur-med) var(--ease-out);
  will-change: transform;
}
.ui-drawer-right-enter-from,
.ui-drawer-right-leave-to {
  transform: translateX(calc(100% + var(--sp-3)));
  opacity: 0;
}
.ui-drawer-left-enter-from,
.ui-drawer-left-leave-to {
  transform: translateX(calc(-100% - var(--sp-3)));
  opacity: 0;
}
.ui-drawer-scrim-enter-active,
.ui-drawer-scrim-leave-active {
  transition: opacity var(--dur-med) var(--ease-out);
}
.ui-drawer-scrim-enter-from,
.ui-drawer-scrim-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ui-drawer-right-enter-active,
  .ui-drawer-right-leave-active,
  .ui-drawer-left-enter-active,
  .ui-drawer-left-leave-active {
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .ui-drawer-right-enter-from,
  .ui-drawer-right-leave-to,
  .ui-drawer-left-enter-from,
  .ui-drawer-left-leave-to {
    transform: none;
  }
}
.ui-drawer__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-drawer__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-md);
}
/* The slot fills what is left of the drawer, so content that wants to pin
   something to the bottom (a form's action row) or scroll a region of its own
   (a detail pane) has a height to work against. */
.ui-drawer__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Room for a focus ring on whatever is up against the edges. */
  padding: 2px;
  margin: -2px;
}
.ui-drawer__mode {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.ui-drawer__mode:hover,
.ui-drawer__mode:focus-visible {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
.ui-drawer__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-lg);
  cursor: pointer;
  line-height: 1;
}
</style>

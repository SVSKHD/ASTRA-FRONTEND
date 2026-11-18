<script lang="ts">
/** How many sheets are open right now, across every instance. */
export const BottomSheetState = { count: 0 }
</script>

<script setup lang="ts">
// The mobile counterpart to Modal: same semantics, thumb-reachable.
//
// TELEPORTED TO <body>, like Modal and SlideOver, and that is the fix for the
// phone's More menu being dead to the touch. The sheet used to render where it
// was declared — for the More menu, inside the tab bar's <nav>, which is
// `pointer-events: none` on a phone so the page under the floating bar stays
// tappable. A fixed element still INHERITS pointer-events from its DOM parent,
// so every button in the sheet, its scroll area, its × and its scrim let taps
// fall through to the page underneath: the sheet could be neither used nor
// closed, and the taps meant for it opened whatever lay beneath. It was also
// stacked inside the shell, under the tab bar. Rendered at the root, it owns
// its own pointer events and stacking, wherever it is declared.
//
// LIGHT ON A PHONE. The sheet used to blur everything behind it
// (backdrop-filter) while it slid in, over a starfield whose 110 stars never stop
// twinkling: the blur was recomputed every frame of the slide and every frame
// after, which a desktop GPU absorbs and a phone's drops frames on. On a touch
// screen the sheet is now the theme's solid surface (it covers most of the screen
// behind a scrim, so the blur bought little), and while any sheet is open the
// root carries `ui-sheet-open`, which pauses the starfield (style.css) — the
// background is still, so nothing behind a blurred layer has to be re-blurred.
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

// --- the root class while any sheet is open (several can be: More, then Account) ----------
const ROOT_CLASS = 'ui-sheet-open'
function markRoot() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle(ROOT_CLASS, BottomSheetState.count > 0)
  }
}
let counted = false
function count(on: boolean) {
  if (on === counted) return
  counted = on
  BottomSheetState.count += on ? 1 : -1
  markRoot()
}
watch(
  () => props.open,
  (open) => count(open),
  { immediate: true },
)
onBeforeUnmount(() => count(false))

function clampHeight(height: number): number {
  return Math.max(220, Math.min(Math.min(760, window.innerHeight * 0.86), height))
}
/** Open at about two thirds of the screen: enough to see most of a menu. */
function openingHeight(): number {
  return typeof window === 'undefined' ? 360 : clampHeight(Math.round(window.innerHeight * 0.66))
}

const sheetHeight = ref(openingHeight())
const resizeStart = ref<{ pointer: number; height: number } | null>(null)
const sheetStyle = computed(() => ({ height: `${sheetHeight.value}px` }))
// Each opening starts from the default, not from a size left over from a drag.
watch(
  () => props.open,
  (open) => {
    if (open) sheetHeight.value = openingHeight()
  },
)

function beginResize(event: PointerEvent): void {
  resizeStart.value = { pointer: event.clientY, height: sheetHeight.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function resize(event: PointerEvent): void {
  if (!resizeStart.value) return
  sheetHeight.value = clampHeight(
    resizeStart.value.height - (event.clientY - resizeStart.value.pointer),
  )
}

function endResize(): void {
  resizeStart.value = null
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
  if (!direction) return
  event.preventDefault()
  sheetHeight.value = clampHeight(sheetHeight.value + direction * 24)
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="ui-sheet__scrim" @click="emit('close')"></div>
      <div
        class="ui-sheet"
        :style="sheetStyle"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @keydown.esc="emit('close')"
      >
        <div
          class="ui-sheet__grip"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize sheet"
          tabindex="0"
          @pointerdown="beginResize"
          @pointermove="resize"
          @pointerup="endResize"
          @pointercancel="endResize"
          @keydown="resizeWithKeyboard"
        ></div>
        <header class="ui-sheet__head">
          <h2 class="ui-sheet__title">{{ title }}</h2>
          <button class="ui-sheet__x" type="button" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="ui-sheet__body"><slot /></div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.ui-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  /* Stated, not inherited: see the note at the top of the script. */
  pointer-events: auto;
  background: color-mix(in oklch, var(--glass-solid) 42%, transparent);
  /* Opacity only: the compositor fades it, nothing is repainted. */
  animation: uiScrimIn var(--dur-med) var(--ease-out) both;
}
@keyframes uiScrimIn {
  from {
    opacity: 0;
  }
}
/* Docked to the bottom edge, full width, with the rounded top of a phone's
   own sheet. The head stays put; only the body scrolls. */
.ui-sheet {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 51;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 100%;
  max-width: 560px;
  min-height: 220px;
  max-height: 86vh;
  margin: 0 auto;
  overflow: hidden;
  padding: var(--sp-2) var(--sp-4) calc(var(--sp-4) + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  border: 1px solid var(--glass-border);
  border-bottom: 0;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  box-shadow: 0 -12px 40px color-mix(in oklch, black 28%, transparent);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--theme-text);
  animation: uiSheetIn var(--dur-med) var(--ease-out) both;
  /* Its own layer before the first frame, not promoted halfway through the slide. */
  will-change: transform;
}
/* A touch screen: the theme's solid surface, no backdrop blur, a lighter shadow.
   The slide is then a plain transform of one opaque layer — the cheapest thing a
   phone's compositor can do. */
@media (pointer: coarse) {
  .ui-sheet {
    background: var(--glass-solid);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: 0 -6px 18px color-mix(in oklch, black 22%, transparent);
  }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-sheet {
    background: var(--glass-solid);
  }
}
@keyframes uiSheetIn {
  from {
    transform: translateY(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-sheet,
  .ui-sheet__scrim {
    animation: none;
  }
}
/* A wider hit area than the bar it draws: easy to catch with a thumb. */
.ui-sheet__grip {
  flex-shrink: 0;
  width: 44px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-dim) 45%, transparent);
  margin: var(--sp-1) auto var(--sp-2);
  outline: 10px solid transparent;
  cursor: ns-resize;
  touch-action: none;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.ui-sheet__grip:hover,
.ui-sheet__grip:focus-visible {
  background: var(--theme-accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent) 50%, transparent);
  outline: none;
}
.ui-sheet__head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--sp-2);
}
.ui-sheet__body {
  flex: 1;
  min-height: 0;
  margin: 0 calc(-1 * var(--sp-4));
  padding: 0 var(--sp-4);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ui-sheet__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-md);
}
.ui-sheet__x {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  background: color-mix(in oklch, var(--theme-dim) 10%, transparent);
  color: var(--theme-text);
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
  transition: background-color 120ms var(--ease-out);
}
/* A finger needs 44 × 44 to hit the close button reliably. */
@media (pointer: coarse) {
  .ui-sheet__x {
    width: 44px;
    height: 44px;
  }
}
.ui-sheet__x:hover {
  background: color-mix(in oklch, var(--theme-dim) 22%, transparent);
}
.ui-sheet__x:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
</style>

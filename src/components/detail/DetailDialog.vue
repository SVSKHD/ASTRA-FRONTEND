<script setup lang="ts">
// The shared detail-dialog shell (section 18a). Presentational and store-free:
// it owns the surface, the focus trap, the dirty guard and the mobile drag, and
// nothing about tasks or goals. Both bodies mount into its default slot.
//
// Desktop is a centred glass panel with a sticky header and footer around an
// internally-scrolling body; mobile is a bottom sheet the thumb can drag between
// two snap points or fling away. They are the same component because everything
// above — the escape hatch, the trap, the confirmation — must behave identically
// whichever one the reader is looking at.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { clampOffset, offsetFor, snapFor, velocityOf, type SheetSnap } from '@/utils/sheetSnap'
import {
  SPLIT_DEFAULT,
  SPLIT_MAX,
  SPLIT_MIN,
  columnTemplate,
  panelWidth,
  splitFromDrag,
  type NoteColumnMode,
} from '@/utils/noteColumn'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    // Unsaved edits: closing asks first rather than dropping them.
    dirty?: boolean
    mobile?: boolean
    canGoBack?: boolean
    backLabel?: string
    hasPrev?: boolean
    hasNext?: boolean
    // The note extension (section 21b). `aside` is what the second column
    // holds; the shell only knows there is one, how wide it is, and what to
    // call it.
    aside?: boolean
    // Computed by the host from the viewport, because the shell stays
    // store-free and a phone is not a narrow desktop (see noteColumnMode).
    asideMode?: NoteColumnMode
    asideTitle?: string
    split?: number
  }>(),
  {
    dirty: false,
    mobile: false,
    canGoBack: false,
    backLabel: 'Back',
    hasPrev: false,
    hasNext: false,
    aside: false,
    asideMode: 'split',
    asideTitle: 'Note',
    split: SPLIT_DEFAULT,
  },
)
const emit = defineEmits<{
  close: []
  discard: []
  back: []
  prev: []
  next: []
  'close-aside': []
  'update:split': [number]
}>()

const titleId = `detail-title-${useId()}`
const panel = ref<HTMLElement | null>(null)
const sheet = ref<HTMLElement | null>(null)
// The phone's note sheet is a sibling of the panel, so the focus trap has to
// know about it or Tab would walk out of the dialog into the page behind.
const asidePanel = ref<HTMLElement | null>(null)
let restoreTo: HTMLElement | null = null

// --- the dirty guard --------------------------------------------------------
// Inline rather than window.confirm: a native dialog would drop the reader out
// of the sheet on mobile, and there is no reason a "you have unsaved edits"
// question cannot be answered inside the surface that raised it.
const confirming = ref(false)

function requestClose() {
  if (props.dirty) {
    confirming.value = true
    return
  }
  emit('close')
}
// Deliberately NOT `close`: closing flushes what is in flight, and the whole
// point of this answer is that the reader does not want it written.
function discard() {
  confirming.value = false
  emit('discard')
}
function keepEditing() {
  confirming.value = false
}
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) confirming.value = false
  },
)

// --- focus ------------------------------------------------------------------
// Focus moves into the panel on open and returns to the row that opened it on
// close, so a keyboard reader lands back where they were rather than at the top
// of the document.
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      restoreTo = document.activeElement as HTMLElement
      await nextTick()
      panel.value?.focus()
    } else {
      restoreTo?.focus?.()
      restoreTo = null
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => restoreTo?.focus?.())

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function trapTab(event: KeyboardEvent) {
  const roots = [panel.value, asidePanel.value].filter((el): el is HTMLElement => !!el)
  if (!roots.length) return
  const items = roots
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)))
    // A slide-over hides the main column with display:none, which is what
    // takes its controls out of the tab order too.
    .filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // Esc inside a field reverts that field (the body handles it and stops the
    // event); reaching here means no field claimed it, so it closes the dialog.
    event.preventDefault()
    if (confirming.value) {
      keepEditing()
      return
    }
    requestClose()
    return
  }
  if (event.key === 'Tab') {
    trapTab(event)
    return
  }
  // j/k step through the list behind — but only when the reader is not typing,
  // where they are just letters.
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'j' && props.hasNext) {
    event.preventDefault()
    emit('next')
  } else if (event.key === 'k' && props.hasPrev) {
    event.preventDefault()
    emit('prev')
  }
}

// --- body scroll lock (acceptance 90) ---------------------------------------
// Without this the page behind scrolls under a mobile sheet, which reads as the
// sheet itself refusing to move.
let previousOverflow = ''
function lockScroll(on: boolean) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (on) {
    previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
  } else {
    body.style.overflow = previousOverflow
  }
}
watch(() => props.open, lockScroll, { immediate: true })
onBeforeUnmount(() => lockScroll(false))

// --- mobile drag ------------------------------------------------------------
const snap = ref<SheetSnap>('full')
const offset = ref(0)
const dragging = ref(false)
let startY = 0
let startOffset = 0
let lastY = 0
let lastAt = 0
let velocity = 0
let sheetHeight = 0

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      snap.value = 'full'
      offset.value = 0
      dragging.value = false
    }
  },
)

function onDragStart(event: PointerEvent) {
  if (!props.mobile) return
  sheetHeight = sheet.value?.offsetHeight || 0
  dragging.value = true
  startY = event.clientY
  lastY = event.clientY
  lastAt = event.timeStamp
  velocity = 0
  startOffset = offset.value
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}
function onDragMove(event: PointerEvent) {
  if (!dragging.value) return
  velocity = velocityOf(event.clientY - lastY, event.timeStamp - lastAt)
  lastY = event.clientY
  lastAt = event.timeStamp
  offset.value = clampOffset(startOffset + (event.clientY - startY), sheetHeight)
}
function onDragEnd() {
  if (!dragging.value) return
  dragging.value = false
  const landing = snapFor(offset.value, sheetHeight, velocity)
  if (landing === 'dismiss') {
    // A drag away is an intentional dismissal, so it still respects unsaved
    // edits — the sheet returns to full and asks.
    offset.value = 0
    snap.value = 'full'
    requestClose()
    return
  }
  snap.value = landing
  offset.value = offsetFor(landing, sheetHeight)
}

const sheetStyle = computed(() =>
  props.mobile
    ? {
        transform: `translateY(${offset.value}px)`,
        transition: dragging.value
          ? 'none'
          : 'transform var(--dur-med, .24s) var(--ease-out, ease)',
      }
    : undefined,
)

// --- the note extension column (section 21b) --------------------------------
// Two columns side by side on a wide screen, a slide-over on a narrow one, its
// own sheet on a phone. The panel grows into the second column rather than the
// second column being squeezed out of the first.
const splitting = ref(false)
let splitStart = 0
let splitStartPct = SPLIT_DEFAULT

const twoColumn = computed(() => props.aside && props.asideMode === 'split')
const slideOver = computed(() => props.aside && props.asideMode === 'over')
const asideSheet = computed(() => props.aside && props.asideMode === 'sheet')

const panelStyle = computed(() => {
  if (props.mobile) return sheetStyle.value
  // A custom property rather than the width itself: the `min(94vw, …)` that
  // keeps the panel inside a small window belongs in the stylesheet, and only
  // the one number it is capped at changes here.
  return { '--detail-w': `${panelWidth(props.aside, props.asideMode)}px` }
})
const columnsStyle = computed(() => ({
  gridTemplateColumns: columnTemplate(props.aside, props.asideMode, props.split),
}))

function onSplitStart(event: PointerEvent) {
  splitting.value = true
  splitStart = event.clientX
  splitStartPct = props.split
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}
function onSplitMove(event: PointerEvent) {
  if (!splitting.value) return
  const width = panel.value?.offsetWidth || 0
  emit('update:split', splitFromDrag(splitStartPct, event.clientX - splitStart, width))
}
function onSplitEnd() {
  splitting.value = false
}
// The divider is a real control, so it moves from the keyboard too — dragging
// is not the only way anybody sets a width.
function onSplitKey(event: KeyboardEvent) {
  const step = event.shiftKey ? 10 : 2
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('update:split', props.split - step)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('update:split', props.split + step)
  }
}

// Esc from anywhere in the document while open, so a click on the scrim area
// (which holds no focus) still leaves the keyboard path working.
function onDocumentKey(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key !== 'Escape') return
  if (panel.value?.contains(event.target as Node)) return
  if (asidePanel.value?.contains(event.target as Node)) return
  event.preventDefault()
  requestClose()
}
onMounted(() => document.addEventListener('keydown', onDocumentKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKey))
</script>

<template>
  <template v-if="open">
    <div class="detail__scrim" data-testid="detail-scrim" @click="requestClose()"></div>
    <div
      ref="panel"
      class="detail"
      :class="mobile ? 'detail--sheet' : 'detail--modal'"
      :style="panelStyle"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <div ref="sheet" class="detail__inner">
        <div
          v-if="mobile"
          class="detail__grip"
          data-testid="detail-grip"
          aria-hidden="true"
          @pointerdown="onDragStart"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <span class="detail__gripbar"></span>
        </div>

        <div class="detail__columns" :style="columnsStyle">
          <!-- The main column. It stays mounted under a slide-over rather than
               being torn down, so coming back lands on the same scroll
               position with the same body already loaded. -->
          <section class="detail__col" :class="{ 'detail__col--hidden': slideOver }">
            <header class="detail__head">
              <button
                v-if="canGoBack"
                type="button"
                class="detail__icon"
                :aria-label="backLabel"
                :title="backLabel"
                @click="emit('back')"
              >
                ‹
              </button>
              <!-- The dialog's accessible name is always the plain title text. The
               visible title is a slot because both bodies put an inline-editable
               input there, and an input makes a poor label for its own dialog. -->
              <h2 :id="titleId" class="detail__srtitle">{{ title }}</h2>
              <div class="detail__title">
                <slot name="title">{{ title }}</slot>
              </div>
              <div class="detail__headslot"><slot name="header" /></div>
              <button
                type="button"
                class="detail__icon"
                aria-label="Previous"
                title="Previous (k)"
                :disabled="!hasPrev"
                @click="emit('prev')"
              >
                ↑
              </button>
              <button
                type="button"
                class="detail__icon"
                aria-label="Next"
                title="Next (j)"
                :disabled="!hasNext"
                @click="emit('next')"
              >
                ↓
              </button>
              <button type="button" class="detail__icon" aria-label="Close" @click="requestClose()">
                ×
              </button>
            </header>

            <div class="detail__body"><slot /></div>

            <footer v-if="$slots.footer" class="detail__foot"><slot name="footer" /></footer>
          </section>

          <!-- A track of the grid, not something laid over the seam: the
               dialog holds no absolutely positioned control (section 21c). -->
          <div
            v-if="twoColumn"
            class="detail__divider"
            :class="{ 'detail__divider--live': splitting }"
            data-testid="detail-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize note column"
            :aria-valuenow="split"
            :aria-valuemin="SPLIT_MIN"
            :aria-valuemax="SPLIT_MAX"
            tabindex="0"
            @pointerdown="onSplitStart"
            @pointermove="onSplitMove"
            @pointerup="onSplitEnd"
            @pointercancel="onSplitEnd"
            @keydown="onSplitKey"
          >
            <span class="detail__dividerbar"></span>
          </div>

          <section v-if="aside && !asideSheet" class="detail__col detail__col--aside">
            <header class="detail__head">
              <!-- The back arrow belongs to the slide-over, where the note is
                   covering the thing it is attached to. Side by side there is
                   nothing to go back to. -->
              <button
                v-if="slideOver"
                type="button"
                class="detail__icon"
                aria-label="Back to details"
                @click="emit('close-aside')"
              >
                ‹
              </button>
              <div class="detail__title detail__title--aside">
                <slot name="aside-title">{{ asideTitle }}</slot>
              </div>
              <button
                type="button"
                class="detail__icon"
                aria-label="Close note"
                @click="emit('close-aside')"
              >
                ×
              </button>
            </header>
            <div class="detail__body"><slot name="aside" /></div>
          </section>
        </div>

        <div
          v-if="confirming"
          class="detail__confirm"
          role="alertdialog"
          aria-label="Unsaved edits"
        >
          <p class="detail__confirmtext">This has edits that have not been saved yet.</p>
          <div class="detail__confirmrow">
            <button type="button" class="detail__btn" @click="keepEditing">Keep editing</button>
            <button type="button" class="detail__btn detail__btn--danger" @click="discard">
              Discard and close
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- On a phone the note is its own sheet above the dialog's, never two
         half-width columns (acceptance 108). It is a sibling rather than a
         child because it covers the sheet it came from. -->
    <div
      v-if="asideSheet"
      ref="asidePanel"
      class="detail detail--sheet detail--aside"
      role="dialog"
      aria-modal="true"
      :aria-label="asideTitle"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <div class="detail__inner">
        <header class="detail__head">
          <button
            type="button"
            class="detail__icon"
            aria-label="Back to details"
            @click="emit('close-aside')"
          >
            ‹
          </button>
          <div class="detail__title detail__title--aside">
            <slot name="aside-title">{{ asideTitle }}</slot>
          </div>
          <button
            type="button"
            class="detail__icon"
            aria-label="Close note"
            @click="emit('close-aside')"
          >
            ×
          </button>
        </header>
        <div class="detail__body"><slot name="aside" /></div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.detail__scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in oklch, var(--glass-solid) 62%, transparent);
}
.detail {
  position: fixed;
  z-index: 61;
  color: var(--theme-text);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  box-shadow: var(--elev-1);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .detail {
    background: var(--glass-solid);
  }
}
.detail--modal {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  /* --detail-w is set inline: 720px for one column, 1180px for two. */
  width: min(94vw, var(--detail-w, 720px));
  max-height: 85vh;
  border-radius: var(--radius-xl);
  animation: detailIn var(--dur-med) var(--spring) both;
  /* The dialog grows a column rather than a second dialog appearing
     (section 21b). 200ms is long enough to read as growth, short enough not
     to be waited on. */
  transition: width 0.2s var(--ease-out, ease);
}
@media (prefers-reduced-motion: reduce) {
  .detail--modal {
    transition: none;
  }
}
/* The phone's note sheet sits above the dialog it came from. */
.detail--aside {
  z-index: 62;
}
.detail--sheet {
  inset: auto 0 0 0;
  max-height: 85vh;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  animation: detailUp var(--dur-med) var(--ease-out) both;
}
@keyframes detailIn {
  from {
    opacity: 0;
    transform: translate(-50%, -46%);
  }
}
@keyframes detailUp {
  from {
    transform: translateY(12%);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .detail--modal,
  .detail--sheet {
    animation: none;
  }
}
.detail__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
/* Two columns, or one, or one with the note over it. The divider is the middle
   track (see columnTemplate) — the dialog holds nothing absolutely positioned,
   so nothing here can end up laid over the text (section 21c). */
.detail__columns {
  display: grid;
  flex: 1;
  min-height: 0;
}
.detail__col {
  display: flex;
  flex-direction: column;
  /* Without this a long unbroken line in either column pushes the other one
     off the panel instead of wrapping. */
  min-width: 0;
  min-height: 0;
}
.detail__col--hidden {
  display: none;
}
/* Each column scrolls its own body under its own sticky header. */
.detail__col--aside {
  border-left: 1px solid var(--glass-border);
}
.detail__divider {
  display: grid;
  place-items: center;
  width: 11px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}
.detail__dividerbar {
  width: 1px;
  height: 100%;
  background: var(--glass-border);
}
.detail__divider:hover .detail__dividerbar,
.detail__divider:focus-visible .detail__dividerbar,
.detail__divider--live .detail__dividerbar {
  width: 3px;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
}
.detail__divider:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.detail__grip {
  padding: var(--sp-2) 0;
  display: grid;
  place-items: center;
  cursor: grab;
  touch-action: none;
}
.detail__gripbar {
  width: 40px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--glass-border);
}
/* Sticky so the title and the close button stay reachable however far the body
   scrolls — the point of an internally scrolling dialog. */
.detail__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  /* Top-aligned so the arrows stay beside the title's first line when it
     wraps to two. */
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--glass-border);
  background: inherit;
}
.detail__srtitle {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.detail__title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  /* The title wraps now rather than being clipped (section 20b), so the header
     grows with it instead of hiding the end of a long name. */
  min-height: 0;
}
/* The note column's header is a heading, not the dialog's name — the dialog is
   still named by the item the note is attached to. */
.detail__title--aside {
  font-size: var(--text-md);
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail__headslot {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.detail__icon {
  flex-shrink: 0;
  min-width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-md);
  line-height: 1;
  cursor: pointer;
}
.detail__icon:hover:not(:disabled) {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
}
.detail__icon:disabled {
  opacity: 0.35;
  cursor: default;
}
.detail__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.detail__foot {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--glass-border);
  background: inherit;
}
.detail__confirm {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-top: 1px solid var(--glass-border);
  background: var(--glass-solid);
  border-radius: 0 0 var(--radius-xl) var(--radius-xl);
}
.detail__confirmtext {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.detail__confirmrow {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
.detail__btn {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-sm);
  cursor: pointer;
}
.detail__btn--danger {
  color: var(--theme-danger, oklch(0.64 0.22 25));
  border-color: currentColor;
}
</style>

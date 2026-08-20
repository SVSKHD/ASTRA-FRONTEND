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
  }>(),
  {
    dirty: false,
    mobile: false,
    canGoBack: false,
    backLabel: 'Back',
    hasPrev: false,
    hasNext: false,
  },
)
const emit = defineEmits<{ close: []; discard: []; back: []; prev: []; next: [] }>()

const titleId = `detail-title-${useId()}`
const panel = ref<HTMLElement | null>(null)
const sheet = ref<HTMLElement | null>(null)
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
  const root = panel.value
  if (!root) return
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
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

// Esc from anywhere in the document while open, so a click on the scrim area
// (which holds no focus) still leaves the keyboard path working.
function onDocumentKey(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key !== 'Escape') return
  if (panel.value?.contains(event.target as Node)) return
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
      :style="sheetStyle"
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
  width: min(94vw, 720px);
  max-height: 85vh;
  border-radius: var(--radius-xl);
  animation: detailIn var(--dur-med) var(--spring) both;
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

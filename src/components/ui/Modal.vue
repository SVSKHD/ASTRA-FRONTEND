<script setup lang="ts">
// A centred dialog: scrim, focus trap, Escape, and focus returned to whatever
// opened it. One implementation so every dialog in the app behaves the same.
//
// TELEPORTED TO THE BODY, and that is a correctness fix rather than a tidy-up.
// The panel and its scrim are `position: fixed`, which is only measured against
// the VIEWPORT while no ancestor establishes a containing block for fixed
// descendants — and `backdrop-filter` does establish one, exactly like
// `filter`. The workspace stage carries a `backdrop-filter` and an
// `overflow: hidden`, so a dialog opened from inside a tab was being centred on
// the stage and clipped by it, and its `inset: 0` scrim dimmed the stage rather
// than the screen: the rail and the bars stayed bright behind a modal that was
// supposed to have taken the window.
//
// Teleporting puts both elements outside every one of those ancestors, which is
// the only way `fixed` means what it says.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ open: boolean; title: string; size?: 'sm' | 'md' | 'lg' }>(),
  {
    size: 'md',
  },
)
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
let restoreTo: HTMLElement | null = null

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      restoreTo = document.activeElement as HTMLElement
      await nextTick()
      // NEVER TAKE FOCUS OFF SOMETHING INSIDE THE DIALOG.
      //
      // The panel is focused so the keyboard starts in the dialog rather than
      // behind it. But a dialog whose contents want the cursor in a particular
      // field — the trade form puts it in Entry, which is the only value it does
      // not already know — focuses that field on the same tick. Whichever ran
      // second used to win, and when it was this one the field it stole focus
      // from fired `blur`, marked itself touched, and the dialog opened already
      // showing "Enter the entry price." — an error about not having typed
      // something yet, on a form nobody had touched.
      if (!panel.value?.contains(document.activeElement)) panel.value?.focus()
    } else {
      restoreTo?.focus?.()
      restoreTo = null
    }
  },
)
onBeforeUnmount(() => restoreTo?.focus?.())

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const focusable = panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]',
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- Two transitions, so the scrim and the panel each move their own way:
         the room dims and softens behind, the panel springs up into focus.
         Closing plays both backwards, quicker. -->
    <Transition name="ui-modal-scrim" appear>
      <div v-if="open" class="ui-modal__scrim" @click="emit('close')"></div>
    </Transition>
    <Transition name="ui-modal-pop" appear>
      <div
        v-if="open"
        ref="panel"
        class="ui-modal"
        :class="`ui-modal--${size}`"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header class="ui-modal__head">
          <h2 class="ui-modal__title">{{ title }}</h2>
          <button class="ui-modal__x" type="button" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="ui-modal__body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-modal__foot"><slot name="footer" /></footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-modal__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklch, var(--glass-solid) 60%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.ui-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 51;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-height: 86vh;
  overflow-y: auto;
  padding: var(--sp-5);
  border-radius: var(--radius-xl);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  box-shadow: var(--elev-1);
  color: var(--theme-text);
  /* Stated, because the panel now hangs off <body> rather than off the app
     root and inherits nothing from it. */
  font-family: var(--font-sans);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-modal {
    background: var(--glass-solid);
  }
}
.ui-modal--sm {
  width: min(92vw, 360px);
}
.ui-modal--md {
  width: min(92vw, 520px);
}
.ui-modal--lg {
  width: min(92vw, 760px);
}
/* ---- motion ---------------------------------------------------------------
   In: the scrim fades and its blur deepens; the panel rises from a little
   below and a little smaller, out of a soft blur, on a spring — then its
   header, body and footer settle in one after another. Out: the same, faster,
   so closing never feels like waiting. */
.ui-modal-scrim-enter-active {
  transition:
    opacity 0.28s ease,
    backdrop-filter 0.28s ease;
}
.ui-modal-scrim-leave-active {
  transition:
    opacity 0.18s ease,
    backdrop-filter 0.18s ease;
}
.ui-modal-scrim-enter-from,
.ui-modal-scrim-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
  -webkit-backdrop-filter: blur(0);
}
.ui-modal-pop-enter-active {
  transition:
    opacity 0.26s ease,
    transform 0.42s var(--ease-spring),
    filter 0.3s ease;
}
.ui-modal-pop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.18s ease-in,
    filter 0.16s ease;
}
.ui-modal-pop-enter-from {
  opacity: 0;
  transform: translate(-50%, -44%) scale(0.94);
  filter: blur(6px);
}
.ui-modal-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.97);
  filter: blur(3px);
}
.ui-modal-pop-enter-active .ui-modal__head,
.ui-modal-pop-enter-active .ui-modal__body,
.ui-modal-pop-enter-active .ui-modal__foot {
  animation: uiModalPart 0.38s var(--ease-out) both;
}
.ui-modal-pop-enter-active .ui-modal__body {
  animation-delay: 0.06s;
}
.ui-modal-pop-enter-active .ui-modal__foot {
  animation-delay: 0.12s;
}
@keyframes uiModalPart {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-modal-pop-enter-active,
  .ui-modal-pop-leave-active {
    transition: opacity 0.15s ease;
  }
  .ui-modal-pop-enter-from,
  .ui-modal-pop-leave-to {
    transform: translate(-50%, -50%);
    filter: none;
  }
  .ui-modal-pop-enter-active .ui-modal__head,
  .ui-modal-pop-enter-active .ui-modal__body,
  .ui-modal-pop-enter-active .ui-modal__foot {
    animation: none;
  }
}
.ui-modal__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-modal__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-lg);
}
.ui-modal__x {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-lg);
  cursor: pointer;
  line-height: 1;
  transition:
    transform 0.25s var(--ease-spring),
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
/* The close × turns a quarter as it is offered. */
.ui-modal__x:hover,
.ui-modal__x:focus-visible {
  transform: rotate(90deg);
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
}
.ui-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>

<script setup lang="ts">
// A centred dialog: scrim, focus trap, Escape, and focus returned to whatever
// opened it. One implementation so every dialog in the app behaves the same.
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
      panel.value?.focus()
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
  <template v-if="open">
    <div class="ui-modal__scrim" @click="emit('close')"></div>
    <div
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
  </template>
</template>

<style scoped>
.ui-modal__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklch, var(--glass-solid) 60%, transparent);
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
  animation: uiModalIn var(--dur-med) var(--spring) both;
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
@keyframes uiModalIn {
  from {
    opacity: 0;
    transform: translate(-50%, -46%);
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
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-lg);
  cursor: pointer;
  line-height: 1;
}
.ui-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>

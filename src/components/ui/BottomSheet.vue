<script setup lang="ts">
// The mobile counterpart to Modal: same semantics, thumb-reachable.
import { computed, ref } from 'vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
void props
const sheetHeight = ref(360)
const resizeStart = ref<{ pointer: number; height: number } | null>(null)
const sheetStyle = computed(() => ({ height: `${sheetHeight.value}px` }))

function clampHeight(height: number): number {
  return Math.max(220, Math.min(Math.min(760, window.innerHeight * 0.86), height))
}

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
</template>

<style scoped>
.ui-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklch, var(--glass-solid) 42%, transparent);
}
.ui-sheet {
  position: fixed;
  inset: auto var(--sp-3) var(--sp-3) var(--sp-3);
  z-index: 51;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 220px;
  max-height: 86vh;
  overflow-y: auto;
  padding: var(--sp-3) var(--sp-4) var(--sp-5);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--theme-text);
  animation: uiSheetIn var(--dur-med) var(--ease-out) both;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-sheet {
    background: var(--glass-solid);
  }
}
@keyframes uiSheetIn {
  from {
    transform: translateY(14%);
    opacity: 0;
  }
}
.ui-sheet__grip {
  width: 36px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--glass-border);
  margin: 0 auto;
  cursor: ns-resize;
  touch-action: none;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.ui-sheet__grip:hover,
.ui-sheet__grip:focus-visible {
  background: var(--theme-accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent) 50%, transparent);
  outline: none;
}
.ui-sheet__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-sheet__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-md);
}
.ui-sheet__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-lg);
  cursor: pointer;
  line-height: 1;
}
</style>

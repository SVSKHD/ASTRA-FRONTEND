<script setup lang="ts">
// A side drawer for secondary flows that should not take the whole screen.
//
// Two widths, because the two things a drawer holds are different shapes: a
// short form fits in 380px, and a reference table does not. `lg` is still a
// drawer rather than a modal — it stays attached to the edge and leaves the
// page it came from visible beside it.
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    side?: 'left' | 'right'
    size?: 'md' | 'lg'
  }>(),
  {
    side: 'right',
    size: 'md',
  },
)
const emit = defineEmits<{ close: [] }>()

const drawerWidth = ref(props.size === 'lg' ? 560 : 380)
const resizeStart = ref<{ pointer: number; width: number } | null>(null)
const drawerStyle = computed(() => ({ width: `${drawerWidth.value}px` }))

function clampWidth(width: number): number {
  const max = Math.min(props.size === 'lg' ? 720 : 560, window.innerWidth - 32)
  return Math.max(280, Math.min(max, width))
}

function beginResize(event: PointerEvent): void {
  resizeStart.value = { pointer: event.clientX, width: drawerWidth.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function resize(event: PointerEvent): void {
  if (!resizeStart.value) return
  const delta = event.clientX - resizeStart.value.pointer
  drawerWidth.value = clampWidth(
    resizeStart.value.width + (props.side === 'left' ? delta : -delta),
  )
}

function endResize(): void {
  resizeStart.value = null
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (!direction) return
  event.preventDefault()
  drawerWidth.value = clampWidth(drawerWidth.value + direction * (props.side === 'left' ? 24 : -24))
}
</script>

<template>
  <template v-if="open">
    <div class="ui-drawer__scrim" @click="emit('close')"></div>
    <aside
      class="ui-drawer"
      :class="[`ui-drawer--${side}`, `ui-drawer--${size}`]"
      :style="drawerStyle"
      role="dialog"
      aria-modal="true"
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
        <button class="ui-drawer__x" type="button" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>
      <div class="ui-drawer__body"><slot /></div>
    </aside>
  </template>
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
  overflow-y: auto;
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
.ui-drawer--right {
  right: var(--sp-3);
  animation: uiDrawerR var(--dur-med) var(--ease-out) both;
}
.ui-drawer--left {
  left: var(--sp-3);
  animation: uiDrawerL var(--dur-med) var(--ease-out) both;
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
  transition: background 0.2s ease, box-shadow 0.2s ease;
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
@keyframes uiDrawerR {
  from {
    transform: translateX(12%);
    opacity: 0;
  }
}
@keyframes uiDrawerL {
  from {
    transform: translateX(-12%);
    opacity: 0;
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
.ui-drawer__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-lg);
  cursor: pointer;
  line-height: 1;
}
</style>

<script setup lang="ts">
// An anchored panel: the shared shell behind Dropdown and any inline surface.
// Closes on outside click and on Escape, so no caller has to remember to.
//
// Portalled to the body, like ListboxPanel and the date picker: a panel
// positioned `absolute` inside its trigger is clipped by the first scrolling
// ancestor — the goal grid cut every card's ⋯ menu in half. Position comes from
// placePopover, so it flips above near the bottom and slides back inside the
// window rather than running off the edge.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { placePopover } from '@/utils/popoverPlace'

const props = withDefaults(defineProps<{ open: boolean; align?: 'start' | 'end' }>(), {
  align: 'start',
})
const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0, maxHeight: 0, placement: 'below' as 'below' | 'above' })

function reposition() {
  const a = root.value
  const el = panel.value
  if (!props.open || !a || !el || typeof window === 'undefined') return
  const box = a.getBoundingClientRect()
  // offset*, not the bounding rect: the pop-in animation scales the panel, and
  // the rect would measure it at 95%.
  const own = { width: el.offsetWidth, height: el.offsetHeight }
  // `end` lines the panel's right edge up with the trigger's; placePopover only
  // knows left-alignment, so it is handed an anchor already shifted across.
  const left = props.align === 'end' ? box.right - own.width : box.left
  const placed = placePopover(
    { top: box.top, left, width: box.width, height: box.height },
    { top: 0, left: 0, width: own.width, height: own.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
  pos.value = placed
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    reposition()
  },
)

function onPointer(event: MouseEvent) {
  if (!props.open) return
  const target = event.target as Node
  if (root.value?.contains(target) || panel.value?.contains(target)) return
  emit('close')
}
onMounted(() => {
  document.addEventListener('mousedown', onPointer)
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onPointer)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})
</script>

<template>
  <div ref="root" class="ui-popover" @keydown.esc="emit('close')">
    <slot name="trigger" />
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="ui-popover__panel"
        :class="`is-${pos.placement}`"
        :style="{
          top: `${pos.top}px`,
          left: `${pos.left}px`,
          maxHeight: pos.maxHeight ? `${pos.maxHeight}px` : undefined,
        }"
        @keydown.esc="emit('close')"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ui-popover {
  position: relative;
  display: inline-flex;
}
.ui-popover__panel {
  position: fixed;
  /* Above the detail drawer and dialogs, level with ListboxPanel. */
  z-index: 81;
  min-width: 180px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--sp-2);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  box-shadow: var(--elev-1);
  color: var(--theme-text);
  transform-origin: top center;
  animation: uiPop 0.24s var(--ease-spring) both;
}
.ui-popover__panel.is-above {
  transform-origin: bottom center;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-popover__panel {
    background: var(--glass-solid);
  }
}
@keyframes uiPop {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.95);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-popover__panel {
    animation: none;
  }
}
</style>

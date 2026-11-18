<script setup lang="ts">
// Up/down arrows for a scroller that already exists — the same arrows as
// ScrollSection, for panes that must keep their own element (the AI thread
// follows replies with its own ref). Place it beside the scroller, inside an
// ancestor with `position: relative` (the scroller's offsetParent): the arrows
// line up with the scroller's own edges, an arrow shows only while there is
// more that way, as an indicator (taps pass through to the content). Give the scroller the
// global `scroll-arrows-target` class (style.css) to hide its own bar.
import { onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ target: HTMLElement | null }>()

const above = ref(false)
const below = ref(false)
// Where the scroller sits in the positioned box around it, so the arrows sit on
// its edges without a wrapper element.
const box = ref({ top: 0, bottom: 0, center: 0 })
let frame: number | undefined
let ro: ResizeObserver | undefined
let mo: MutationObserver | undefined
let el: HTMLElement | null = null

function update() {
  if (!el) {
    above.value = below.value = false
    return
  }
  const { scrollTop, scrollHeight, clientHeight } = el
  above.value = scrollTop > 1
  below.value = scrollTop + clientHeight < scrollHeight - 1
  box.value = {
    top: el.offsetTop + 6,
    bottom: el.offsetTop + clientHeight - 34,
    center: el.offsetLeft + el.clientWidth / 2,
  }
}
function schedule() {
  if (frame != null) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    update()
  })
}
function detach() {
  el?.removeEventListener('scroll', schedule)
  ro?.disconnect()
  mo?.disconnect()
  el = null
}
function attach(next: HTMLElement | null) {
  detach()
  el = next
  if (!el) return update()
  el.addEventListener('scroll', schedule, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(schedule)
    ro.observe(el)
  }
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(schedule)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
  }
  update()
}
watch(() => props.target, attach, { immediate: true })
onBeforeUnmount(() => {
  detach()
  if (frame != null) cancelAnimationFrame(frame)
})
</script>

<template>
  <span
    v-if="above"
    aria-hidden="true"
    class="scroll-arrows scroll-arrows--up"
    :style="{ top: box.top + 'px', left: box.center + 'px' }"
  >
    <Icon name="chevron-down" size="sm" />
  </span>
  <span
    v-if="below"
    aria-hidden="true"
    class="scroll-arrows scroll-arrows--down"
    :style="{ top: box.bottom + 'px', left: box.center + 'px' }"
  >
    <Icon name="chevron-down" size="sm" />
  </span>
</template>

<style scoped>
.scroll-arrows {
  position: absolute;
  left: 50%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border, var(--glass-border));
  background: var(--surface-overlay, var(--theme-card));
  color: var(--accent, var(--theme-accent));
  box-shadow: var(--layer-raised-shadow, none);
  pointer-events: none;
  opacity: 0.75;
  transition: opacity 0.15s ease;
}
.scroll-arrows--up {
  transform: translateX(-50%) rotate(180deg);
}
.scroll-arrows--down {
  transform: translateX(-50%);
}
</style>

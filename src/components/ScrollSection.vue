<script setup lang="ts">
// A capped-height section that scrolls on its own with no scrollbar. Where
// there is more to see above or below, a small arrow sits on that edge as an
// indicator: it takes no taps, scrolling is by wheel, touch and keyboard. A list that fits shows no arrows.
//
// Scroll moves the edges; a resize or a change of content (a row arriving, a
// subtree opening) can too, so both are watched — the same as v-scroll-fade.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'

// Class and style go on the scrolling body, not the wrapper the arrows sit in.
defineOptions({ inheritAttrs: false })
defineProps<{ label: string }>()

const scroller = ref<HTMLElement | null>(null)
const above = ref(false)
const below = ref(false)
let frame: number | undefined
let ro: ResizeObserver | undefined
let mo: MutationObserver | undefined

function update() {
  const el = scroller.value
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  above.value = scrollTop > 1
  below.value = scrollTop + clientHeight < scrollHeight - 1
}
function schedule() {
  if (frame != null) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    update()
  })
}

onMounted(() => {
  const el = scroller.value
  if (!el) return
  el.addEventListener('scroll', schedule, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(schedule)
    ro.observe(el)
  }
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(schedule)
    mo.observe(el, { childList: true, subtree: true })
  }
  update()
})
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('scroll', schedule)
  ro?.disconnect()
  mo?.disconnect()
  if (frame != null) cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="scroll-section">
    <div
      ref="scroller"
      class="scroll-section__body"
      role="region"
      :aria-label="label"
      tabindex="0"
      data-own-keys
      v-bind="$attrs"
    >
      <slot />
    </div>
    <span v-if="above" aria-hidden="true" class="scroll-section__arrow scroll-section__arrow--up">
      <Icon name="chevron-down" size="sm" />
    </span>
    <span v-if="below" aria-hidden="true" class="scroll-section__arrow scroll-section__arrow--down">
      <Icon name="chevron-down" size="sm" />
    </span>
  </div>
</template>

<style scoped>
.scroll-section {
  position: relative;
}
.scroll-section__body {
  max-height: min(45dvh, 420px);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  /* No scrollbar: the arrows say there is more. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scroll-section__body::-webkit-scrollbar {
  display: none;
}
/* When the body is a flex column (Unpinned passes one), a child with
   `overflow: hidden` — CarriedOverGroup, CompletedSection — has a minimum
   height of 0 and shrinks to fit the capped height, clipping its own rows.
   Then nothing overflows and the section has nothing to scroll. Children keep
   their full height so the body is what scrolls. */
:slotted(*) {
  flex-shrink: 0;
}
.scroll-section__arrow {
  position: absolute;
  left: 50%;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface-overlay);
  color: var(--accent);
  box-shadow: var(--layer-raised-shadow, none);
  pointer-events: none;
  opacity: 0.75;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.scroll-section__arrow--up {
  top: 4px;
  transform: translateX(-50%) rotate(180deg);
}
.scroll-section__arrow--down {
  bottom: 4px;
  transform: translateX(-50%);
}
</style>

<script setup lang="ts">
// A todo's checkbox with its subtask progress drawn round it (Todo v2, 4b).
// In the library rather than beside the todo list because the /ui page shows
// it, and because the ring is the one place the whole app draws progress round
// a control.
//
// It replaces the "☑ 3/35" chip as the at-a-glance progress: the ring fills as
// subtasks close, so a scan down the list reads progress without reading
// numbers. The button inside is the todo's own done state, and its pop on click
// is the first beat of the completion sequence (4a) — the strike and the
// progress bar follow on their own delays.
import { computed, onBeforeUnmount, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { checkTick } from '@/styles'

const props = withDefaults(
  defineProps<{
    done: boolean
    subDone: number
    subTotal: number
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' },
)
const emit = defineEmits<{ toggle: [] }>()

const pct = computed(() => (props.subTotal ? (props.subDone / props.subTotal) * 100 : 0))
// Drawn in SVG, in a viewBox the same size as the box in CSS pixels, so every
// circle shares one exact centre and its strokes are real geometry rather than
// the soft, off-centre edges a CSS mask and a fractional border gave.
const geo = computed(() => {
  const [box, ringW, gap, dotW] = props.size === 'sm' ? [26, 2.5, 1.5, 1.5] : [30, 3, 2, 1.5]
  const c = box / 2
  return {
    box,
    c,
    ringW,
    dotW,
    ringR: c - ringW / 2,
    dotR: c - ringW - gap - dotW / 2,
  }
})
const title = computed(() =>
  props.subTotal ? `${props.subDone} of ${props.subTotal} subtasks done` : 'No subtasks',
)

const popping = ref(false)
let popTimer: ReturnType<typeof setTimeout> | undefined
function onClick() {
  popping.value = true
  clearTimeout(popTimer)
  popTimer = setTimeout(() => (popping.value = false), 180)
  emit('toggle')
}
onBeforeUnmount(() => clearTimeout(popTimer))
</script>

<template>
  <span
    class="ring-wrap"
    :class="[`ring-wrap--${size}`, { 'is-done': done, 'is-pop': popping }]"
    :title="title"
  >
    <svg
      class="ring"
      :viewBox="`0 0 ${geo.box} ${geo.box}`"
      :width="geo.box"
      :height="geo.box"
      aria-hidden="true"
    >
      <circle
        class="ring__track"
        :class="{ 'ring__track--empty': !subTotal }"
        :cx="geo.c"
        :cy="geo.c"
        :r="geo.ringR"
        :stroke-width="geo.ringW"
      />
      <circle
        v-if="subTotal"
        class="ring__arc"
        :cx="geo.c"
        :cy="geo.c"
        :r="geo.ringR"
        :stroke-width="geo.ringW"
        pathLength="100"
        :stroke-dasharray="`${pct} 100`"
        :transform="`rotate(-90 ${geo.c} ${geo.c})`"
      />
      <circle
        class="ring__dot"
        :cx="geo.c"
        :cy="geo.c"
        :r="geo.dotR"
        :stroke-width="geo.dotW"
      />
    </svg>
    <button
      type="button"
      class="ring__btn"
      :aria-label="done ? 'Mark not done' : 'Mark done'"
      :aria-pressed="done"
      @pointerdown.stop
      @click.stop="onClick"
    >
      <Icon name="check" size="xs" class="ring__tick" :style="checkTick" />
    </button>
  </span>
</template>

<style scoped>
/* Three concentric bands, outermost first, read by anyone scanning the list:
     ring — the progress. An arc on a track that is always visible, so a 26%
            arc reads as 26% of a circle rather than as a stray curve.
     gap  — the row's own background, so the ring and the checkbox never
            touch and blend into one "target" shape.
     dot  — the todo's done state, with an outline quiet enough that the
            accent arc is the loudest thing in the box.
   All three are circles in one SVG with one centre; the button is a
   transparent hit area laid over the dot, carrying only the tick. */
.ring-wrap {
  position: relative;
  flex-shrink: 0;
  display: block;
}
.ring-wrap--md {
  width: 30px;
  height: 30px;
}
.ring-wrap--sm {
  width: 26px;
  height: 26px;
}
.ring {
  position: absolute;
  inset: 0;
  display: block;
  overflow: visible;
}
.ring circle {
  fill: none;
}
.ring__track {
  stroke: color-mix(in srgb, var(--theme-text) 16%, transparent);
}
.ring__track--empty {
  stroke: color-mix(in srgb, var(--theme-text) 10%, transparent);
}
.ring__arc {
  stroke: var(--theme-accent);
  transition: stroke-dasharray var(--dur-pop) ease;
}
.ring .ring__dot {
  stroke: color-mix(in srgb, var(--theme-text) 38%, transparent);
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(1);
  transition:
    transform var(--dur-pop) var(--ease-pop),
    fill var(--dur-med) ease,
    stroke var(--dur-med) ease;
}
.ring-wrap.is-done .ring__dot {
  fill: var(--theme-accent);
  stroke: var(--theme-accent);
}
.ring__btn {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--theme-on-accent);
  cursor: pointer;
  transform: scale(1);
  transition: transform var(--dur-pop) var(--ease-pop);
}
.ring-wrap.is-pop .ring__dot,
.ring-wrap.is-pop .ring__btn {
  transform: scale(1.22);
}
.ring__tick {
  opacity: 0;
  transition: opacity var(--dur-med) ease 100ms;
}
.ring-wrap.is-done .ring__tick {
  opacity: 1;
}
.ring__btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .ring__arc,
  .ring__dot,
  .ring__btn,
  .ring__tick {
    transition: none;
  }
  .ring-wrap.is-pop .ring__dot,
  .ring-wrap.is-pop .ring__btn {
    transform: none;
  }
}
</style>

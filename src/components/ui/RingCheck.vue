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
    :class="[`ring-wrap--${size}`]"
    :style="{ '--ring-pct': pct + '%' }"
    :title="title"
  >
    <span class="ring" :class="{ 'ring--empty': !subTotal }" aria-hidden="true"></span>
    <button
      type="button"
      class="ring__btn"
      :class="{ 'is-done': done, 'is-pop': popping }"
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
/* The ring is an annulus: a conic gradient with its centre masked out, so the
   2px gap between ring and button is the row's own background whatever that
   is — a glass card, the phone's solid ground, the /ui page — rather than a
   painted disc that has to be told which colour to pretend to be. */
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
  border-radius: 50%;
  background: conic-gradient(
    var(--theme-accent) var(--ring-pct),
    color-mix(in srgb, var(--theme-text) 12%, transparent) var(--ring-pct) 100%
  );
  /* `closest-side`, so 100% is the ring's own radius. Left at the default
     (farthest corner) the percentages measure to the box's corner, the hole
     comes out 8px instead of 12px, and the arc runs under the button. */
  -webkit-mask: radial-gradient(
    circle closest-side,
    transparent calc(100% - 3px),
    black calc(100% - 2px)
  );
  mask: radial-gradient(circle closest-side, transparent calc(100% - 3px), black calc(100% - 2px));
  transition: background var(--dur-pop) ease;
}
.ring--empty {
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
}
/* The button is a sibling of the ring, not a child: a mask clips everything
   inside the element it is on, so the button sits on top in the same box. */
.ring__btn {
  position: absolute;
  inset: 3px;
  width: auto;
  height: auto;
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--theme-text) 45%, transparent);
  background: transparent;
  color: var(--theme-on-accent);
  cursor: pointer;
  transform: scale(1);
  transition:
    transform var(--dur-pop) var(--ease-pop),
    background var(--dur-med) ease,
    border-color var(--dur-med) ease;
}
.ring__btn.is-done {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.ring__btn.is-pop {
  transform: scale(1.22);
}
.ring__tick {
  opacity: 0;
  transition: opacity var(--dur-med) ease 100ms;
}
.ring__btn.is-done .ring__tick {
  opacity: 1;
}
.ring__btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .ring,
  .ring__btn,
  .ring__tick {
    transition: none;
  }
  .ring__btn.is-pop {
    transform: none;
  }
}
</style>

<script setup lang="ts">
// A todo's checkbox with its subtask progress drawn round it (Todo v2, 4b).
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
    /** The surface the ring sits on, so the gap between ring and button reads
     *  as a gap rather than as a second ring. */
    surface?: string
    size?: 'sm' | 'md'
  }>(),
  { surface: 'var(--theme-card)', size: 'md' },
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
    class="ring"
    :class="[`ring--${size}`, { 'ring--empty': !subTotal }]"
    :style="{ '--ring-pct': pct + '%', '--ring-surface': surface }"
    :title="title"
  >
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
.ring {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(
    var(--theme-accent) var(--ring-pct),
    color-mix(in srgb, var(--theme-text) 12%, transparent) var(--ring-pct) 100%
  );
  transition: background 0.4s ease;
}
.ring--md {
  width: 30px;
  height: 30px;
}
.ring--sm {
  width: 26px;
  height: 26px;
}
.ring--empty {
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
}
.ring__btn {
  position: relative;
  width: calc(100% - 6px);
  height: calc(100% - 6px);
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--theme-text) 45%, transparent);
  background: var(--ring-surface);
  box-shadow: 0 0 0 2px var(--ring-surface);
  color: var(--theme-on-accent);
  cursor: pointer;
  transform: scale(1);
  transition:
    transform 0.4s cubic-bezier(0.3, 1.9, 0.5, 1),
    background 0.2s ease,
    border-color 0.2s ease;
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
  transition: opacity 0.2s ease 0.1s;
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

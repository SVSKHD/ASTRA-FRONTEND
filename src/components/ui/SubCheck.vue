<script setup lang="ts">
// A subtask's checkbox (Todo v2, 4a): a rounded square that pops to 1.25 on
// tick and fills with the accent. One component for the three places a subtask
// is ticked — the details pane, the phone sheet and Next up — so the pop, the
// sizes and the focus ring are decided once. `sm` is the 18px desktop box,
// `md` the 20px one a thumb needs.
import { onBeforeUnmount, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { checkTick } from '@/styles'

const props = withDefaults(defineProps<{ done: boolean; size?: 'sm' | 'md' }>(), {
  size: 'sm',
})
const emit = defineEmits<{ toggle: [] }>()

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
  <button
    type="button"
    class="subcheck"
    :class="[`subcheck--${props.size}`, { 'is-done': done, 'is-pop': popping }]"
    :aria-label="done ? 'Mark not done' : 'Mark done'"
    :aria-pressed="done"
    @click.stop="onClick"
  >
    <Icon name="check" size="xs" class="subcheck__tick" :style="checkTick" />
  </button>
</template>

<style scoped>
.subcheck {
  position: relative;
  flex-shrink: 0;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 6px;
  border: 1.5px solid color-mix(in srgb, var(--theme-text) 45%, transparent);
  background: transparent;
  color: var(--theme-on-accent);
  cursor: pointer;
  transform: scale(1);
  transition:
    transform var(--dur-strike) var(--ease-pop),
    background var(--dur-med) ease,
    border-color var(--dur-med) ease;
}
.subcheck--sm {
  width: 18px;
  height: 18px;
}
.subcheck--md {
  width: 20px;
  height: 20px;
}
.subcheck.is-done {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.subcheck.is-pop {
  transform: scale(1.25);
}
.subcheck__tick {
  opacity: 0;
  transition: opacity var(--dur-med) ease 100ms;
}
.subcheck.is-done .subcheck__tick {
  opacity: 1;
}
.subcheck:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .subcheck,
  .subcheck__tick {
    transition: none;
  }
  .subcheck.is-pop {
    transform: none;
  }
}
</style>

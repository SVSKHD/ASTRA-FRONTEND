<script setup lang="ts">
// A text/plain log: monospace, in its own scroll box, showing the tail. The
// box opens scrolled to the bottom, where the failure usually is.
import { computed, nextTick, ref, watch } from 'vue'
import { tail } from '@/control/diff'

const props = withDefaults(
  defineProps<{
    text: string
    max?: number
    label?: string
    /** `tail` (a log: the end, scrolled to the bottom) or `head` (a file: the start). */
    mode?: 'tail' | 'head'
  }>(),
  { max: 3000, label: 'Log', mode: 'tail' },
)
const box = ref<HTMLElement | null>(null)
const view = computed(() => tail(props.text, props.max, props.mode))
const fmt = new Intl.NumberFormat('en-IN')

watch(
  () => props.text,
  async () => {
    await nextTick()
    if (box.value && props.mode === 'tail') box.value.scrollTop = box.value.scrollHeight
  },
  { immediate: true },
)
</script>

<template>
  <div class="cc-log">
    <p v-if="!view.lines.length" class="tp-note">The log is empty.</p>
    <template v-else>
      <p v-if="view.dropped" class="tp-note" role="status">
        Showing the {{ mode === 'tail' ? 'last' : 'first' }}
        {{ fmt.format(view.lines.length) }} lines; {{ fmt.format(view.dropped) }}
        {{ mode === 'tail' ? 'earlier' : 'later' }} lines are left out.
      </p>
      <div ref="box" class="cc-box cc-mono" role="log" :aria-label="label" tabindex="0">
        <p v-for="(l, i) in view.lines" :key="i" class="cc-line">{{ l || ' ' }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cc-log {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
</style>

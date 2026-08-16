<script setup lang="ts">
// Renders a shortcut as keycaps, using the platform's own modifier glyphs — ⌘ on
// a Mac, Ctrl elsewhere — so the hint matches the key the reader will press.
import { computed } from 'vue'

const props = defineProps<{ keys: string }>()
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
const parts = computed(() =>
  props.keys.split('+').map((raw) => {
    const key = raw.trim()
    if (key.toLowerCase() === 'mod') return isMac ? '⌘' : 'Ctrl'
    if (key.toLowerCase() === 'alt') return isMac ? '⌥' : 'Alt'
    if (key.toLowerCase() === 'shift') return '⇧'
    return key
  }),
)
</script>

<template>
  <span class="ui-kbd">
    <kbd v-for="(part, i) in parts" :key="i" class="ui-kbd__cap">{{ part }}</kbd>
  </span>
</template>

<style scoped>
.ui-kbd {
  display: inline-flex;
  gap: 3px;
}
.ui-kbd__cap {
  min-width: 20px;
  padding: 1px var(--sp-1);
  border-radius: 5px;
  border: 1px solid var(--glass-border);
  border-bottom-width: 2px;
  background: var(--theme-input);
  color: var(--theme-dim);
  font-family: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  text-align: center;
}
</style>

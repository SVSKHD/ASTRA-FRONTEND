<script setup lang="ts">
// A create card's sub-items, nested as they will be created: sub-todos under
// their todo, and their own sub-todos under them.
import type { AiSubItem } from '@/utils/ai'

defineOptions({ name: 'AiSubTree' })
defineProps<{ items: AiSubItem[] }>()
</script>

<template>
  <ul class="ai-subtree">
    <li v-for="(s, i) in items" :key="i">
      {{ s.title }}
      <AiSubTree v-if="s.items?.length" :items="s.items" />
    </li>
  </ul>
</template>

<style scoped>
.ai-subtree {
  margin: 4px 0 0;
  padding-left: 1.1em;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>

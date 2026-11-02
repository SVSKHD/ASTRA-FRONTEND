<script setup lang="ts">
// Where a value came from: the broker, a simulation, or our own arithmetic.
// Every figure in the trading panel carries one (Prompt 11, item 9). Neutral
// on purpose: the WORD carries the meaning, so no colour has to.
import { computed } from 'vue'
import { SOURCE_LABEL, type Source } from '@/trading/format'

const props = defineProps<{ source: Source | string }>()
const label = computed(() => SOURCE_LABEL[props.source as Source] ?? String(props.source))
</script>

<template>
  <span class="src-tag" :title="`${label} value`">{{ label }}</span>
</template>

<style scoped>
.src-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: 999px;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  white-space: nowrap;
}
</style>

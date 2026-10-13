<script setup lang="ts">
import { computed } from 'vue'
import { countImportHierarchy } from '@/utils/importHierarchy'
import type { TaskTransferItem } from '@/utils/taskTransfer'
const props = defineProps<{
  items: TaskTransferItem[]
  underParent?: boolean
  noun: string
  existingParentIds?: number[]
}>()
const counts = computed(() =>
  countImportHierarchy(
    props.items,
    props.underParent,
    new Set(props.existingParentIds?.map(String)),
  ),
)
</script>
<template>
  <dl class="import-counts" aria-label="Import hierarchy counts" aria-live="polite">
    <div>
      <dt>Parent {{ noun }}s</dt>
      <dd>{{ counts.parents }}</dd>
    </div>
    <div>
      <dt>Subtasks</dt>
      <dd>{{ counts.subtasks }}</dd>
    </div>
    <div title="Subtasks two or more levels below the parent">
      <dt>Nested subtasks</dt>
      <dd>{{ counts.nested }}</dd>
    </div>
  </dl>
</template>
<style scoped>
.import-counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
  margin: 0;
}
.import-counts > div {
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-card);
}
.import-counts dt {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.import-counts dd {
  margin: var(--sp-1) 0 0;
  color: var(--theme-accent);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
}
</style>

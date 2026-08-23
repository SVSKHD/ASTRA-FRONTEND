<script setup lang="ts">
// The empty state: a glyph, a sentence that says what would be here, and the
// action that creates the first one. An empty list with no call to action is a
// dead end.
defineProps<{ glyph?: string; title: string; description?: string }>()
</script>

<template>
  <div class="ui-empty">
    <span v-if="glyph" class="ui-empty__glyph" aria-hidden="true">{{ glyph }}</span>
    <p class="ui-empty__title">{{ title }}</p>
    <p v-if="description" class="ui-empty__desc">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-6) var(--sp-4);
  text-align: center;
  color: var(--theme-dim);
}
.ui-empty__glyph {
  font-size: var(--text-xl);
  opacity: 0.8;
}
.ui-empty__title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ui-empty__desc {
  margin: 0;
  font-size: var(--text-sm);
  max-width: 40ch;
}
</style>

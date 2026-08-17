<script setup lang="ts">
// Search, with the clear affordance built in — the thing every ad-hoc search box
// forgets.
import { useId } from 'vue'

withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; size?: 'sm' | 'md'; label?: string }>(),
  { placeholder: 'Search…', size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const uid = useId()
</script>

<template>
  <div class="ui-search" :class="`ui-search--${size}`">
    <label v-if="label" class="ui-sr-only" :for="uid">{{ label }}</label>
    <span class="ui-search__glyph" aria-hidden="true">⌕</span>
    <input
      :id="uid"
      class="ui-search__input ui-focus-ring"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="modelValue"
      class="ui-search__clear"
      type="button"
      aria-label="Clear search"
      @click="emit('update:modelValue', '')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.ui-search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  min-width: 0;
}
.ui-search--sm {
  min-height: var(--control-sm);
}
.ui-search--md {
  min-height: var(--control-md);
}
.ui-search:focus-within {
  border-color: var(--theme-accent);
}
.ui-search__glyph {
  color: var(--theme-dim);
}
.ui-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-md);
  font-family: inherit;
}
.ui-search__input:focus {
  outline: none;
}
.ui-search__input::-webkit-search-cancel-button {
  display: none;
}
.ui-search__clear {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  font-size: var(--text-lg);
  line-height: 1;
}
.ui-search__clear:hover {
  color: var(--theme-text);
}
</style>

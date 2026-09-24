<script setup lang="ts">
// Search, with the clear affordance built in — the thing every ad-hoc search box
// forgets.
import { useId } from 'vue'
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    label?: string
    disabled?: boolean
  }>(),
  { placeholder: 'Search…', size: 'lg' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const uid = useId()
</script>

<template>
  <div class="ui-control ui-search" :class="[`ui-control--${size}`, { 'is-disabled': disabled }]">
    <label v-if="label" class="ui-sr-only" :for="uid">{{ label }}</label>
    <span class="ui-search__glyph" aria-hidden="true"><Icon name="search" size="sm" /></span>
    <input
      :id="uid"
      class="ui-control__input ui-search__input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="modelValue"
      class="ui-search__clear"
      type="button"
      aria-label="Clear search"
      @click="emit('update:modelValue', '')"
    >
      <Icon name="x" size="sm" />
    </button>
  </div>
</template>

<style scoped>
/* Everything about the box — border, fill, height, hover, focus ring — comes
   from .ui-control. What is left here is the one thing that is search's own:
   the pill radius, which says "filter" rather than "field". */
.ui-search {
  border-radius: var(--radius-pill);
}
/* Both of these are real icons now, at the set's `sm` step — the size every
   other icon in the app is drawn at — rather than characters taking whatever
   the surrounding font happens to be. */
.ui-search__glyph {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-muted, var(--theme-dim));
}
.ui-search__input::-webkit-search-cancel-button {
  display: none;
}
.ui-search__clear {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-muted, var(--theme-dim));
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  line-height: 1;
}
.ui-search__clear:hover {
  color: var(--text-primary, var(--theme-text));
}
</style>

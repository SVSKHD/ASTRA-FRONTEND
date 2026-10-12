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
  <div class="ui-search" :class="[`ui-control--${size}`, { 'is-disabled': disabled }]">
    <label v-if="label" class="ui-sr-only" :for="uid">{{ label }}</label>
    <span class="ui-search__glyph" aria-hidden="true"
      ><Icon name="search" :size="size === 'lg' ? 'md' : 'sm'"
    /></span>
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
      :disabled="disabled"
      @click="emit('update:modelValue', '')"
    >
      <Icon name="x" size="sm" />
    </button>
  </div>
</template>

<style scoped>
/* Match Quick Add's card, icon tile, spacing and focus treatment. */
.ui-search {
  --search-surface: var(--theme-card);
  --search-line: 42px;
  --search-tile: 38px;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-width: 0;
  padding: 9px 10px 9px 18px;
  border-radius: 22px;
  border: 1.5px solid color-mix(in oklch, var(--theme-text) 6%, transparent);
  background: var(--search-surface);
  color: var(--text-primary, var(--theme-text));
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink) 4%, transparent),
    0 8px 24px -14px color-mix(in srgb, var(--shadow-ink) 16%, transparent);
  transition:
    border-color var(--dur-med) ease,
    box-shadow var(--dur-med) ease;
}
.ui-search.ui-control--sm {
  --search-line: 28px;
  --search-tile: 28px;
}
.ui-search.ui-control--md {
  --search-line: 34px;
  --search-tile: 32px;
}
@supports (color: color(from red srgb r g b / 1)) {
  .ui-search {
    --search-surface: color(from var(--theme-card) srgb r g b / 1);
  }
}
.ui-search:focus-within {
  border-color: color-mix(in oklch, var(--theme-accent) 40%, transparent);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink) 4%, transparent),
    0 8px 24px -14px color-mix(in srgb, var(--shadow-ink) 16%, transparent),
    0 0 0 4px color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
.ui-search.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
.ui-search__glyph {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: var(--search-tile);
  height: var(--search-tile);
  border-radius: 11px;
  background: color-mix(in oklch, var(--theme-accent) 30%, var(--search-surface));
  color: color-mix(in oklch, var(--theme-accent) 88%, var(--theme-text));
}
.ui-search__input {
  height: var(--search-line);
  padding: 0;
  font-size: var(--text-md);
  line-height: var(--lh-md);
}
.ui-search__input::placeholder {
  color: color-mix(in oklch, var(--theme-dim) 85%, var(--theme-accent));
}
.ui-search__input::-webkit-search-cancel-button {
  display: none;
}
.ui-search__clear {
  flex-shrink: 0;
  height: var(--search-line);
  width: var(--search-line);
  border: none;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-accent) 14%, var(--search-surface));
  color: var(--theme-text);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  line-height: 1;
}
.ui-search__clear:hover {
  background: color-mix(in oklch, var(--theme-accent) 24%, var(--search-surface));
}
.ui-search__clear:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .ui-search {
    transition: none;
  }
}
</style>

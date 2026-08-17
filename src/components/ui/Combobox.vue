<script setup lang="ts">
// A text field that filters a list. The input owns the value; the list is a
// suggestion, so a value not in the list is still allowed — which is what makes
// it a combobox rather than a select.
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: string; options: string[]; label?: string; placeholder?: string }>(),
  { placeholder: 'Type to filter…' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
const active = ref(0)
const matches = computed(() => {
  const q = props.modelValue.trim().toLowerCase()
  return props.options.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 8)
})

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
}
function onKey(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % Math.max(1, matches.value.length)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + matches.value.length) % Math.max(1, matches.value.length)
  } else if (event.key === 'Enter' && matches.value[active.value]) {
    event.preventDefault()
    choose(matches.value[active.value])
  } else if (event.key === 'Escape') {
    open.value = false
  }
}
</script>

<template>
  <div class="ui-combo">
    <label v-if="label" class="ui-combo__label">{{ label }}</label>
    <input
      class="ui-combo__input ui-focus-ring"
      role="combobox"
      :aria-expanded="open"
      aria-autocomplete="list"
      :value="modelValue"
      :placeholder="placeholder"
      @focus="open = true"
      @blur="open = false"
      @input="(emit('update:modelValue', ($event.target as HTMLInputElement).value), (open = true))"
      @keydown="onKey"
    />
    <ul v-if="open && matches.length" class="ui-combo__list" role="listbox">
      <li v-for="(match, i) in matches" :key="match" role="option" :aria-selected="i === active">
        <button
          class="ui-combo__option"
          :class="{ 'is-active': i === active }"
          type="button"
          @mousedown.prevent="choose(match)"
        >
          {{ match }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ui-combo {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-combo__label {
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ui-combo__input {
  min-height: var(--control-md);
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--text-md);
  font-family: inherit;
}
.ui-combo__list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 30;
  margin: 4px 0 0;
  padding: var(--sp-1);
  list-style: none;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--glass-solid);
  box-shadow: var(--elev-1);
}
.ui-combo__option {
  width: 100%;
  text-align: left;
  padding: var(--sp-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-md);
  cursor: pointer;
}
.ui-combo__option.is-active,
.ui-combo__option:hover {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
</style>

<script setup lang="ts">
// The text field. Label, hint and error are part of the component so a form
// never assembles its own — which is how error text ends up unassociated with
// the input it describes.
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined
    label?: string
    hint?: string
    error?: string
    placeholder?: string
    type?: 'text' | 'number' | 'email' | 'password' | 'url'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    prefix?: string
  }>(),
  { type: 'text', size: 'md' },
)
defineEmits<{ 'update:modelValue': [string] }>()

const uid = useId()
const describedBy = computed(() =>
  props.error ? `${uid}-err` : props.hint ? `${uid}-hint` : undefined,
)
</script>

<template>
  <div class="ui-field" :class="[`ui-field--${size}`, { 'is-error': !!error }]">
    <label v-if="label" class="ui-field__label" :for="uid">{{ label }}</label>
    <div class="ui-field__box">
      <span v-if="prefix" class="ui-field__prefix">{{ prefix }}</span>
      <input
        :id="uid"
        class="ui-field__input ui-focus-ring"
        :type="type"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :aria-invalid="!!error"
        :aria-describedby="describedBy"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <slot name="suffix" />
    </div>
    <p v-if="error" :id="`${uid}-err`" class="ui-field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="`${uid}-hint`" class="ui-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-field__label {
  font-size: var(--text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ui-field__box {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.ui-field__box:focus-within {
  border-color: var(--theme-accent);
}
.ui-field.is-error .ui-field__box {
  border-color: var(--theme-danger, var(--theme-text));
}
.ui-field--sm .ui-field__box {
  min-height: var(--control-sm);
}
.ui-field--md .ui-field__box {
  min-height: var(--control-md);
}
.ui-field--lg .ui-field__box {
  min-height: var(--control-lg);
}
.ui-field__prefix {
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.ui-field__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-family: inherit;
}
.ui-field__input:focus {
  outline: none;
}
.ui-field__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-field__hint,
.ui-field__error {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ui-field__error {
  color: var(--theme-danger, var(--theme-text));
  font-weight: 600;
}
</style>

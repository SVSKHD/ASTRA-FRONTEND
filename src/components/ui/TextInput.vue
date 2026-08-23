<script setup lang="ts">
// The text field (section 25b).
//
// It no longer renders its own label, hint or error — FormField does. What is
// left is the field itself and the things that live *inside* it: a leading
// icon, a trailing slot, a prefix or suffix, a clear button. Those belong here
// because they share the control's box; the label does not.
//
// The `label`, `hint` and `error` props are still accepted so the migration can
// happen a form at a time rather than in one commit that touches everything.
// A call site passing them gets the old single-component behaviour; a call site
// inside a FormField passes none of them and gets the shell's.
import { computed, ref, useId } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined
    /** Deprecated in favour of FormField; see the note above. */
    label?: string
    hint?: string
    error?: string
    placeholder?: string
    type?: 'text' | 'number' | 'email' | 'password' | 'url' | 'search' | 'tel'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    required?: boolean
    /** Drawn inside the box, before the text. */
    icon?: IconName
    /** Fixed text that is part of the field rather than part of the value. */
    prefix?: string
    suffix?: string
    clearable?: boolean
    loading?: boolean
    id?: string
    describedBy?: string
    maxlength?: number
    autocomplete?: string
    inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'url' | 'search' | 'tel'
  }>(),
  { type: 'text', size: 'md' },
)
const emit = defineEmits<{
  // focus and blur are forwarded explicitly rather than left to attribute
  // fallthrough. Neither event bubbles, so a listener that lands on this
  // component's root div — which is where a fallthrough listener goes — never
  // fires. It fails silently, and only for those two events, which is the worst
  // shape a bug can have.
  'update:modelValue': [string]
  clear: []
  focus: [FocusEvent]
  blur: [FocusEvent]
}>()

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const input = ref<HTMLInputElement | null>(null)

// When the component is carrying its own label and error, it also has to own the
// describedby ids. Inside a FormField, the shell supplies them.
const ownErrorId = computed(() => `${fieldId.value}-err`)
const ownHintId = computed(() => `${fieldId.value}-hint`)
const describedBy = computed(
  () =>
    props.describedBy ??
    (props.error ? ownErrorId.value : props.hint ? ownHintId.value : undefined),
)
const isInvalid = computed(() => props.invalid || !!props.error)
const showClear = computed(
  () => props.clearable && !!String(props.modelValue ?? '') && !props.disabled && !props.readonly,
)

function clear() {
  emit('update:modelValue', '')
  emit('clear')
  input.value?.focus()
}

defineExpose({
  focus: () => input.value?.focus(),
  select: () => input.value?.select(),
  el: input,
})
</script>

<template>
  <div class="ui-ti">
    <label v-if="label" class="ui-ti__label" :for="fieldId">{{ label }}</label>
    <div
      class="ui-control"
      :class="[
        `ui-control--${size}`,
        { 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': isInvalid },
      ]"
    >
      <slot name="lead">
        <Icon v-if="icon" :name="icon" size="xs" class="ui-ti__affix" />
      </slot>
      <span v-if="prefix" class="ui-ti__affix">{{ prefix }}</span>
      <input
        :id="fieldId"
        ref="input"
        class="ui-control__input"
        :type="type"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :maxlength="maxlength"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :aria-invalid="isInvalid"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
      />
      <span v-if="suffix" class="ui-ti__affix">{{ suffix }}</span>
      <button v-if="showClear" type="button" class="ui-ti__clear" aria-label="Clear" @click="clear">
        ×
      </button>
      <span v-if="loading" class="ui-ti__spin" aria-hidden="true"></span>
      <slot name="trail" />
    </div>
    <p v-if="error" :id="ownErrorId" class="ui-ti__msg is-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="ownHintId" class="ui-ti__msg">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ui-ti {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ui-ti__label {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
  margin-bottom: 6px;
}
.ui-ti__affix {
  flex-shrink: 0;
  color: var(--text-muted, var(--theme-dim));
}
.ui-ti__clear {
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0 2px;
  color: var(--text-muted, var(--theme-dim));
  font: inherit;
  cursor: pointer;
}
.ui-ti__clear:hover {
  color: var(--text-primary, var(--theme-text));
}
/* The loading spinner goes in the trailing slot, never over the text. */
.ui-ti__spin {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid color-mix(in oklch, var(--theme-accent) 30%, transparent);
  border-top-color: var(--theme-accent);
  animation: uiTiSpin 700ms linear infinite;
}
@keyframes uiTiSpin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-ti__spin {
    animation: none;
  }
}
.ui-ti__msg {
  margin: var(--sp-1) 0 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ui-ti__msg.is-error {
  color: var(--theme-danger);
  font-weight: var(--weight-medium);
}
</style>

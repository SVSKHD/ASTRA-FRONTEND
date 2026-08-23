<script setup lang="ts">
// A number field with its own steppers (section 25b).
//
// `<input type="number">` is not used for the value. Three reasons, in order of
// how much they cost:
//
//  - The browser's own spinners cannot be styled and are the wrong size on
//    every theme; every app that ships them ends up hiding them anyway.
//  - A number input reports an empty string for anything it considers invalid,
//    so "12e" and "" are indistinguishable to the model, and the field silently
//    swallows what was typed.
//  - Its wheel behaviour changes the value when the page is being scrolled past
//    it, which is data loss triggered by not looking at the field.
//
// So the value is text, parsed on the way out, with inputmode="decimal" for the
// phone keypad and tabular figures so a column of estimates lines up.
import { computed, ref, useId } from 'vue'
import Icon from '@/components/ui/Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number | null
    min?: number
    max?: number
    step?: number
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    required?: boolean
    placeholder?: string
    suffix?: string
    id?: string
    describedBy?: string
  }>(),
  { size: 'md', step: 1 },
)
const emit = defineEmits<{
  // focus and blur are forwarded explicitly rather than left to attribute
  // fallthrough. Neither event bubbles, so a listener that lands on this
  // component's root div — which is where a fallthrough listener goes — never
  // fires. It fails silently, and only for those two events, which is the worst
  // shape a bug can have.
  'update:modelValue': [number | null]
  focus: [FocusEvent]
  blur: [FocusEvent]
}>()

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const input = ref<HTMLInputElement | null>(null)

const text = computed(() => (props.modelValue === null ? '' : String(props.modelValue)))

function clamp(n: number): number {
  if (props.min !== undefined && n < props.min) return props.min
  if (props.max !== undefined && n > props.max) return props.max
  return n
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  if (raw === '') return emit('update:modelValue', null)
  const parsed = Number(raw)
  // A half-typed "-" or "1." is not a number yet and must not clear the field
  // under the cursor. Leave the model where it is and let the next keystroke
  // resolve it.
  if (!Number.isFinite(parsed)) return
  emit('update:modelValue', parsed)
}

// Clamping happens on blur, not on input: clamping while typing turns "10" on
// its way to "100" into "10" forever when the max is 50.
function onBlur(event: FocusEvent) {
  emit('blur', event)
  if (props.modelValue === null) return
  const clamped = clamp(props.modelValue)
  if (clamped !== props.modelValue) emit('update:modelValue', clamped)
}

function nudge(direction: 1 | -1) {
  if (props.disabled || props.readonly) return
  const base = props.modelValue ?? props.min ?? 0
  emit('update:modelValue', clamp(round(base + direction * props.step)))
}

// Fixes the float error that makes 0.1 + 0.2 render as 0.30000000000000004 in a
// field somebody has to read.
function round(n: number): number {
  const decimals = (String(props.step).split('.')[1] ?? '').length
  return Number(n.toFixed(decimals))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    nudge(1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    nudge(-1)
  }
}

const atMin = computed(
  () => props.min !== undefined && (props.modelValue ?? props.min) <= props.min,
)
const atMax = computed(
  () => props.max !== undefined && (props.modelValue ?? props.max) >= props.max,
)

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div
    class="ui-control ui-num"
    :class="[
      `ui-control--${size}`,
      { 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': invalid },
    ]"
  >
    <input
      :id="fieldId"
      ref="input"
      class="ui-control__input ui-num__input ui-tabular"
      type="text"
      inputmode="decimal"
      role="spinbutton"
      :value="text"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :aria-valuenow="modelValue ?? undefined"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      @input="onInput"
      @blur="onBlur"
      @focus="emit('focus', $event)"
      @keydown="onKeydown"
    />
    <span v-if="suffix" class="ui-num__suffix">{{ suffix }}</span>
    <span v-if="!readonly" class="ui-num__steps">
      <!-- tabindex -1: the field itself takes the arrows, so these are a
           pointer affordance and adding two tab stops per number would be a
           tax on every keyboard user for nobody's benefit. -->
      <button
        type="button"
        class="ui-num__step"
        tabindex="-1"
        aria-label="Increase"
        :disabled="disabled || atMax"
        @click="nudge(1)"
      >
        <Icon name="chevron-down" size="xs" class="ui-num__up" />
      </button>
      <button
        type="button"
        class="ui-num__step"
        tabindex="-1"
        aria-label="Decrease"
        :disabled="disabled || atMin"
        @click="nudge(-1)"
      >
        <Icon name="chevron-down" size="xs" />
      </button>
    </span>
  </div>
</template>

<style scoped>
.ui-num__input {
  /* Belt and braces: the value is a text input, but a browser that decides
     otherwise still gets no spinners of its own. */
  appearance: textfield;
}
.ui-num__input::-webkit-outer-spin-button,
.ui-num__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}
.ui-num__suffix {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ui-num__steps {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  margin-right: -4px;
}
/* Icons rather than ▲▼ glyphs: a text arrow has to be sized in px to fit two of
   them in one control's height, and the smallest step on the type scale is
   still too big for that. The icon set is sized on its own scale, which is
   what it is for. */
.ui-num__step {
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  padding: 0 var(--sp-1);
  height: 12px;
  color: var(--text-muted, var(--theme-dim));
  cursor: pointer;
}
.ui-num__up {
  transform: rotate(180deg);
}
.ui-num__step:hover:not(:disabled) {
  color: var(--text-primary, var(--theme-text));
}
.ui-num__step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>

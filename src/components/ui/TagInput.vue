<script setup lang="ts">
// The project-tag pattern from the New Task dialog, as a library control
// (section 25b).
//
// Not a MultiSelect: the set is open. You are naming tags, not choosing from a
// fixed list, and the suggestions are a convenience rather than the vocabulary.
// That is why Enter commits whatever is typed and why there is no "not in the
// list" state to be in.
//
// Backspace on an empty field removes the last tag. It is the one interaction
// people arrive already knowing from every other tag field they have used, and
// leaving it out means every removal is a trip to a small × with the mouse.
import { computed, ref, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    /** Offered beneath the field; typing still wins over them. */
    suggestions?: string[]
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    id?: string
    describedBy?: string
    max?: number
  }>(),
  { size: 'md', placeholder: 'Add a tag…', suggestions: () => [] },
)
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

const atLimit = computed(() => !!props.max && props.modelValue.length >= props.max)

// Case-insensitive, because "Work" and "work" as two tags is never what anybody
// meant, and the first spelling entered is the one that stays.
function add(raw: string) {
  const value = raw.trim()
  if (!value || atLimit.value) return
  const exists = props.modelValue.some((t) => t.toLowerCase() === value.toLowerCase())
  if (!exists) emit('update:modelValue', [...props.modelValue, value])
  draft.value = ''
}

function remove(tag: string) {
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t !== tag),
  )
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled || props.readonly) return
  // Comma commits too: it is what a paste of "a, b, c" is made of, and what
  // people type when they are thinking in lists.
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    add(draft.value)
  } else if (event.key === 'Backspace' && !draft.value && props.modelValue.length) {
    event.preventDefault()
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}

// A paste of "one, two" is two tags, not one tag with a comma in it.
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!text.includes(',')) return
  event.preventDefault()
  for (const part of text.split(',')) add(part)
}

const unused = computed(() =>
  props.suggestions.filter(
    (s) => !props.modelValue.some((t) => t.toLowerCase() === s.toLowerCase()),
  ),
)
</script>

<template>
  <div class="ui-tags">
    <div
      class="ui-control ui-tags__box"
      :class="[
        `ui-control--${size}`,
        { 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': invalid },
      ]"
      @click="input?.focus()"
    >
      <span v-for="tag in modelValue" :key="tag" class="ui-tags__tag">
        {{ tag }}
        <button
          v-if="!readonly && !disabled"
          type="button"
          class="ui-tags__x"
          :aria-label="`Remove ${tag}`"
          @click.stop="remove(tag)"
        >
          ×
        </button>
      </span>
      <input
        :id="fieldId"
        ref="input"
        v-model="draft"
        class="ui-control__input ui-tags__input"
        :placeholder="modelValue.length ? '' : placeholder"
        :disabled="disabled || atLimit"
        :readonly="readonly"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
        @keydown="onKeydown"
        @paste="onPaste"
        @blur="add(draft)"
      />
    </div>

    <div v-if="unused.length && !readonly && !disabled" class="ui-tags__suggest">
      <button
        v-for="s in unused"
        :key="s"
        type="button"
        class="ui-tags__chip"
        :disabled="atLimit"
        @click="add(s)"
      >
        {{ s }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ui-tags {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.ui-tags__box {
  flex-wrap: wrap;
  padding-block: 3px;
  cursor: text;
}
.ui-tags__tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-subtle, var(--glass-border));
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  white-space: nowrap;
}
.ui-tags__x {
  border: none;
  background: transparent;
  padding: 0 2px;
  color: var(--text-muted, var(--theme-dim));
  font: inherit;
  cursor: pointer;
}
.ui-tags__x:hover {
  color: var(--text-primary, var(--theme-text));
}
.ui-tags__input {
  /* Enough to type into, but happy to be the last thing on a wrapped line. */
  flex: 1 1 80px;
  min-width: 60px;
}
.ui-tags__suggest {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-tags__chip {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px dashed var(--border-subtle, var(--glass-border));
  background: transparent;
  color: var(--text-muted, var(--theme-dim));
  font-family: inherit;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  cursor: pointer;
}
.ui-tags__chip:hover:not(:disabled) {
  color: var(--text-primary, var(--theme-text));
  border-style: solid;
}
.ui-tags__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

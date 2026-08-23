<script setup lang="ts">
// A custom listbox, not a native <select> (section 25b).
//
// It used to be native "on purpose", for the platform picker on mobile. That
// was a defensible trade until the app had nineteen themes: a native select
// takes the OS's own colours and font, so on every theme but the one that
// happens to match the OS it was the one control that visibly did not belong.
// It also cannot be portalled, cannot show a group heading the way the rest of
// the app does, cannot carry an icon per option, and inside a dialog it renders
// its popup wherever the platform likes.
//
// What is kept from native is the behaviour, which is the part people actually
// learned: type-ahead, arrows, Home/End, Escape to close without changing
// anything. That lives in useListbox and is shared with MultiSelect and
// Combobox, so all three move the same way.
import { computed, ref, useId } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import ListboxPanel from '@/components/ui/internal/ListboxPanel.vue'
import { useListbox, type ListOption } from '@/composables/useListbox'

export interface SelectOption extends ListOption {}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    /** Kept for call sites that predate FormField; prefer the shell. */
    label?: string
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    clearable?: boolean
    id?: string
    describedBy?: string
    required?: boolean
  }>(),
  { size: 'md', placeholder: 'Select…' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const listboxId = computed(() => `${fieldId.value}-lb`)
const trigger = ref<HTMLElement | null>(null)

const options = computed(() => props.options)
const current = computed(() => props.options.find((o) => o.value === props.modelValue))

// One commit path for the pointer and the keyboard alike. Two of them is how a
// control ends up closing on click but not on Enter.
function choose(option: ListOption) {
  emit('update:modelValue', option.value)
  lb.closeList()
  trigger.value?.focus()
}

const lb = useListbox({
  options,
  initialValue: computed(() => props.modelValue),
  onChoose: choose,
})

function toggle() {
  if (props.disabled || props.readonly) return
  lb.open.value ? lb.closeList() : lb.openList()
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled || props.readonly) return
  if (lb.onKeydown(event)) event.preventDefault()
}

function clear(event: Event) {
  event.stopPropagation()
  emit('update:modelValue', '')
}

// Closing on blur rather than on a document listener: the panel's options use
// mousedown.prevent, so clicking one never blurs the trigger, and everything
// else that takes focus away should close the list.
function onBlur(event: FocusEvent) {
  const next = event.relatedTarget as HTMLElement | null
  if (next?.closest('.ui-lb')) return
  lb.closeList()
}
</script>

<template>
  <div class="ui-sel" :class="{ 'has-label': !!label }">
    <label v-if="label" class="ui-sel__label" :for="fieldId">{{ label }}</label>
    <button
      :id="fieldId"
      ref="trigger"
      type="button"
      class="ui-control ui-sel__trigger"
      :class="[
        `ui-control--${size}`,
        { 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': invalid },
      ]"
      role="combobox"
      :aria-expanded="lb.open.value"
      :aria-controls="listboxId"
      :aria-activedescendant="
        lb.open.value && lb.activeIndex.value >= 0
          ? `${listboxId}-opt-${lb.activeIndex.value}`
          : undefined
      "
      aria-haspopup="listbox"
      :aria-describedby="describedBy"
      :aria-invalid="invalid"
      :aria-required="required"
      :disabled="disabled"
      @click="toggle"
      @keydown="onKeydown"
      @blur="onBlur"
    >
      <Icon v-if="current?.icon" :name="current.icon as never" size="xs" />
      <span class="ui-sel__value" :class="{ 'is-placeholder': !current }">
        {{ current?.label ?? placeholder }}
      </span>
      <span
        v-if="clearable && modelValue && !disabled && !readonly"
        class="ui-sel__clear"
        role="button"
        tabindex="-1"
        aria-label="Clear"
        @click="clear"
        @mousedown.prevent
      >
        ×
      </span>
      <Icon name="chevron-down" size="xs" class="ui-sel__chev" />
    </button>

    <ListboxPanel
      :open="lb.open.value"
      :options="options"
      :active-index="lb.activeIndex.value"
      :selected="modelValue ? [modelValue] : []"
      :anchor="trigger"
      :listbox-id="listboxId"
      @choose="choose"
      @hover="(i) => (lb.activeIndex.value = i)"
    />
  </div>
</template>

<style scoped>
.ui-sel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ui-sel__label {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
  margin-bottom: 6px;
}
.ui-sel__trigger {
  text-align: left;
  cursor: pointer;
}
.ui-sel__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-sel__value.is-placeholder {
  color: var(--text-muted, var(--theme-dim));
}
.ui-sel__clear {
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--text-muted, var(--theme-dim));
  cursor: pointer;
}
.ui-sel__clear:hover {
  color: var(--text-primary, var(--theme-text));
}
.ui-sel__chev {
  flex-shrink: 0;
  color: var(--text-muted, var(--theme-dim));
}
</style>

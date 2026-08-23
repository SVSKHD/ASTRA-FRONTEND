<script setup lang="ts">
// The same list as Select, with the values rendered as removable chips inside
// the control (section 25b).
//
// Chips inside the control rather than a summary line ("3 selected") because
// the commonest thing anybody does next is remove one, and a summary makes that
// a two-step operation: open the list, find the entry, unselect it. With chips
// it is one click on the thing you can already see.
//
// Overflow collapses to "+N" rather than wrapping without limit. A control that
// grows to four lines when you pick eight tags reflows the entire form under it,
// and the list is one click away for anyone who needs the full set.
import { computed, ref, useId } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import ListboxPanel from '@/components/ui/internal/ListboxPanel.vue'
import { useListbox, type ListOption } from '@/composables/useListbox'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    options: ListOption[]
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    id?: string
    describedBy?: string
    /** How many chips show before the rest collapse to "+N". */
    maxChips?: number
  }>(),
  { size: 'md', placeholder: 'Select…', maxChips: 3 },
)
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const listboxId = computed(() => `${fieldId.value}-lb`)
const trigger = ref<HTMLElement | null>(null)

const options = computed(() => props.options)
const chosen = computed(() =>
  props.modelValue
    .map((v) => props.options.find((o) => o.value === v))
    .filter((o): o is ListOption => !!o),
)
const shown = computed(() => chosen.value.slice(0, props.maxChips))
const hidden = computed(() => Math.max(0, chosen.value.length - props.maxChips))

// Toggling, not replacing — and the list stays open, because picking several is
// the entire point of the control.
function toggleValue(option: ListOption) {
  const next = props.modelValue.includes(option.value)
    ? props.modelValue.filter((v) => v !== option.value)
    : [...props.modelValue, option.value]
  emit('update:modelValue', next)
}

const lb = useListbox({ options, onChoose: toggleValue })

function onKeydown(event: KeyboardEvent) {
  if (props.disabled || props.readonly) return
  // Backspace on an open-but-unedited control removes the last chip, which is
  // the one habit carried over from a tag field that people expect here too.
  if (event.key === 'Backspace' && props.modelValue.length) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
    event.preventDefault()
    return
  }
  if (lb.onKeydown(event)) event.preventDefault()
}

function remove(value: string, event: Event) {
  event.stopPropagation()
  emit(
    'update:modelValue',
    props.modelValue.filter((v) => v !== value),
  )
}

function onBlur(event: FocusEvent) {
  if ((event.relatedTarget as HTMLElement | null)?.closest('.ui-lb')) return
  lb.closeList()
}
</script>

<template>
  <div class="ui-ms">
    <button
      :id="fieldId"
      ref="trigger"
      type="button"
      class="ui-control ui-ms__trigger"
      :class="[
        `ui-control--${size}`,
        { 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': invalid },
      ]"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="lb.open.value"
      :aria-controls="listboxId"
      :aria-describedby="describedBy"
      :aria-invalid="invalid"
      :disabled="disabled"
      @click="lb.open.value ? lb.closeList() : lb.openList()"
      @keydown="onKeydown"
      @blur="onBlur"
    >
      <span v-if="!chosen.length" class="ui-ms__placeholder">{{ placeholder }}</span>
      <span class="ui-ms__chips">
        <span v-for="option in shown" :key="option.value" class="ui-ms__chip">
          {{ option.label }}
          <span
            class="ui-ms__x"
            role="button"
            tabindex="-1"
            :aria-label="`Remove ${option.label}`"
            @click="remove(option.value, $event)"
            @mousedown.prevent
            >×</span
          >
        </span>
        <span v-if="hidden" class="ui-ms__more">+{{ hidden }}</span>
      </span>
      <Icon name="chevron-down" size="xs" class="ui-ms__chev" />
    </button>

    <ListboxPanel
      :open="lb.open.value"
      :options="options"
      :active-index="lb.activeIndex.value"
      :selected="modelValue"
      :anchor="trigger"
      :listbox-id="listboxId"
      @choose="toggleValue"
      @hover="(i) => (lb.activeIndex.value = i)"
    />
  </div>
</template>

<style scoped>
.ui-ms {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ui-ms__trigger {
  text-align: left;
  cursor: pointer;
  /* Vertical padding, unlike the single-line controls: the chips have their own
     height and would otherwise touch the border. */
  padding-block: 3px;
}
.ui-ms__placeholder {
  flex: 1;
  min-width: 0;
  color: var(--text-muted, var(--theme-dim));
}
.ui-ms__chips {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  overflow: hidden;
}
.ui-ms__chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 2px;
  max-width: 140px;
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-subtle, var(--glass-border));
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-ms__x {
  cursor: pointer;
  color: var(--text-muted, var(--theme-dim));
}
.ui-ms__x:hover {
  color: var(--text-primary, var(--theme-text));
}
.ui-ms__more,
.ui-ms__chev {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import Textarea from '@/components/ui/TextArea.vue'
const props = defineProps<{ modelValue: unknown; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()
const text = computed(() => typeof props.modelValue === 'string')
const array = computed(() => Array.isArray(props.modelValue))
const entries = computed(() =>
  props.modelValue && typeof props.modelValue === 'object' ? Object.entries(props.modelValue) : [],
)
const initialItem = Array.isArray(props.modelValue) ? props.modelValue[0] : undefined
const title = computed(() =>
  props.label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
)
function update(key: string, value: unknown) {
  const next = Array.isArray(props.modelValue)
    ? [...props.modelValue]
    : { ...(props.modelValue as Record<string, unknown>) }
  ;(next as Record<string, unknown>)[key] = value
  emit('update:modelValue', next)
}
function remove(index: number) {
  emit(
    'update:modelValue',
    (props.modelValue as unknown[]).filter((_, i) => i !== index),
  )
}
function blank(value: unknown): unknown {
  if (Array.isArray(value)) return []
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, blank(v)]))
  return ''
}
function add() {
  const items = props.modelValue as unknown[]
  // Empty collections have explicit templates; this keeps additions usable.
  const templates: Record<string, unknown> = {
    links: { label: '', href: 'https://', value: '' },
    facts: { v: '', k: '' },
    experience: { role: '', org: '', dates: '', bullets: [] },
    education: { degree: '', school: '', year: '' },
    projects: {
      title: '',
      kind: '',
      role: '',
      stack: [],
      facts: [],
      bullets: [],
      flow: [],
      links: [],
    },
    glance: { k: '', v: '' },
    focus: { tag: '', title: '', body: '' },
    stack: { group: '', icon: '', items: [] },
  }
  emit('update:modelValue', [
    ...items,
    items.length
      ? blank(items[0])
      : initialItem !== undefined
        ? blank(initialItem)
        : (templates[props.label] ?? ''),
  ])
}
</script>
<template>
  <div v-if="text" class="pf-edit-field">
    <Textarea
      :label="title"
      :model-value="modelValue as string"
      :rows="2"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
  <fieldset v-else class="pf-edit-group">
    <legend>{{ title }}</legend>
    <div v-for="[key, value] in entries" :key="key" class="pf-edit-row">
      <ProfileFields
        :label="array ? String(Number(key) + 1) : key"
        :model-value="value"
        @update:model-value="update(key, $event)"
      /><button
        v-if="array"
        type="button"
        :aria-label="'Remove ' + title + ' item ' + (Number(key) + 1)"
        @click="remove(Number(key))"
      >
        Remove
      </button>
    </div>
    <button v-if="array" type="button" @click="add">Add item</button>
  </fieldset>
</template>

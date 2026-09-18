<script setup lang="ts">
// The typed tag filter at the top of the todo and task list columns.
//
// A text field rather than TagFilter's dropdown: the list column is where the
// eye already is, and typing "trad" is faster than opening a menu and scanning.
// While the field has focus, the tags in use that match what was typed sit
// underneath as chips with row counts; clicking one fills the field with that
// exact tag. Like TagFilter, it hides while there is nothing to filter by, and
// stays while a query is active so the way back out never vanishes.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import SearchField from '@/components/ui/SearchField.vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip } from '@/styles'
import { tagQuerySuggestions } from '@/utils/tagFilter'

const props = defineProps<{
  modelValue: string
  /** Every row's tags: its own and each subtask's below it. */
  groups: readonly (readonly string[])[]
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { tags } = storeToRefs(useAppStore())
const { c, dark } = useStyles()

const focused = ref(false)
const suggestions = computed(() =>
  tagQuerySuggestions(tags.value, props.groups, props.modelValue).slice(0, 12),
)
const offered = computed(
  () => !!props.modelValue || props.groups.some((g) => g.some((t) => !!t?.trim())),
)

function pick(tag: string) {
  emit('update:modelValue', tag)
}

const wrapStyle = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' })
const chipRowStyle = pxify({ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' })
function chipStyle(tag: string) {
  return pxify({ ...tagChip(c.value, tag, dark.value), cursor: 'pointer', font: 'inherit' })
}
</script>

<template>
  <div v-if="offered" :style="wrapStyle" @focusin="focused = true" @focusout="focused = false">
    <SearchField
      size="sm"
      label="Filter by tag"
      placeholder="Filter by tag…"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-if="focused && suggestions.length" :style="chipRowStyle">
      <!-- mousedown.prevent keeps focus in the field, so the chips don't vanish
           on blur before the click lands. -->
      <button
        v-for="o in suggestions"
        :key="o.value"
        type="button"
        :style="chipStyle(o.value)"
        @mousedown.prevent
        @click="pick(o.value)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
</template>

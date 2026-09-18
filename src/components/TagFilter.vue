<script setup lang="ts">
// The tag filter for a list (Todos, Tasks, Goals).
//
// One control for all three, so "filter by tag" looks and behaves the same
// wherever it appears. The library's Select rather than a row of chips: a
// workspace collects tags faster than a toolbar gains width, and a strip of
// twenty chips beside "+ New todo" is a toolbar that wraps into two.
//
// It hides itself while there is nothing to filter by — a filter whose only
// choice is "Untagged" is a control asking a question with one answer. It stays
// while a filter is active, so the way back out never vanishes with the rows.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import Select from '@/components/ui/Select.vue'
import { useAppStore } from '@/stores/app'
import { UNTAGGED, tagFilterOptions } from '@/utils/tagFilter'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Every row's tags: its own, and for a tree, each subtask's below it. */
    groups: readonly (readonly string[])[]
    size?: 'sm' | 'md'
  }>(),
  { size: 'sm' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { tags } = storeToRefs(useAppStore())

const options = computed(() => tagFilterOptions(tags.value, props.groups, props.modelValue))
const offered = computed(
  () => !!props.modelValue || options.value.some((o) => o.value !== UNTAGGED),
)
</script>

<template>
  <Select
    v-if="offered"
    aria-label="Filter by tag"
    placeholder="All tags"
    clearable
    :size="size"
    :model-value="modelValue"
    :options="options"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
// A tab strip: the ARIA tab pattern, drawn by the app's one segmented control.
//
// This file used to be a second implementation of `SegmentedControl` — the same
// roving tabindex, the same arrow keys, the same "every option visible, one of
// them on", and a hundred lines of near-identical CSS beside it. Two copies of
// one control is two places for a fix to land and one of them to be forgotten,
// which is how the two ended up looking like different components in the same
// toolbar.
//
// So the control is shared and this is the part that is genuinely different: a
// tab strip switches what is on screen, and it has to SAY so. `role="tablist"`
// and `aria-selected` are what make a screen reader announce "tab 2 of 4"
// rather than "radio button" — a difference nobody sees and some people hear
// every time.
//
// Keeping the name is the point too. A view-switcher is written `<Tabs>`, so
// the semantics come from picking the right component rather than from
// remembering to pass a prop.
import SegmentedControl from '@/components/ui/SegmentedControl.vue'

export interface TabItem {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue: string
    tabs: TabItem[]
    ariaLabel?: string
    /**
     * Two heights, and only two. `sm` is the strip that shares a row with the
     * page's header actions; `md` is the strip that owns its own row. A call
     * site that could pass its own padding is a call site that will, which is
     * how one tab strip became five slightly different ones.
     */
    size?: 'sm' | 'md'
  }>(),
  { ariaLabel: 'Tabs', size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <SegmentedControl
    as="tablist"
    :model-value="modelValue"
    :options="tabs"
    :size="size"
    :aria-label="ariaLabel"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

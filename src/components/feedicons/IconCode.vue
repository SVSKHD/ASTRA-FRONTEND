<script setup lang="ts">
// Code: angle brackets around a slash. The most literal glyph in the set, and the right one — every reader of this app knows it on sight, and originality here would cost recognition for nothing.
//
// One of the FEED family (sections 39–40): news categories and pull-request
// states. A second set beside the trade family, and deliberately not a reuse of
// it — a glyph that means "buy" on one tab and "merged" on another means
// neither. `feedFamily.test.ts` holds this set to its own frame and proves no
// geometry is shared with the trade set.
withDefaults(defineProps<{ size?: number; title?: string }>(), { size: 16 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    data-family="feed"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : true"
    focusable="false"
  >
    <title v-if="title">{{ title }}</title>
    <path d="M8.5 8L4.5 12L8.5 16" />
    <path d="M15.5 8L19.5 12L15.5 16" />
    <path d="M13.5 5.5L10.5 18.5" />
  </svg>
</template>

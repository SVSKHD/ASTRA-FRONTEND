<script setup lang="ts">
// Changes requested: the same bubble with a turn-back arrow. Not a cross either — the reviewer is asking for another pass, not rejecting the work.
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
    <path
      d="M4.5 6.5C4.5 5.4 5.4 4.5 6.5 4.5H17.5C18.6 4.5 19.5 5.4 19.5 6.5V14C19.5 15.1 18.6 16 17.5 16H10L6 19.5V16H6.5C5.4 16 4.5 15.1 4.5 14V6.5Z"
    />
    <path d="M15 8.6H10.4C9.1 8.6 8.2 9.5 8.2 10.7C8.2 11.9 9.1 12.8 10.4 12.8H13" />
    <path d="M13.2 6.8L15.2 8.6L13.2 10.4" />
  </svg>
</template>

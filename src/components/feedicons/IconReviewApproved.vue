<script setup lang="ts">
// Approved: a tick inside the review\u2019s speech bubble. The tick is confined to the bubble on purpose — a bare tick already means half a dozen things elsewhere in this app.
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
    <path d="M8.8 10.4L11 12.6L15.2 8.4" />
  </svg>
</template>

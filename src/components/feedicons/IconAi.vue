<script setup lang="ts">
// AI: a node with three edges leaving it — the smallest honest picture of a network. Not a brain and not a robot: both are pictures of a metaphor rather than of the thing.
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
    <circle cx="12" cy="12" r="2.6" />
    <circle cx="5" cy="6" r="1.8" />
    <circle cx="19" cy="7" r="1.8" />
    <circle cx="16" cy="19" r="1.8" />
    <path d="M6.5 7.2L10 10.3" />
    <path d="M17.6 8.3L13.8 10.7" />
    <path d="M13.2 14.2L14.8 17.3" />
  </svg>
</template>

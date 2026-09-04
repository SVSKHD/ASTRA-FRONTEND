<script setup lang="ts">
// Merged: the branch arrives and the join is filled. The one solid mark in the set, because merged is the one terminal state that went well.
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
    <circle cx="7" cy="6.5" r="2.2" />
    <circle cx="17" cy="12" r="2.2" />
    <path d="M7 8.7V19.5" />
    <path d="M7 9.5C7 11.6 8.7 12 10.4 12H14.8" />
    <path d="M15.6 10.6L17.2 12L15.6 13.4" />
  </svg>
</template>

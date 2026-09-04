<script setup lang="ts">
// An open pull request: a branch line meeting the trunk, with the join still hollow. The hollow circle is what separates it from merged below — same skeleton, different endpoint.
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
    <circle cx="7" cy="17.5" r="2.2" />
    <path d="M7 8.7V15.3" />
    <circle cx="17" cy="17.5" r="2.2" />
    <path d="M17 15.3V10.5C17 8.8 15.7 7.5 14 7.5H9.4" />
  </svg>
</template>

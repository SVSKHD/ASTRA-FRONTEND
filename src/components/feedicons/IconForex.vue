<script setup lang="ts">
// Forex: two currencies changing hands — a pair of arrows curving past one another. Not a chart and not a coin, because the category is an exchange rate rather than a price or a currency.
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
    <path d="M4 8.5H18" />
    <path d="M14.5 5L18 8.5L14.5 12" />
    <path d="M20 15.5H6" />
    <path d="M9.5 12L6 15.5L9.5 19" />
  </svg>
</template>

<script setup lang="ts">
// Target hit: the arrow in the middle of the rings. Its pair says the same thing about a miss, so neither borrows the tick or the cross that mean a dozen other things in this app.
//
// One of the trade family (section 28b). Every file in this directory carries
// the identical frame — 24x24, currentColor, 1.5, round caps and joins — so the
// set reads as one hand; `family.test.ts` fails the build if one drifts.
withDefaults(defineProps<{ size?: number; title?: string }>(), { size: 16 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
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
    <circle cx="11" cy="13" r="7.5" />
    <circle cx="11" cy="13" r="3.4" />
    <path d="M11 13L17.5 6.5" />
    <path d="M15 3.5H20.5V9" />
  </svg>
</template>

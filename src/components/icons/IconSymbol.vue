<script setup lang="ts">
// Symbol: the ticker hash. Not the luggage tag the app uses for tags, and not a currency mark, which would be wrong for an index.
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
    data-family="trade"
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
    <path d="M9.2 4.5L7.4 19.5" />
    <path d="M16.6 4.5L14.8 19.5" />
    <path d="M5.2 9.5H19.2" />
    <path d="M4.8 14.5H18.8" />
  </svg>
</template>

<script setup lang="ts">
// London: a half disc sitting on the horizon with two low rays — the open, at first light.
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
    <path d="M8 18.5A4 4 0 0 1 16 18.5" />
    <path d="M5 14.6L6.4 15.8M19 14.6L17.6 15.8" />
    <path d="M3.5 18.5H20.5" />
  </svg>
</template>

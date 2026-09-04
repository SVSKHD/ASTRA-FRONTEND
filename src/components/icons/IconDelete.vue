<script setup lang="ts">
// Delete: a bin, and only ever a bin.
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
    <path d="M4.5 6.5H19.5" />
    <path d="M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5H13A1.5 1.5 0 0 1 14.5 5V6.5" />
    <path d="M6.8 6.5L7.5 19.4A1.8 1.8 0 0 0 9.3 21H14.7A1.8 1.8 0 0 0 16.5 19.4L17.2 6.5" />
    <path d="M10.5 10.5V17M13.5 10.5V17" />
  </svg>
</template>

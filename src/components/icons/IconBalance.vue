<script setup lang="ts">
// Balance: a beam scale — what the account currently weighs, as opposed to what it earned.
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
    <path d="M12 5.5V18.5" />
    <circle cx="12" cy="4" r="1.2" />
    <path d="M5 8.5H19" />
    <path d="M3 13L5 8.5L7 13" />
    <path d="M17 13L19 8.5L21 13" />
    <path d="M8.5 18.5H15.5" />
  </svg>
</template>

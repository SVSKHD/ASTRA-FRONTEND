<script setup lang="ts">
// Secured: a vault door. Deliberately not a padlock — the app already locks itself with one, and this is money put away rather than something fastened shut.
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
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 7.3V8.8M12 15.2V16.7M7.3 12H8.8M15.2 12H16.7" />
  </svg>
</template>

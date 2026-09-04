<script setup lang="ts">
// New York: a full disc high above the horizon with rays out of the top — the same sky, hours later.
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
    <circle cx="12" cy="9.5" r="3.4" />
    <path d="M12 4.7V3.3M7.7 5.2L6.7 4.2M16.3 5.2L17.3 4.2M5.2 9.5H3.8M18.8 9.5H20.2" />
    <path d="M3.5 18.5H20.5" />
  </svg>
</template>

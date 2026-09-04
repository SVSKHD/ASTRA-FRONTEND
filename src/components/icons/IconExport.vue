<script setup lang="ts">
// Export: the arrow leaving the tray. The sprite's download glyph points the other way into it, which is the other half of the same distinction.
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
    <path d="M4.5 14.5V18.5A1.5 1.5 0 0 0 6 20H18A1.5 1.5 0 0 0 19.5 18.5V14.5" />
    <path d="M12 15V4.5" />
    <path d="M8 8.5L12 4.5L16 8.5" />
  </svg>
</template>

<script setup lang="ts">
// Buy: an arrow up off a support line. Its pair, IconSell, is not this one rotated — the line moves to the other side, so the two are told apart by silhouette as well as by direction.
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
    <path d="M12 16.5V5.5" />
    <path d="M7.5 10L12 5.5L16.5 10" />
    <path d="M5.5 20H18.5" />
  </svg>
</template>

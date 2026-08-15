<script setup lang="ts">
// The Goals football, as a standalone 24×24 stroke icon (task 12a). Matches the
// TabGlyph football so the nav glyph and the large empty-state / header icon read
// as the same mark. stroke=currentColor, fill=none, 1.5 weight like the siblings.
withDefaults(defineProps<{ size?: number | string }>(), { size: 24 })
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
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8.8 L15 11 L13.9 14.6 L10.1 14.6 L9 11 Z" />
    <path d="M12 8.8 L12 3.2" />
    <path d="M15 11 L20.4 9.2" />
    <path d="M13.9 14.6 L17.2 19.2" />
    <path d="M10.1 14.6 L6.8 19.2" />
    <path d="M9 11 L3.6 9.2" />
  </svg>
</template>

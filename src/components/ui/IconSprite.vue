<script setup lang="ts">
// The sprite (section 21e). Mounted once, at the app root.
//
// Every icon's geometry is emitted here as a `<symbol>`, and every `<Icon>` in
// the app is a `<use>` pointing at one. Drawing an icon in fifty places costs
// fifty seven-byte references rather than fifty copies of the path data, and
// the presentation — the weight, the caps, the fill rule — is set once, here,
// where no call site can reach it.
//
// The set is compiled in from icons.ts, so the sprite is assembled at build
// time rather than fetched: an external sprite file would be one more request
// before the first icon appears, and the whole set is smaller than the request.
import { ICONS, ICON_STROKE, ICON_VIEWBOX } from '@/components/ui/icons'
</script>

<template>
  <svg class="ui-sprite" aria-hidden="true" focusable="false" width="0" height="0">
    <symbol
      v-for="(geometry, name) in ICONS"
      :id="`i-${name}`"
      :key="name"
      :viewBox="ICON_VIEWBOX"
      fill="none"
      stroke="currentColor"
      :stroke-width="ICON_STROKE"
      stroke-linecap="round"
      stroke-linejoin="round"
      v-html="geometry"
    />
  </svg>
</template>

<style scoped>
/* Out of the layout entirely — it draws nothing itself. */
.ui-sprite {
  display: none;
}
</style>

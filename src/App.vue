<script setup lang="ts">
// Shell only. The starfield and brand mark are shared chrome across every
// route — the workspace, a share page and the 404 all sit on the same sky.
import Starfield from '@/components/Starfield.vue'
import CursorTail from '@/components/CursorTail.vue'
import { useStyles } from '@/composables/useStyles'

const { s } = useStyles()
</script>

<template>
  <Starfield />
  <CursorTail />
  <RouterView />
  <div :style="s.brandWrap"><span :style="s.brand">AUREON</span></div>
</template>

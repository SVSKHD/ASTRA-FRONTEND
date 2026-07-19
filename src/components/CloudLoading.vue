<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'

const app = useAppStore()
const { s } = useStyles()
const { cloudError } = storeToRefs(app)
</script>

<template>
  <template v-if="cloudError">
    <div :style="s.dialogOverlay"></div>
    <div :style="s.authCard">
      <span :style="s.authLogo">Sync interrupted</span>
      <span :style="s.finMeta">{{ cloudError }}</span>
    </div>
  </template>
  <template v-else>
    <div :style="s.dialogOverlay"></div>
    <div :style="s.authCard">
      <span :style="s.authLogo">AUREON</span>
      <span :style="s.finMeta">Loading your Firebase workspace…</span>
      <span :style="s.loadingOrbit"></span>
    </div>
  </template>
</template>

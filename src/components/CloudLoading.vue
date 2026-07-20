<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'

const app = useAppStore()
const auth = useAuthStore()
const { s } = useStyles()
const { cloudError } = storeToRefs(app)
</script>

<template>
  <template v-if="cloudError">
    <div :style="s.dialogOverlay"></div>
    <div :style="s.authCard">
      <span :style="s.authLogo">Sync interrupted</span>
      <span :style="s.finMeta">{{ cloudError }}</span>
      <!-- Without these the error card is a dead end: no retry, no way back out. -->
      <div :style="s.authRow">
        <button :style="s.authBtn" v-hover-style="s.addBtnHover" @click="app.retryCloud()">
          Retry
        </button>
        <button :style="s.authBtn" v-hover-style="s.addBtnHover" @click="auth.signOut()">
          Sign out
        </button>
      </div>
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

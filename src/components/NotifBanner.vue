<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'

const app = useAppStore()
const { s } = useStyles()
const { activeNotif } = storeToRefs(app)
</script>

<template>
  <div v-if="activeNotif" :style="s.notifBanner">
    <span :style="s.drawerTitle">{{ activeNotif.title }}</span>
    <span :style="s.finMeta">{{ activeNotif.note }}</span>
    <div :style="s.dialogActions">
      <button :style="s.cancelBtn" @click="app.snoozeNotif(5)">Snooze 5m</button>
      <button :style="s.cancelBtn" @click="app.snoozeNotif(30)">Snooze 30m</button>
      <button :style="s.saveBtn" @click="app.dismissNotif()">Dismiss</button>
    </div>
  </div>
</template>

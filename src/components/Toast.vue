<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'

const app = useAppStore()
const { s } = useStyles()
const { toast } = storeToRefs(app)
</script>

<template>
  <div v-if="toast" :style="s.toast">
    <span :style="s.toastText">{{ toast.message }}</span>
    <button v-if="toast.undo" :style="s.saveBtn" @click="app.performUndo()">
      {{ toast.actionLabel || 'Undo' }}
    </button>
    <button :style="s.del" @click="app.closeToast()">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

const router = useRouter()
const { s } = useStyles()

const centeredPage = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
  }),
)
</script>

<template>
  <div :style="centeredPage">
    <div :style="s.shareCard">
      <span :style="s.drawerTitle">Lost in space</span>
      <span :style="s.finMeta">There is nothing at this address.</span>
      <div :style="s.dialogActions">
        <button :style="s.saveBtn" @click="router.push('/')">Back to Aureon</button>
      </div>
    </div>
  </div>
</template>

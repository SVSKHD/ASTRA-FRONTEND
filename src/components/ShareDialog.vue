<script setup lang="ts">
// Asks whether a share link should be public before it is created. The choice
// is written to the share document as `isPublic` and enforced by the Firestore
// rule on aureon-shares — nothing here is a security boundary on its own.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'

const app = useAppStore()
const { c, s } = useStyles()
const { pendingShare, shareBusy } = storeToRefs(app)

const heading = computed(() =>
  pendingShare.value ? `Share this ${pendingShare.value.type}` : 'Share',
)

const optionNote = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, lineHeight: 1.45, marginTop: 2 }),
)
const optionCol = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' })
const optionBlock = pxify({ display: 'flex', flexDirection: 'column', gap: 2 })
</script>

<template>
  <template v-if="pendingShare">
    <div :style="s.dialogOverlay" @click="app.cancelShare()"></div>
    <div :style="s.shareCard">
      <span :style="s.drawerTitle">{{ heading }}</span>
      <div :style="optionCol">
        <div :style="optionBlock">
          <button :style="s.saveBtn" :disabled="shareBusy" @click="app.createShareLink(true)">
            Public link
          </button>
          <span :style="optionNote">Anyone with the link can open it, no sign-in needed.</span>
        </div>
        <div :style="optionBlock">
          <button :style="s.editBtn" :disabled="shareBusy" @click="app.createShareLink(false)">
            Private link
          </button>
          <span :style="optionNote">Only you, signed in, can open it.</span>
        </div>
      </div>
      <div :style="s.dialogActions">
        <button :style="s.cancelBtn" :disabled="shareBusy" @click="app.cancelShare()">
          Cancel
        </button>
      </div>
    </div>
  </template>
</template>

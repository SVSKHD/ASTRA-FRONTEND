<script setup lang="ts">
// The app's single toast slot: it owns the store wiring, the library's Toast
// owns the appearance. Two components named Toast was the duplication the
// design system exists to remove.
//
// It springs in from 16px below over the sheet's spring curve (Todo v2, undo
// toast), 80px above the bottom edge so it clears the bottom pill.
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import Toast from '@/components/ui/Toast.vue'

const app = useAppStore()
const { toast } = storeToRefs(app)
</script>

<template>
  <div v-if="toast" class="toast-host">
    <Toast
      :message="toast.message"
      :action-label="toast.undo ? toast.actionLabel || 'Undo' : undefined"
      @action="app.performUndo()"
      @dismiss="app.closeToast()"
    />
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: calc(var(--sp-6) * 2 + var(--sp-4));
  transform: translateX(-50%);
  z-index: 60;
  animation: toastIn var(--dur-pop) var(--ease-spring) both;
}
@keyframes toastIn {
  from {
    opacity: 0;
    transform: translate(-50%, 16px);
  }
}
</style>

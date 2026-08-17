<script setup lang="ts">
// The app's single toast slot: it owns the store wiring, the library's Toast
// owns the appearance. Two components named Toast was the duplication the
// design system exists to remove.
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
  bottom: var(--sp-5);
  transform: translateX(-50%);
  z-index: 60;
  animation: toastIn var(--dur-med) var(--ease-out) both;
}
@keyframes toastIn {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
}
</style>

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
  <!-- Keyed on the message, so a toast replacing another springs in afresh;
       the Transition gives it a way out as well as in. -->
  <Transition name="toast-host">
    <div v-if="toast" :key="toast.message" class="toast-host">
      <Toast
        :message="toast.message"
        :action-label="toast.undo ? toast.actionLabel || 'Undo' : undefined"
        @action="app.performUndo()"
        @dismiss="app.closeToast()"
      />
    </div>
  </Transition>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: calc(var(--sp-6) * 2 + var(--sp-4));
  transform: translateX(-50%);
  z-index: 60;
}
.toast-host-enter-active {
  transition:
    opacity 0.25s ease,
    transform var(--dur-pop) var(--ease-spring),
    filter 0.25s ease;
}
.toast-host-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.2s ease-in,
    filter 0.18s ease;
}
.toast-host-enter-from {
  opacity: 0;
  transform: translate(-50%, 18px) scale(0.96);
  filter: blur(4px);
}
.toast-host-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px) scale(0.98);
  filter: blur(2px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-host-enter-active,
  .toast-host-leave-active {
    transition: opacity 0.15s ease;
  }
  .toast-host-enter-from,
  .toast-host-leave-to {
    transform: translateX(-50%);
    filter: none;
  }
}
</style>

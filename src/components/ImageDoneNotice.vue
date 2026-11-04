<script setup lang="ts">
// "Your image is ready", on whatever page you are on when a watched image job
// ends (src/images/watch.ts) — the image page included, where it just has no
// "View" (the image is already on screen).
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { finishText, imageWatch } from '@/images/watch'

const route = useRoute()
const router = useRouter()
const onImagePage = computed(() => route.path === '/images' || route.path === '/dev/images')
const job = computed(() => imageWatch.finished)

function view() {
  void router.push('/images')
}
</script>

<template>
  <div
    v-if="job"
    class="idn"
    :class="`is-${job.status}`"
    role="status"
    aria-live="polite"
    data-testid="image-done-notice"
  >
    <span class="idn__text">{{ finishText(job) }}</span>
    <Button v-if="job.status === 'done' && !onImagePage" size="sm" variant="tinted" @click="view"
      >View</Button
    >
    <Button size="sm" variant="ghost" @click="imageWatch.finished = null">Dismiss</Button>
  </div>
</template>

<style scoped>
.idn {
  position: fixed;
  left: 50%;
  top: calc(var(--sp-3) + env(safe-area-inset-top, 0px));
  z-index: 75;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  max-width: calc(100vw - 32px);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: var(--radius-pill, 999px);
  background: var(--glass-raised, var(--glass-card));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.3);
  transform: translateX(-50%);
  color: var(--text-primary, var(--theme-text));
}
.idn__text {
  min-width: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
</style>

<script setup lang="ts">
// Saving / Saved / Couldn't save, beside the milestone's progress (spec 3.3, 9).
//
// "Saved" only once nothing is waiting to be written — never on the strength of
// a tick having been clicked. Offline, edits are kept on this device and say
// so; a failed write offers Retry instead of a silent spinner.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useConnectivity } from '@/composables/useConnectivity'
import SaveState from '@/components/ui/SaveState.vue'
import Icon from '@/components/ui/Icon.vue'

const app = useAppStore()
const { cloudError } = storeToRefs(app)
const { isOnline, pendingCount, retry } = useConnectivity()

const phase = computed(() =>
  cloudError.value
    ? 'error'
    : !isOnline.value
      ? 'offline'
      : pendingCount.value > 0
        ? 'saving'
        : 'saved',
)
</script>

<template>
  <span class="msave" :class="`is-${phase}`" role="status" aria-live="polite">
    <template v-if="phase === 'error'">
      <Icon name="alert-circle" size="xs" />Couldn’t save
      <button type="button" class="msave__retry" @click="retry">Retry</button>
    </template>
    <template v-else-if="phase === 'offline'">
      <Icon name="cloud-off" size="xs" />Offline · kept on this device
    </template>
    <template v-else-if="phase === 'saving'"><SaveState state="working" />Saving…</template>
    <template v-else><SaveState state="done" />Saved</template>
  </span>
</template>

<style scoped>
.msave {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
}
.msave.is-error {
  color: var(--theme-danger);
}
.msave.is-offline {
  color: var(--theme-warning);
}
.msave__retry {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
</style>

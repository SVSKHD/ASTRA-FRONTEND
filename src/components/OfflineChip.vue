<script setup lang="ts">
// A small muted "Offline" pill shown under a card whose local change hasn't
// synced yet. Purely presentational — it renders only when `pending` is true
// and disappears on its own once the write is acknowledged (the parent's
// `pending` flips to false). It never blocks or greys the card.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import Icon from '@/components/ui/Icon.vue'

defineProps<{ pending?: boolean }>()

const { c } = useStyles()

const chipStyle = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    fontSize: 11,
    lineHeight: 1,
    padding: '3px 8px',
    borderRadius: 999,
    color: c.value.dim,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
</script>

<template>
  <span v-if="pending" :style="chipStyle" title="Saved locally — will sync when back online">
    <!-- cloud with a slash -->
    <Icon name="cloud-off" size="xs" :style="{ color: c.dim }" />
    Offline
  </span>
</template>

<script setup lang="ts">
// The market terminal's detail panel: a side panel beside the table on tablet
// and desktop (non-modal, so the table stays readable), a sheet on a phone.
// Esc closes it either way; focus goes back to whatever opened it.
import { nextTick, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import SlideOver from '@/components/ui/SlideOver.vue'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const { isPhone } = storeToRefs(useUiStore())

let opener: HTMLElement | null = null

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
// SlideOver listens for Esc itself when non-modal; the sheet only inside itself.
function listen(on: boolean) {
  window.removeEventListener('keydown', onKey)
  if (on) window.addEventListener('keydown', onKey)
}
watch(
  () => props.open && isPhone.value,
  (on) => listen(on),
  { immediate: true },
)
watch(
  () => props.open,
  (open) => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    } else if (opener) {
      const el = opener
      opener = null
      void nextTick(() => el.isConnected && el.focus())
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => listen(false))
</script>

<template>
  <BottomSheet v-if="isPhone" :open="open" :title="title" @close="emit('close')">
    <slot />
  </BottomSheet>
  <SlideOver
    v-else
    :open="open"
    :title="title"
    :modal="false"
    size="compact"
    @close="emit('close')"
  >
    <slot />
  </SlideOver>
</template>

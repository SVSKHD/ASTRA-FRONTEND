<script setup lang="ts">
// Where the chart viewer opens: a wide dialog (about 90% of the window) with a
// fullscreen / restore toggle on desktop and tablet; a bottom drawer on a phone
// (drag to resize; the chart's own button goes fullscreen). One viewer inside
// either. The page behind does not scroll while it is open.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import SignalChartViewer from './SignalChartViewer.vue'
import { useStyles } from '@/composables/useStyles'
import type { PortfolioHolding, SignalEvent, SignalTf, StateRow } from '@/trading/stockSignals/api'
import type { Target } from '@/trading/stockSignals/useStockSignals'

const props = defineProps<{
  target: Target | null
  tf: SignalTf
  state?: StateRow | null
  event?: SignalEvent | null
  holding?: PortfolioHolding | null
  now: number
}>()
const emit = defineEmits<{ close: []; watchlist: [Target]; alert: [Target] }>()
const { isMobile } = useStyles()
const full = ref(false)
const open = computed(() => !!props.target)
const title = computed(() => (props.target ? `${props.target.symbol} chart` : 'Chart'))

// Scroll lock, restored on close or unmount.
let saved: string | null = null
function lock(on: boolean) {
  const el = document.documentElement
  if (on && saved === null) {
    saved = el.style.overflow
    el.style.overflow = 'hidden'
  } else if (!on && saved !== null) {
    el.style.overflow = saved
    saved = null
  }
}
watch(
  open,
  (o) => {
    lock(o)
    if (!o) full.value = false
  },
  { immediate: true },
)
onBeforeUnmount(() => lock(false))
</script>

<template>
  <BottomSheet v-if="isMobile" :open="open" :title="title" @close="emit('close')">
    <div class="ch ch--sheet">
      <SignalChartViewer
        v-if="target"
        :target="target"
        :tf="tf"
        :state="state"
        :event="event"
        :holding="holding"
        :now="now"
        @watchlist="emit('watchlist', target)"
        @alert="emit('alert', target)"
      />
    </div>
  </BottomSheet>
  <Modal v-else :open="open" :size="full ? 'full' : 'wide'" :title="title" @close="emit('close')">
    <div class="ch">
      <IconButton
        class="ch__full"
        :label="full ? 'Restore the dialog' : 'Fullscreen'"
        size="sm"
        :active="full"
        @click="full = !full"
      >
        <Icon :name="full ? 'minimize-2' : 'maximize-2'" size="sm" />
      </IconButton>
      <SignalChartViewer
        v-if="target"
        :target="target"
        :tf="tf"
        :state="state"
        :event="event"
        :holding="holding"
        :now="now"
        :tall="full"
        @watchlist="emit('watchlist', target)"
        @alert="emit('alert', target)"
      />
    </div>
  </Modal>
</template>

<style scoped>
.ch {
  position: relative;
  min-width: 0;
}
.ch--sheet {
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.ch__full {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
}
</style>

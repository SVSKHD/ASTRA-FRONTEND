<script setup lang="ts">
// Where the chart viewer opens: a wide dialog (about 90% of the window) with a
// fullscreen / restore toggle on desktop and tablet, a bottom drawer on a phone
// (drag to resize; the chart's own button goes fullscreen). One viewer inside
// either. The page behind does not scroll while it is open.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import SignalChartViewer from './SignalChartViewer.vue'
import { useStyles } from '@/composables/useStyles'
import type { Timeframe } from '@/trading/chartView'
import type { Instrument } from '@/trading/instruments'
import type { HoldingView } from '@/trading/stockSignals/portfolio'

const props = defineProps<{
  instrument: Instrument | null
  tf: Timeframe
  now: number
  holding?: HoldingView | null
}>()
const emit = defineEmits<{ close: []; watchlist: [Instrument]; alert: [Instrument] }>()
const { isMobile } = useStyles()
const full = ref(false)
const open = computed(() => !!props.instrument)
const title = computed(() =>
  props.instrument
    ? `${props.instrument.trading_symbol || props.instrument.symbol} chart`
    : 'Chart',
)

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
    <SignalChartViewer
      v-if="instrument"
      :instrument="instrument"
      :tf="tf"
      :now="now"
      :holding="holding"
      @watchlist="emit('watchlist', instrument)"
      @alert="emit('alert', instrument)"
    />
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
        v-if="instrument"
        :instrument="instrument"
        :tf="tf"
        :now="now"
        :holding="holding"
        :tall="full"
        @watchlist="emit('watchlist', instrument)"
        @alert="emit('alert', instrument)"
      />
    </div>
  </Modal>
</template>

<style scoped>
.ch {
  position: relative;
  min-width: 0;
}
.ch__full {
  position: absolute;
  top: -2px;
  right: 0;
  z-index: 2;
}
@supports (padding: env(safe-area-inset-bottom)) {
  :global(.ui-sheet) {
    padding-bottom: max(var(--sp-3), env(safe-area-inset-bottom));
  }
}
</style>

<script setup lang="ts">
// The QR modal (14 UI): a canvas QR of the address, the full address in
// monospace beneath it, and the chain name in the header. Where the chain
// defines a payment URI scheme the QR encodes `bitcoin:…` / `ethereum:…`;
// otherwise it encodes the bare address, so what is scanned is exactly what was
// copied.
//
// Nothing here is a payment request: no amount, and no key material — the QR
// only ever carries a public receive address.
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { chainDef, chainName, explorerUrl, paymentUri } from '@/utils/chains'
import type { Wallet } from '@/types'

const props = defineProps<{ wallet: Wallet }>()
const emit = defineEmits<{ close: [] }>()

const { c, s } = useStyles()
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)

const def = computed(() => chainDef(props.wallet.chain))
// What the QR encodes. A wallet app scanning this gets the address and nothing
// else — the tag/memo is shown as text below, because a scheme that ignores it
// would be worse than making the user read it.
const payload = computed(() => paymentUri(props.wallet.chain, props.wallet.address))
const explorer = computed(() =>
  explorerUrl(props.wallet.chain, props.wallet.address, props.wallet.network),
)

async function draw() {
  if (!canvas.value) return
  failed.value = false
  try {
    await QRCode.toCanvas(canvas.value, payload.value, {
      width: 232,
      margin: 1,
      // High correction: these get scanned off a screen at an angle.
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {
    failed.value = true
  }
}
onMounted(draw)
watch(payload, draw)

// The QR image download, offered as a data URL the user saves themselves.
async function downloadPng() {
  try {
    const url = await QRCode.toDataURL(payload.value, { width: 512, margin: 2 })
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.wallet.label.replace(/\s+/g, '-').toLowerCase()}-${props.wallet.chain}.png`
    a.click()
  } catch {
    failed.value = true
  }
}

const card = computed(() =>
  pxify({
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 16,
    width: 'min(92vw, 340px)',
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 24,
    padding: 20,
    boxShadow: c.value.shadow,
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
  }),
)
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, width: '100%' })
const qrFrame = pxify({
  background: '#fff',
  padding: 10,
  borderRadius: 14,
  lineHeight: 0,
})
const addressStyle = computed(() =>
  pxify({
    fontFamily: 'var(--font-mono)',
    ...typeStep('xs'),
    lineHeight: 1.5,
    wordBreak: 'break-all',
    textAlign: 'center',
    color: c.value.text,
  }),
)
const metaStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, textAlign: 'center' }),
)
</script>

<template>
  <div :style="s.dialogOverlay" @click="emit('close')"></div>
  <div :style="card">
    <div :style="headRow">
      <span :style="s.drawerTitle">{{ def?.glyph }} {{ chainName(wallet.chain) }}</span>
      <span style="flex: 1"></span>
      <button :style="s.del" @click="emit('close')">×</button>
    </div>
    <span :style="metaStyle">
      {{ wallet.label }}
      <template v-if="wallet.network === 'testnet'"> · testnet</template>
    </span>

    <div :style="qrFrame"><canvas ref="canvas"></canvas></div>
    <span v-if="failed" :style="metaStyle">Could not render the QR code.</span>

    <div :style="addressStyle">{{ wallet.address }}</div>
    <span v-if="wallet.memoTag" :style="metaStyle">
      {{ def?.memo === 'tag' ? 'Destination tag' : 'Memo' }}: {{ wallet.memoTag }} — required, send
      without it and the deposit may be lost.
    </span>

    <div :style="headRow">
      <button :style="s.editBtn" @click="downloadPng">Save QR</button>
      <a
        v-if="explorer"
        :style="s.editBtn"
        :href="explorer"
        target="_blank"
        rel="noopener noreferrer"
        >Explorer ↗</a
      >
    </div>
  </div>
</template>

<script setup lang="ts">
// Dashboard Wallets card (section 14 UI + privacy). The dashboard is the most
// screenshot-prone surface in the app, so a row shows the label and chain only;
// the address appears on tap, and even then truncated. The full string lives in
// the Wallets tab, the QR modal and the clipboard — never on a glanceable card.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { chainDef, chainName } from '@/utils/chains'
import { copyVerification, truncateAddress } from '@/utils/address'
import { copyText } from '@/utils/clipboard'

const app = useAppStore()
const ui = useUiStore()
const { c } = useStyles()
const { wallets } = storeToRefs(app)

// Revealed per row, and only until the card is re-rendered.
const revealed = ref<Set<number>>(new Set())
function toggleReveal(id: number) {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}

// One row per chain: its default wallet. A user with six EVM addresses does not
// want six near-identical rows on the dashboard.
const rows = computed(() =>
  [...app.walletsByChain.keys()]
    .map((chain) => app.defaultWalletFor(chain))
    .filter((w): w is NonNullable<typeof w> => !!w)
    .slice(0, 4),
)

async function onCopy(address: string) {
  if (!(await copyText(address))) return
  const { head, tail } = copyVerification(address)
  app.showToastMsg(`Copied · ${head}…${tail}`)
}

const card = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '18px 18px 15px',
    borderRadius: 18,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    minWidth: 0,
  }),
)
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 8 })
const label = computed(() =>
  pxify({
    ...typeStep('xs'),
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const countChip = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.accent,
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid ' + c.value.accent,
  }),
)
const viewAllBtn = computed(() =>
  pxify({
    marginLeft: 'auto',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.dim,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }),
)
const walletRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 })
function glyph(color: string) {
  return pxify({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: '50%',
    flexShrink: 0,
    ...typeStep('xs'),
    color,
    border: '1px solid ' + color,
  })
}
const nameStyle = computed(() =>
  pxify({
    ...typeStep('sm'),
    color: c.value.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
    flex: 1,
  }),
)
const metaStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, whiteSpace: 'nowrap' }),
)
const addrStyle = computed(() =>
  pxify({
    fontFamily: 'var(--font-mono)',
    ...typeStep('xs'),
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
</script>

<template>
  <div v-if="rows.length" :style="card">
    <div :style="headRow">
      <span :style="label">Wallets</span>
      <span :style="countChip">{{ wallets.length }}</span>
      <button :style="viewAllBtn" @click="ui.setTab('wallets')">View all</button>
    </div>
    <div v-for="wallet in rows" :key="wallet.id" :style="walletRow">
      <span :style="glyph(chainDef(wallet.chain)?.color || c.accent)">
        {{ chainDef(wallet.chain)?.glyph }}
      </span>
      <span :style="nameStyle">{{ wallet.label }}</span>
      <!-- Address on tap: masked by default on this surface. -->
      <span
        v-if="revealed.has(wallet.id)"
        :style="addrStyle"
        title="Copy full address"
        @click="onCopy(wallet.address)"
      >
        {{ truncateAddress(wallet.address) }}
      </span>
      <span v-else :style="metaStyle" @click="toggleReveal(wallet.id)">
        {{ chainName(wallet.chain) }} · tap to show
      </span>
    </div>
  </div>
</template>

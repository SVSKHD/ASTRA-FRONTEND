<script setup lang="ts">
// The Wallets tab (section 14). An address book of the user's own PUBLIC
// receive addresses, grouped by chain: label, truncated address, copy, QR and
// an explorer link.
//
// Read-only by design. There is no signing, no transaction construction and no
// wallet connection — and the add form refuses a seed phrase or private key
// outright rather than storing it.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { copyText } from '@/utils/clipboard'
import { CHAINS, chainDef, chainName, explorerUrl } from '@/utils/chains'
import { chainMismatch, copyVerification, rejectSecret, truncateAddress } from '@/utils/address'
import WalletQrDialog from '@/components/WalletQrDialog.vue'
import { receiveBlock } from '@/utils/walletShare'
import type { ChainKey, Network, Wallet } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { wallets } = storeToRefs(app)

const qrWallet = ref<Wallet | null>(null)
// Inline edit, delete confirmation and drag reorder state.
const editingId = ref<number | null>(null)
const editDraft = ref({ label: '', address: '', memoTag: '', notes: '' })
const editError = ref('')
const confirmingId = ref<number | null>(null)
const dragId = ref<number | null>(null)
const adding = ref(false)
const form = ref({
  label: '',
  chain: 'BTC' as ChainKey,
  network: 'mainnet' as Network,
  address: '',
  memoTag: '',
  notes: '',
})
const formError = ref('')

defineExpose({ focus: () => (adding.value = true) })

const groups = computed(() =>
  [...app.walletsByChain.entries()].map(([chain, list]) => ({
    chain,
    def: chainDef(chain),
    list,
  })),
)

const selectedDef = computed(() => chainDef(form.value.chain))
// Warn loudly when the pasted address does not look like the chain selected.
const mismatch = computed(() => {
  if (!form.value.address.trim()) return []
  return chainMismatch(form.value.chain, form.value.address)
})
// The secret check runs as you type, before anything is saved anywhere — the
// input is never written to a draft or a log either way.
const secretWarning = computed(() => rejectSecret(form.value.address))

function resetForm() {
  form.value = {
    label: '',
    chain: 'BTC',
    network: 'mainnet',
    address: '',
    memoTag: '',
    notes: '',
  }
  formError.value = ''
}

function onSave() {
  const { id, error } = app.addWallet({
    label: form.value.label,
    chain: form.value.chain,
    network: form.value.network,
    address: form.value.address,
    memoTag: form.value.memoTag,
    notes: form.value.notes,
  })
  if (!id) {
    formError.value = error
    return
  }
  adding.value = false
  resetForm()
}

// Copy the FULL address, then show the first-6/last-6 alongside the
// confirmation so it can be checked against the destination by eye.
async function onCopy(wallet: Wallet) {
  const ok = await copyText(wallet.address)
  if (!ok) {
    app.showToastMsg('Could not copy — select the address and copy manually')
    return
  }
  const { head, tail } = copyVerification(wallet.address)
  app.showToastMsg(`Copied · ${head}…${tail}`)
}

function explorerFor(wallet: Wallet): string | null {
  return explorerUrl(wallet.chain, wallet.address, wallet.network)
}

// --- inline edit -------------------------------------------------------------
function beginEdit(wallet: Wallet) {
  editingId.value = wallet.id
  editError.value = ''
  editDraft.value = {
    label: wallet.label,
    address: wallet.address,
    memoTag: wallet.memoTag ?? '',
    notes: wallet.notes,
  }
}
function saveEdit(wallet: Wallet) {
  const { ok, error } = app.updateWallet(wallet.id, {
    label: editDraft.value.label,
    address: editDraft.value.address,
    memoTag: editDraft.value.memoTag,
    notes: editDraft.value.notes,
  })
  if (!ok) {
    editError.value = error
    return
  }
  editingId.value = null
}

// --- delete, always naming what is about to go ------------------------------
function confirmDelete(wallet: Wallet) {
  confirmingId.value = wallet.id
}
function reallyDelete(wallet: Wallet) {
  confirmingId.value = null
  app.removeWallet(wallet.id)
}

// --- drag reorder ------------------------------------------------------------
const ordered = computed(() => [...wallets.value].sort((a, b) => a.order - b.order))
function onDragStart(wallet: Wallet) {
  dragId.value = wallet.id
}
function onDrop(target: Wallet) {
  if (dragId.value === null || dragId.value === target.id) {
    dragId.value = null
    return
  }
  app.moveWallet(
    dragId.value,
    ordered.value.findIndex((w) => w.id === target.id),
  )
  dragId.value = null
}

// --- share receive details ---------------------------------------------------
async function shareDetails(wallet: Wallet) {
  const ok = await copyText(receiveBlock(wallet))
  app.showToastMsg(ok ? 'Receive details copied' : 'Could not copy the receive details')
}

// ---- styles ----------------------------------------------------------------
const groupHead = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    ...typeStep('xs'),
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
    marginTop: 4,
  }),
)
function chainGlyph(color: string) {
  return pxify({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    flexShrink: 0,
    ...typeStep('xs'),
    color,
    border: '1px solid ' + color,
    background: 'color-mix(in oklch, ' + color + ' 14%, transparent)',
  })
}
const row = pxify({ display: 'flex', alignItems: 'center', gap: 10 })
const addrStyle = computed(() =>
  pxify({
    fontFamily: 'var(--font-mono)',
    ...typeStep('xs'),
    color: c.value.dim,
  }),
)
const warnBox = (col: string) =>
  pxify({
    ...typeStep('xs'),
    padding: '6px 9px',
    borderRadius: 9,
    border: '1px solid ' + col,
    background: 'color-mix(in oklch, ' + col + ' 14%, transparent)',
    color: c.value.text,
  })
const gripStyle = computed(() =>
  pxify({
    cursor: 'grab',
    color: c.value.dim,
    ...typeStep('xs'),
    flexShrink: 0,
    letterSpacing: '-2px',
  }),
)
const defaultChip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 6px',
    borderRadius: 6,
    color: c.value.accent,
    border: '1px solid ' + c.value.accent,
    whiteSpace: 'nowrap',
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <div :style="row">
      <span :style="s.finMeta">
        Public receive addresses only. Never paste a private key or seed phrase.
      </span>
      <span style="flex: 1"></span>
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="adding = !adding">
        {{ adding ? 'Cancel' : 'Add wallet' }}
      </button>
    </div>

    <!-- ---- add form ---------------------------------------------------- -->
    <div v-if="adding" :style="s.ghRepoCard">
      <div :style="s.inputRow">
        <input :style="s.input" placeholder="Label (e.g. Cold storage)" v-model="form.label" />
        <select :style="s.select" v-model="form.chain">
          <option v-for="ch in CHAINS" :key="ch.key" :value="ch.key">
            {{ ch.glyph }} {{ ch.name }}
          </option>
        </select>
        <select :style="s.select" v-model="form.network">
          <option value="mainnet">Mainnet</option>
          <option value="testnet">Testnet</option>
        </select>
      </div>
      <input
        :style="s.input"
        placeholder="Public address"
        v-model="form.address"
        spellcheck="false"
      />
      <input
        v-if="selectedDef?.memo"
        :style="s.input"
        :placeholder="selectedDef.memo === 'tag' ? 'Destination tag' : 'Memo'"
        v-model="form.memoTag"
      />
      <input :style="s.input" placeholder="Notes (optional)" v-model="form.notes" />

      <div v-if="secretWarning" :style="warnBox('oklch(0.65 0.22 25)')">
        <strong>{{ secretWarning }}.</strong> Nothing you typed has been saved. This app only ever
        stores public addresses.
      </div>
      <div v-else-if="mismatch.length" :style="warnBox('oklch(0.75 0.16 65)')">
        That looks like a {{ mismatch.map((m) => chainName(m)).join(' / ') }} address, not
        {{ chainName(form.chain) }}. Check before saving.
      </div>
      <div v-if="formError" :style="warnBox('oklch(0.65 0.22 25)')">{{ formError }}</div>

      <div :style="s.dialogActions">
        <button :style="s.saveBtn" @click="onSave">Save wallet</button>
        <button :style="s.cancelBtn" @click="((adding = false), resetForm())">Cancel</button>
      </div>
    </div>

    <div v-if="!wallets.length && !adding" :style="s.empty">
      No wallets yet. Add a public receive address to keep it handy.
    </div>

    <!-- ---- list, grouped by chain -------------------------------------- -->
    <div class="stagger-in" :style="s.list">
      <template v-for="group in groups" :key="group.chain">
        <div :style="groupHead">
          <span :style="chainGlyph(group.def?.color || c.accent)">{{ group.def?.glyph }}</span>
          {{ chainName(group.chain) }}
        </div>
        <div
          v-for="wallet in group.list"
          :key="wallet.id"
          :style="s.ghRepoCard"
          draggable="true"
          @dragstart="onDragStart(wallet)"
          @dragover.prevent
          @drop="onDrop(wallet)"
        >
          <div :style="row">
            <span :style="gripStyle" title="Drag to reorder">⋮⋮</span>
            <div :style="s.taskMain">
              <div :style="row">
                <span :style="s.dlTitle">{{ wallet.label }}</span>
                <span v-if="wallet.isDefault" :style="defaultChip">default</span>
                <span v-if="wallet.network === 'testnet'" :style="defaultChip">testnet</span>
              </div>
              <span :style="addrStyle">{{ truncateAddress(wallet.address) }}</span>
              <span v-if="wallet.memoTag" :style="s.finMeta">
                {{ group.def?.memo === 'tag' ? 'tag' : 'memo' }} {{ wallet.memoTag }}
              </span>
              <span v-if="wallet.notes" :style="s.finMeta">{{ wallet.notes }}</span>
              <span v-if="wallet.balanceEnabled" :style="s.finMeta">
                <template v-if="wallet.balance?.error">{{ wallet.balance.error }}</template>
                <template v-else-if="wallet.balance">
                  {{ wallet.balance.amount }} {{ wallet.balance.symbol }}
                </template>
                <template v-else>balance…</template>
              </span>
            </div>
            <button :style="s.importBtn" title="Copy full address" @click="onCopy(wallet)">
              Copy
            </button>
            <button :style="s.importBtn" title="Show QR" @click="qrWallet = wallet">QR</button>
            <a
              v-if="explorerFor(wallet)"
              :style="s.prLink"
              :href="explorerFor(wallet) as string"
              target="_blank"
              rel="noopener noreferrer"
              title="Open in explorer"
              >↗</a
            >
            <button :style="s.editBtn" @click="beginEdit(wallet)">Edit</button>
          </div>

          <!-- inline edit -->
          <template v-if="editingId === wallet.id">
            <input :style="s.input" placeholder="Label" v-model="editDraft.label" />
            <input
              :style="s.input"
              placeholder="Public address"
              v-model="editDraft.address"
              spellcheck="false"
            />
            <input
              v-if="group.def?.memo"
              :style="s.input"
              :placeholder="group.def.memo === 'tag' ? 'Destination tag' : 'Memo'"
              v-model="editDraft.memoTag"
            />
            <input :style="s.input" placeholder="Notes" v-model="editDraft.notes" />
            <div v-if="editError" :style="warnBox('oklch(0.65 0.22 25)')">{{ editError }}</div>
            <div :style="s.dialogActions">
              <button :style="s.saveBtn" @click="saveEdit(wallet)">Save</button>
              <button :style="s.editBtn" @click="editingId = null">Cancel</button>
              <button
                v-if="!wallet.isDefault"
                :style="s.editBtn"
                @click="app.setDefaultWallet(wallet.id)"
              >
                Make default
              </button>
              <button :style="s.editBtn" @click="shareDetails(wallet)">Share details</button>
              <button
                :style="s.editBtn"
                @click="app.setWalletBalanceEnabled(wallet.id, !wallet.balanceEnabled)"
              >
                {{ wallet.balanceEnabled ? 'Hide balance' : 'Show balance' }}
              </button>
              <button :style="s.cancelBtn" @click="confirmDelete(wallet)">Delete</button>
            </div>
          </template>

          <!-- delete confirmation, naming the wallet -->
          <div v-if="confirmingId === wallet.id" :style="warnBox('oklch(0.65 0.22 25)')">
            Delete "{{ wallet.label }}"? The address is only removed from this list.
            <button :style="s.cancelBtn" @click="reallyDelete(wallet)">Delete</button>
            <button :style="s.editBtn" @click="confirmingId = null">Keep</button>
          </div>
        </div>
      </template>
    </div>

    <WalletQrDialog v-if="qrWallet" :wallet="qrWallet" @close="qrWallet = null" />
  </div>
</template>

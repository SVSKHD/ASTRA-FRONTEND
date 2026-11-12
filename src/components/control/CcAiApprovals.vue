<script setup lang="ts">
// AI approvals (backend docs/26): the writes Claude asked to make — a paper trade,
// a draft — waiting for an admin. Each shows what would happen in full; Approve
// asks for the admin's password (the server checks it), Reject asks to confirm.
// Nothing runs until the server's executor does, after an approval.
//
// A link from a chat reply lands here with ?id=<approval>, which is scrolled to
// and outlined.
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import PanelHeader from '@/components/PanelHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import StatRow, { type Stat } from '@/components/ui/StatRow.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import {
  actionLabel,
  APPROVAL_STATUSES,
  decide,
  expiresIn,
  inr,
  listApprovals,
  loadPending,
  rewardRisk,
  STATUS_LABEL,
  STATUS_TONE,
  tradeOf,
  type AiApproval,
  type ApprovalStatus,
} from '@/ai/approvals'
import { agentLabel } from '@/ai/aureonChat'
import { useNow } from '@/control/poll'
import { when } from '@/trading/format'

const route = useRoute()
const now = useNow(30_000)

const status = ref<ApprovalStatus>('pending')
// Tabs, not a segmented control: the strip switches what is on screen (/ui → Tabs).
const statusTabs = APPROVAL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))
function pickStatus(v: string) {
  if ((APPROVAL_STATUSES as readonly string[]).includes(v)) status.value = v as ApprovalStatus
}

/** A paper trade's figures as the kit's StatRow shows them. */
function tradeStats(a: AiApproval): Stat[] {
  const t = tradeOf(a)
  if (!t) return []
  const rr = rewardRisk(t)
  return [
    { label: 'Symbol', value: t.symbol, note: t.side },
    { label: 'Quantity', value: t.qty },
    { label: 'Entry', value: inr(t.entry) },
    { label: 'Stop', value: inr(t.stop) },
    { label: 'Target', value: inr(t.target) },
    { label: 'Max loss', value: inr(t.riskInr), tone: 'negative' },
    { label: 'Size', value: inr(t.notionalInr), note: rr ? `reward : risk ${rr}` : undefined },
  ]
}
const items = shallowRef<AiApproval[]>([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await listApprovals(status.value)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(status, () => void load())

const focusId = computed(() => String(route.query.id ?? ''))
onMounted(async () => {
  await load()
  // A link to a decided request: find it under its own status.
  if (focusId.value && !items.value.some((a) => a.id === focusId.value)) {
    for (const s of APPROVAL_STATUSES) {
      if (s === status.value) continue
      const found = await listApprovals(s).catch(() => [] as AiApproval[])
      if (found.some((a) => a.id === focusId.value)) {
        status.value = s
        break
      }
    }
  }
  await nextTick()
  document.getElementById(`aia-${focusId.value}`)?.scrollIntoView?.({ block: 'center' })
})

// --- deciding ---------------------------------------------------------------------------------

const deciding = shallowRef<{ item: AiApproval; action: 'approve' | 'reject' } | null>(null)
const password = ref('')
const busy = ref(false)
const decideErr = ref('')
const notice = ref('')

function ask(item: AiApproval, action: 'approve' | 'reject') {
  deciding.value = { item, action }
  password.value = ''
  decideErr.value = ''
}
function cancel() {
  deciding.value = null
  password.value = ''
}
async function confirm() {
  const d = deciding.value
  if (!d) return
  if (d.action === 'approve' && !password.value) {
    decideErr.value = 'Enter your password to approve.'
    return
  }
  busy.value = true
  decideErr.value = ''
  try {
    const row = await decide(d.item.id, d.action, password.value)
    notice.value =
      d.action === 'reject'
        ? 'Rejected. Nothing was done.'
        : row.status === 'executed'
          ? tradeOf(row)
            ? 'Approved. A PAPER order intent was created; it still needs the paper approval.'
            : 'Approved and done.'
          : row.status === 'failed'
            ? `Approved, but it failed: ${row.error ?? 'no reason given'}`
            : `Approved (${row.status}).`
    cancel()
    await Promise.all([load(), loadPending()])
  } catch (e) {
    decideErr.value = (e as Error).message
  } finally {
    // Never keep the password around longer than the request.
    password.value = ''
    busy.value = false
  }
}

function resultText(a: AiApproval): string {
  const r = a.result as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object') return ''
  const intent = r.intent_id ?? r.order_intent_id ?? r.id
  if (intent) return `Paper intent ${String(intent)}`
  return Object.entries(r)
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join(' · ')
}
</script>

<template>
  <div class="tp-page">
    <PanelHeader title="AI approvals">
      <template #right>
        <button type="button" class="panel-action" :disabled="loading" @click="load">
          <Icon name="refresh-cw" size="sm" />Refresh
        </button>
      </template>
    </PanelHeader>
    <p class="tp-note">
      What Claude asked to do. Nothing happens until you approve it here, and an approved trade is
      only ever a <strong>PAPER</strong> order intent: the paper engine’s own risk check and
      approval still apply. Live trading stays off.
    </p>
    <Tabs
      :model-value="status"
      :tabs="statusTabs"
      aria-label="Status"
      class="aiap__status"
      @update:model-value="pickStatus"
    />
    <p v-if="notice" class="tp-note" role="status">{{ notice }}</p>

    <p v-if="error" class="tp-note" role="alert">{{ error }}</p>
    <Skeleton v-else-if="loading && !items.length" :lines="5" />
    <EmptyState
      v-else-if="!items.length"
      :title="status === 'pending' ? 'Nothing waiting for you' : `No ${status} requests`"
      :description="
        status === 'pending'
          ? 'When Claude proposes a trade or a draft, it waits here for your decision.'
          : 'Requests move here once they are decided or run out of time.'
      "
    />

    <GlassPanel
      v-for="a in items"
      :id="`aia-${a.id}`"
      :key="a.id"
      padding="md"
      class="aiap"
      :class="{ 'is-focus': a.id === focusId }"
      data-testid="ai-approval"
    >
      <header class="aiap__head">
        <Badge
          :tone="STATUS_TONE[a.status] ?? 'neutral'"
          :label="STATUS_LABEL[a.status as ApprovalStatus] ?? a.status"
        />
        <span class="aiap__kind">{{ actionLabel(a.action) }}</span>
        <span class="tp-note">{{ agentLabel(a.agent) }} agent · {{ when(a.created_at) }}</span>
        <span
          v-if="a.status === 'pending'"
          class="aiap__expiry"
          :class="{ 'is-soon': Date.parse(a.expires_at) - now < 30 * 60_000 }"
          >{{ expiresIn(a.expires_at, now) }}</span
        >
      </header>
      <p class="aiap__summary">{{ a.summary }}</p>

      <div v-if="tradeOf(a)" class="aiap__trade" data-testid="trade-details">
        <StatRow :stats="tradeStats(a)" />
      </div>
      <p v-if="tradeOf(a)?.reason" class="aiap__reason">
        <span class="aiap__reason-label">Reason</span>{{ tradeOf(a)!.reason }}
      </p>
      <details v-else-if="!tradeOf(a)" class="aiap__payload">
        <summary>Full request</summary>
        <pre>{{ JSON.stringify(a.payload, null, 2) }}</pre>
      </details>

      <p v-if="a.error" class="tp-note" role="alert">Failed: {{ a.error }}</p>
      <p v-else-if="resultText(a)" class="tp-note">{{ resultText(a) }}</p>
      <p v-if="a.decided_at" class="tp-note">Decided {{ when(a.decided_at) }}</p>

      <div v-if="a.status === 'pending'" class="tp-row">
        <Button size="sm" @click="ask(a, 'approve')">Approve…</Button>
        <Button size="sm" variant="secondary" @click="ask(a, 'reject')">Reject…</Button>
      </div>
    </GlassPanel>

    <Modal
      :open="!!deciding"
      :title="deciding?.action === 'approve' ? 'Approve this request?' : 'Reject this request?'"
      size="sm"
      @close="cancel"
    >
      <form v-if="deciding" class="cc-form" @submit.prevent="confirm">
        <p class="aiap__summary">{{ deciding.item.summary }}</p>
        <p v-if="deciding.action === 'approve' && tradeOf(deciding.item)" class="tp-note">
          This creates a <strong>PAPER</strong> order intent, not a live order. It still needs the
          paper approval.
        </p>
        <p v-else-if="deciding.action === 'reject'" class="tp-note">
          Claude is not told again; the request is closed and nothing is done.
        </p>
        <TextInput
          v-if="deciding.action === 'approve'"
          v-model="password"
          type="password"
          label="Your password"
          autocomplete="current-password"
          required
        />
        <p v-if="decideErr" class="cc-notice cc-notice--danger" role="alert">{{ decideErr }}</p>
        <div class="tp-row">
          <Button
            type="submit"
            :variant="deciding.action === 'approve' ? 'primary' : 'danger'"
            :loading="busy"
            >{{ deciding.action === 'approve' ? 'Approve' : 'Reject' }}</Button
          >
          <Button variant="ghost" @click="cancel">Cancel</Button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.aiap {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.aiap.is-focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 1px var(--theme-accent);
}
.aiap__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.aiap__kind {
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.aiap__expiry {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.aiap__expiry.is-soon {
  color: var(--theme-warning);
}
.aiap__summary {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.aiap__trade {
  min-width: 0;
}
.aiap__reason {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.aiap__reason-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.aiap__payload pre {
  min-width: 0;
  max-height: 16rem;
  margin: var(--sp-2) 0 0;
  overflow: auto;
  font-size: var(--text-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

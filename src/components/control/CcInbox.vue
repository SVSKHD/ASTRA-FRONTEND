<script setup lang="ts">
// The approval inbox: every pending gated operation (merge, force-push,
// production dispatch, …) with its kind, target, summary, artifact and expiry
// countdown. Approving asks for the admin's password, which the server checks
// (re-auth); a session cookie alone never approves. Denying takes a reason.
// Paper-trading intents waiting for approval are listed too, with a link to
// the trading panel's Paper tab, where they are approved.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { codeOf, must, short, type Schemas } from '@/control/api'
import { approvals, loadApprovals, type Approval } from '@/control/approvals'
import { countdown, useNow } from '@/control/poll'
import { approvalTone } from '@/control/status'
import { inbox as paper, loadInbox as loadPaper } from '@/trading/inbox'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const route = useRoute()
const router = useRouter()
const now = useNow(1000)
const focusId = computed(() => String(route.query.id ?? ''))

const recent = useLoad(async () =>
  must(await aureon.GET('/api/v1/approvals', { params: { query: { limit: 20 } } })).items.filter(
    (a) => a.status !== 'pending',
  ),
)
// A linked request that is no longer pending (approved elsewhere, expired).
const focused = useLoad(async () => {
  if (!focusId.value || approvals.items.some((a) => a.id === focusId.value)) return null
  return must(
    await aureon.GET('/api/v1/approvals/{approval_id}', {
      params: { path: { approval_id: focusId.value } },
    }),
  )
}, false)
watch([focusId, () => approvals.loaded], () => void focused.reload(), { immediate: true })
const paperInEngine = computed(() => approvals.items.some((a) => a.kind.startsWith('trading')))

function refresh() {
  void loadApprovals()
  void loadPaper()
}
const STREAM: Record<string, string> = {
  connecting: 'Live updates connecting…',
  open: 'Live updates on',
  reconnecting: 'Live updates reconnecting…',
  closed: 'Live updates off',
}
const liveLine = computed(() =>
  approvals.mode === 'engine'
    ? STREAM[approvals.stream]
    : 'Refreshing every 15 s while this page is visible.',
)

function summary(a: Approval): string {
  if (a.summary) return a.summary
  const p = a.payload as Record<string, unknown>
  if (typeof p.summary === 'string') return p.summary
  const art = (p.artifact ?? {}) as Record<string, unknown>
  const bits: string[] = []
  if (typeof p.merge_method === 'string') bits.push(`${p.merge_method} merge`)
  if (typeof art.base_ref === 'string') bits.push(`into ${art.base_ref}`)
  if (typeof art.head_sha === 'string') bits.push(`head ${short(art.head_sha)}`)
  if (typeof p.branch === 'string') bits.push(`branch ${p.branch}`)
  if (typeof p.sha === 'string') bits.push(`to ${short(p.sha)}`)
  if (typeof p.ref === 'string') bits.push(`on ${p.ref}`)
  return bits.join(' · ') || a.kind.replaceAll('.', ' ')
}
// Drift is checked on demand (`?check_drift=true` may call GitHub), and always
// again by the server right before anything runs.
const driftOf = ref<Record<string, Schemas['DriftOut'] | 'checking' | 'error'>>({})
async function checkDrift(a: Approval) {
  driftOf.value[a.id] = 'checking'
  try {
    const d = must(
      await aureon.GET('/api/v1/approvals/{approval_id}', {
        params: { path: { approval_id: a.id }, query: { check_drift: true } },
      }),
    )
    driftOf.value[a.id] = d.drift ?? { status: 'unknown', drifted: [], detail: null }
  } catch {
    driftOf.value[a.id] = 'error'
  }
}
function drift(a: Approval): { tone: 'success' | 'danger' | 'neutral'; text: string } {
  const d = driftOf.value[a.id]
  if (d === 'checking') return { tone: 'neutral', text: 'Checking the artifact…' }
  if (d === 'error') return { tone: 'neutral', text: 'Drift check failed' }
  if (!d) return { tone: 'neutral', text: 'Re-checked on approval' }
  if (d.status === 'ok') return { tone: 'success', text: 'Artifact unchanged' }
  if (d.status === 'drifted')
    return {
      tone: 'danger',
      text: `Artifact changed${d.drifted?.length ? `: ${d.drifted.join(', ')}` : ''}`,
    }
  return { tone: 'neutral', text: `Drift ${d.status.replaceAll('_', ' ')}` }
}
function riskTone(r: string) {
  return r === 'critical' || r === 'high' ? 'danger' : r === 'medium' ? 'warning' : 'neutral'
}
/** This session's re-auth stamp still counts for this request. */
function stampOk(a: Approval) {
  return a.reauth === 'session_stamp' || a.reauth === 'none'
}

// ── approve / deny ──────────────────────────────────────────────────────────
const target = ref<Approval | null>(null)
const mode = ref<'approve' | 'deny'>('approve')
const password = ref('')
const reason = ref('')
const busy = ref(false)
const error = ref('')
const done = ref('')
function start(a: Approval, m: 'approve' | 'deny') {
  target.value = a
  mode.value = m
  password.value = ''
  reason.value = ''
  error.value = ''
}
function close() {
  target.value = null
  password.value = ''
}

const CONFLICT: Record<string, string> = {
  approval_expired: 'This request expired before it was approved. File it again.',
  approval_already_used: 'This request was already used. It cannot run twice.',
  approval_not_pending: 'This request is no longer pending.',
  already_approved_by_you: 'You already approved this request; it waits for another admin.',
  approval_invalidated:
    'What was approved has changed since the request (for a merge: the head or the diff). Nothing ran; file it again.',
}

async function approve(useStamp = false) {
  const a = target.value
  if (!a || (!useStamp && !password.value)) return
  busy.value = true
  error.value = ''
  try {
    const {
      data,
      error: body,
      response,
    } = await aureon.POST('/api/v1/approvals/{approval_id}/approve', {
      params: { path: { approval_id: a.id } },
      body: useStamp ? { use_reauth: true } : { password: password.value, use_reauth: false },
    })
    const code = codeOf(body)
    if (data) {
      done.value =
        data.status === 'executed'
          ? `Approved and executed: ${a.kind} on ${a.target}.`
          : data.status === 'pending'
            ? `Your approval is recorded (${data.received_approvals} of ${data.required_approvals}); it waits for another admin.`
            : `Approved, but it failed when run: ${a.kind} on ${a.target}. See the result in recent decisions.`
      close()
    } else if (response.status === 403) {
      // Wrong password: the request stays pending, and the dialog stays open.
      error.value =
        code === 'self_approval_not_allowed'
          ? 'You filed this request, and the policy needs another admin to approve it.'
          : code === 'reauth_required'
            ? 'Your re-auth has lapsed for this request. Enter your password.'
            : 'That password is not right. The request is still pending.'
      password.value = ''
    } else if (response.status === 409) {
      done.value = CONFLICT[code] ?? 'This request can no longer be approved.'
      close()
    } else if (response.status === 503) {
      error.value =
        'The server cannot run this right now (not configured). The request is still pending.'
    } else {
      must({ data, error: body, response })
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    password.value = ''
    busy.value = false
    await Promise.all([loadApprovals(), recent.reload()])
  }
}

async function deny() {
  const a = target.value
  if (!a) return
  busy.value = true
  error.value = ''
  try {
    const r = await aureon.POST('/api/v1/approvals/{approval_id}/deny', {
      params: { path: { approval_id: a.id } },
      body: { reason: reason.value.trim() || null },
    })
    if (r.response.status === 409)
      done.value = CONFLICT[codeOf(r.error)] ?? 'This request is no longer pending.'
    else {
      must(r)
      done.value = `Denied: ${a.kind} on ${a.target}.`
    }
    close()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
    await Promise.all([loadApprovals(), recent.reload()])
  }
}
</script>

<template>
  <div class="tp-page">
    <div class="tp-head">
      <span class="tp-note" role="status">{{ liveLine }}</span>
      <Button size="sm" variant="ghost" :loading="approvals.loading" @click="refresh"
        >Refresh</Button
      >
    </div>
    <p v-if="done" class="tp-note" role="status">{{ done }}</p>
    <p v-if="approvals.error" class="tp-note" role="alert">{{ approvals.error }}</p>

    <Card :title="`Waiting for approval (${approvals.items.length})`">
      <ul v-if="approvals.items.length" class="tp-list">
        <li
          v-for="a in approvals.items"
          :key="a.id"
          class="cc-stack cc-approval"
          :class="{ 'is-focus': a.id === focusId }"
        >
          <div class="tp-head">
            <span class="tp-strong">{{ a.kind }}</span>
            <Badge
              :tone="countdown(a.expires_at, now) === 'expired' ? 'danger' : 'warning'"
              :label="`expires in ${countdown(a.expires_at, now)}`"
            />
          </div>
          <span class="tp-note">{{ a.target }}</span>
          <p class="cc-body">{{ summary(a) }}</p>
          <div class="tp-row">
            <Badge :tone="riskTone(a.risk_level)" :label="`risk ${a.risk_level}`" />
            <Badge
              v-if="a.required_approvals > 1"
              tone="info"
              :label="`${a.received_approvals} of ${a.required_approvals} approvals`"
            />
            <Badge :tone="drift(a).tone" :label="drift(a).text" />
            <Button
              v-if="approvals.mode === 'engine'"
              size="sm"
              variant="ghost"
              :disabled="driftOf[a.id] === 'checking'"
              @click="checkDrift(a)"
              >Check drift</Button
            >
            <span class="tp-note"
              >artifact {{ short(a.artifact_sha256) }} · requested by {{ a.requested_by ?? '—' }}
              {{ ago(a.created_at, now) }}</span
            >
          </div>
          <div class="tp-row">
            <Button size="sm" variant="primary" @click="start(a, 'approve')">Approve…</Button>
            <Button size="sm" variant="ghost" @click="start(a, 'deny')">Deny…</Button>
          </div>
        </li>
      </ul>
      <EmptyState
        v-else-if="approvals.loaded"
        title="Nothing is waiting for approval"
        description="A merge, a force-push or a production workflow run lands here until an admin approves it."
      />
    </Card>

    <Card v-if="focused.data.value" title="Linked request">
      <div class="tp-row">
        <Badge :tone="approvalTone(focused.data.value.status)" :label="focused.data.value.status" />
        <span class="tp-strong"
          >{{ focused.data.value.kind }} · {{ focused.data.value.target }}</span
        >
      </div>
      <ul class="tp-list">
        <li v-for="e in focused.data.value.events" :key="e.id" class="tp-item">
          <span class="tp-note">{{ e.event }} · {{ e.actor ?? '—' }} · {{ when(e.at) }}</span>
        </li>
      </ul>
    </Card>

    <Card v-if="!paperInEngine" :title="`Paper trading (${paper.items.length})`">
      <ul v-if="paper.items.length" class="tp-list">
        <li v-for="i in paper.items" :key="i.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong"
              >{{ i.side }} {{ i.quantity }} · instrument {{ i.instrument_id }}</span
            >
            <span class="tp-note">{{ i.order_type }} · {{ ago(i.created_at, now) }}</span>
          </div>
          <Badge tone="warning" label="PENDING_RISK" />
        </li>
      </ul>
      <p v-else class="tp-note">No paper order is waiting for approval.</p>
      <div class="tp-row">
        <Button size="sm" variant="secondary" @click="router.push('/trading/paper')"
          >Open the Paper tab</Button
        >
        <span class="tp-note">Paper fills are simulated and approved on the Paper tab.</span>
      </div>
    </Card>

    <Card title="Recent decisions">
      <ul v-if="recent.data.value?.length" class="tp-list">
        <li v-for="a in recent.data.value" :key="a.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ a.kind }} · {{ a.target }}</span>
            <span class="tp-note"
              >{{ a.decided_by ?? '—' }} · {{ when(a.decided_at ?? a.created_at) }}</span
            >
          </div>
          <Badge :tone="approvalTone(a.status)" :label="a.status" />
        </li>
      </ul>
      <p v-else-if="recent.error.value" class="tp-note" role="alert">{{ recent.error.value }}</p>
      <p v-else-if="!recent.loading.value" class="tp-note">No request has been decided yet.</p>
    </Card>

    <Modal
      :open="!!target"
      :title="mode === 'approve' ? 'Approve with your password' : 'Deny this request'"
      size="sm"
      @close="close"
    >
      <form v-if="target" class="cc-form" @submit.prevent="mode === 'approve' ? approve() : deny()">
        <p class="tp-note">{{ target.kind }} on {{ target.target }}: {{ summary(target) }}</p>
        <template v-if="mode === 'approve'">
          <p class="tp-note">
            The server checks your password before anything runs, and re-checks the artifact ({{
              short(target.artifact_sha256)
            }}). It is sent once and never stored.
          </p>
          <TextInput
            v-model="password"
            type="password"
            placeholder="Password"
            aria-label="Password"
          />
        </template>
        <TextArea
          v-else
          v-model="reason"
          :rows="3"
          placeholder="Why (optional)"
          aria-label="Reason"
        />
        <p v-if="error" class="tp-note" role="alert">{{ error }}</p>
        <div class="tp-row">
          <Button
            type="submit"
            :variant="mode === 'approve' ? 'primary' : 'danger'"
            :loading="busy"
            :disabled="mode === 'approve' && !password"
            >{{ mode === 'approve' ? 'Approve and run' : 'Deny' }}</Button
          >
          <Button
            v-if="mode === 'approve' && stampOk(target)"
            variant="secondary"
            :loading="busy"
            @click="approve(true)"
            >Approve without the password</Button
          >
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.cc-approval {
  padding: var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}
.cc-approval.is-focus {
  border-color: var(--theme-accent);
}
</style>

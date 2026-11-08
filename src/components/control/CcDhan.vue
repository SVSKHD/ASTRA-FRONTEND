<script setup lang="ts">
// Dhan ops (/dev/dhan): connection and feed health, incidents and recovery,
// the feed worker, and approvals that touch Dhan or trading, on one page.
//
// Everything is read from the backend (src/control/dhanOps.ts lists the
// sources); nothing is mocked or inferred. Actions are only the ones the
// backend authorizes for admins: Connect/Reconnect Dhan, pause/resume the feed
// worker (POST /api/agents/{id}/pause|resume), and mark an incident resolved or
// ignored. Each result is the server's answer, re-read after the call, so a
// recovery never reads as successful before the backend says so.
//
// Approvals open in the approval inbox, where the server checks the admin's
// password; a click here is never enough to approve. An expired or decided
// request has no action. Market-data requests are marked read-only; trading
// ones are marked as trading. No order is generated or submitted here.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import CcDhanAccount from '@/components/control/CcDhanAccount.vue'
import DhanSessionBar from '@/components/control/DhanSessionBar.vue'
import LogViewer from '@/components/control/LogViewer.vue'
import { aureon } from '@/api/client'
import { must } from '@/control/api'
import { approvals } from '@/control/approvals'
import { activeDhan } from '@/control/dhanAccount'
import {
  actionable,
  approvalAccount,
  approvalScope,
  dhanApprovals,
  feedAgent,
  isDhanIncident,
  opsState,
  redact,
  SCOPE_LABEL,
  type Agent,
} from '@/control/dhanOps'
import { loadIntegrations, type DhanSection } from '@/control/integrations'
import { countdown, usePoll, useNow } from '@/control/poll'
import { agentTone, approvalTone, repairTone } from '@/control/status'
import { dhanChecks, LEVEL_LABEL, LEVEL_TONE } from '@/trading/dhanHealth'
import { ago, when } from '@/trading/format'
import { connect, disconnect, live } from '@/trading/stream'
import { useLoad } from '@/trading/useLoad'
import { readWatchlist } from '@/trading/watchlist'

const router = useRouter()
const now = useNow(1000)

// --- reads ------------------------------------------------------------------------------------
const session = useLoad(async () => must(await aureon.GET('/api/v1/dhan/auth/status')))
const integration = useLoad(async () => {
  const r = await loadIntegrations((p) => aureon.GET(p))
  if (!r.data) throw new Error(`Aureon answered ${r.status}`)
  return (r.data.integrations?.dhan as DhanSection | undefined) ?? null
})
// The last successful read of the account list found no active Dhan account.
const noAccount = ref(false)
const account = useLoad(async () => {
  const list = must(
    await aureon.GET('/api/trading/accounts', { params: { query: { limit: 500 } } }),
  )
  const a = activeDhan(list.items)
  noAccount.value = !a
  if (!a) return null
  const p = { params: { path: { account_id: a.id } } }
  const [h, f] = await Promise.all([
    aureon.GET('/api/trading/accounts/{account_id}/health', p),
    aureon.GET('/api/trading/accounts/{account_id}/funds', p),
  ])
  return {
    id: a.id,
    health: h.data ?? null,
    fundsAsOf: f.data?.as_of ?? null,
    fundsError: f.data ? '' : `Aureon answered ${f.response.status}`,
  }
})
const agents = useLoad(async () => must(await aureon.GET('/api/agents')).agents)
const incidents = useLoad(async () =>
  must(
    await aureon.GET('/api/v1/repairs/incidents', { params: { query: { limit: 200 } } }),
  ).items.filter(isDhanIncident),
)
const decided = useLoad(async () =>
  dhanApprovals(
    must(await aureon.GET('/api/v1/approvals', { params: { query: { limit: 100 } } })).items,
  ).filter((a) => a.status !== 'pending'),
)

const sessionBar = ref<InstanceType<typeof DhanSessionBar> | null>(null)
function refresh() {
  void session.reload()
  void integration.reload()
  void account.reload()
  void agents.reload()
  void incidents.reload()
  void decided.reload()
}
usePoll(refresh, 15_000)

// Ticks for the freshness check: this page holds the tab's one stream while open.
onMounted(() => connect(readWatchlist().map((w) => w.id)))
onBeforeUnmount(disconnect)

// Registration (CcDhanAccount): offered only once the list was read and holds no
// active Dhan account; kept on screen after a registration to show its mode.
const justRegistered = ref(false)
const showRegister = computed(() => justRegistered.value || noAccount.value)
function onRegistered() {
  justRegistered.value = true
  refresh()
  void sessionBar.value?.refresh()
}
function onExists() {
  refresh()
  void sessionBar.value?.refresh()
}

// --- derived ----------------------------------------------------------------------------------
const checks = computed(() =>
  dhanChecks({
    session: session.data.value ?? null,
    integration: integration.data.value ?? null,
    admin: true,
    hasAccount: !!account.data.value,
    health: account.data.value?.health ?? null,
    fundsAsOf: account.data.value?.fundsAsOf ?? null,
    fundsError: account.data.value?.fundsError ?? '',
    quotes: Object.values(live.quotes),
    now: now.value,
  }),
)
const allIncidents = computed(() => incidents.data.value ?? [])
const ops = computed(() => opsState(checks.value, allIncidents.value, now.value))
const needsAuth = computed(() => {
  const s = session.data.value
  if (!s || !s.client_id_set) return false
  return s.source === 'none' || s.expires_soon || checks.value.some((c) => c.level === 'auth')
})
const worker = computed<Agent | null>(() => feedAgent(agents.data.value ?? []))
const reconcile = computed(() => integration.data.value?.reconcile ?? null)

const incidentView = ref<'active' | 'history'>('active')
const shownIncidents = computed(() =>
  allIncidents.value.filter((i) =>
    incidentView.value === 'active'
      ? ['open', 'recovering', 'repair_queued'].includes(i.status)
      : true,
  ),
)
const pendingApprovals = computed(() => dhanApprovals(approvals.items))

// --- incident detail ----------------------------------------------------------------------------
const openIncident = ref('')
const detail = useLoad(async () => {
  if (!openIncident.value) return null
  return must(
    await aureon.GET('/api/v1/repairs/incidents/{incident_id}', {
      params: { path: { incident_id: openIncident.value } },
    }),
  )
}, false)
watch(openIncident, () => void detail.reload())
const diagnostics = computed(() =>
  detail.data.value ? JSON.stringify(redact(detail.data.value.details), null, 2) : '',
)

// --- actions (each confirmed, each result re-read from the server) ------------------------------
type Pending =
  | { kind: 'agent'; id: string; name: string; to: 'pause' | 'resume' }
  | { kind: 'incident'; id: string; title: string; to: 'resolve' | 'ignore' }
const pending = ref<Pending | null>(null)
const busy = ref(false)
const result = ref<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null)

async function confirmAction() {
  const p = pending.value
  if (!p) return
  busy.value = true
  result.value = null
  try {
    if (p.kind === 'agent') {
      const path = { agent_id: p.id }
      must(
        p.to === 'pause'
          ? await aureon.POST('/api/agents/{agent_id}/pause', { params: { path } })
          : await aureon.POST('/api/agents/{agent_id}/resume', { params: { path } }),
      )
      await agents.reload()
      const a = (agents.data.value ?? []).find((x) => x.id === p.id)
      result.value = {
        tone: 'info',
        text: `${p.to === 'pause' ? 'Pause' : 'Resume'} sent to ${p.name}. The server now reports it ${a ? `${a.state}${a.paused ? ' (paused)' : ''}` : 'unreadable'}; a running feed is confirmed by its next heartbeat and ticks.`,
      }
    } else {
      const params = { params: { path: { incident_id: p.id } } }
      const d = must(
        p.to === 'resolve'
          ? await aureon.POST('/api/v1/repairs/incidents/{incident_id}/resolve', params)
          : await aureon.POST('/api/v1/repairs/incidents/{incident_id}/ignore', params),
      )
      await incidents.reload()
      result.value = {
        tone: d.status === 'resolved' ? 'success' : 'info',
        text: `${p.title}: the server now reports it ${d.status}.`,
      }
    }
  } catch (e) {
    result.value = { tone: 'danger', text: `Refused: ${(e as Error).message}` }
  } finally {
    busy.value = false
    pending.value = null
  }
}

function review(id: string) {
  void router.push({ path: '/dev/inbox', query: { id } })
}
function riskTone(r: string) {
  return r === 'critical' || r === 'high' ? 'danger' : r === 'medium' ? 'warning' : 'neutral'
}
</script>

<template>
  <div class="tp-page">
    <Card data-testid="dhan-ops-state">
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Dhan operations</span>
          <div class="tp-row">
            <Badge :tone="ops.tone" :label="ops.label" data-testid="ops-badge" />
            <Button size="sm" variant="ghost" @click="refresh">Refresh</Button>
          </div>
        </div>
      </template>
      <p class="tp-note" role="status">{{ ops.text }}</p>
      <p class="tp-note">
        Market data is read-only. Trading operations are labelled as such and only run through the
        server's approval workflow; nothing here places an order.
      </p>
    </Card>

    <Alert v-if="needsAuth" tone="danger" data-testid="auth-alert">
      Dhan needs an operator: the session is missing, expired, expiring or refused. Reconnect below;
      Dhan's own page asks for the login, never this one.
    </Alert>
    <DhanSessionBar ref="sessionBar" admin detailed @changed="refresh" />
    <CcDhanAccount v-if="showRegister" @registered="onRegistered" @exists="onExists" />
    <p v-if="result" class="tp-note" :role="result.tone === 'danger' ? 'alert' : 'status'">
      {{ result.text }}
    </p>

    <div class="tp-grid">
      <Card title="Health checks">
        <ul class="tp-list">
          <li v-for="c in checks" :key="c.key" class="tp-item" :data-check="c.key">
            <div class="tp-main">
              <span class="tp-strong">{{ c.label }}</span>
              <span class="tp-note">{{ c.text }}</span>
            </div>
            <Badge :tone="LEVEL_TONE[c.level]" :label="LEVEL_LABEL[c.level]" />
          </li>
        </ul>
        <p v-if="integration.data.value?.problems?.length" class="tp-note" role="alert">
          The server reports: {{ integration.data.value.problems.join('; ') }}.
        </p>
      </Card>

      <Card title="Feed worker">
        <template v-if="worker">
          <div class="tp-row">
            <Badge :tone="agentTone(worker.state)" :label="worker.state" />
            <span class="tp-strong">{{ worker.name }}</span>
            <span v-if="worker.paused" class="tp-note">paused by an admin</span>
          </div>
          <dl class="cc-dhan__facts">
            <div>
              <dt>Last heartbeat</dt>
              <dd>
                {{ worker.last_heartbeat_at ? when(worker.last_heartbeat_at) : 'never' }}
                <span class="tp-note">({{ ago(worker.last_heartbeat_at, now) }})</span>
              </dd>
            </div>
            <div>
              <dt>Last activity</dt>
              <dd>{{ worker.last_activity_at ? when(worker.last_activity_at) : '—' }}</dd>
            </div>
            <div>
              <dt>Reported state</dt>
              <dd>{{ worker.reported_state }}</dd>
            </div>
            <div>
              <dt>Host · version</dt>
              <dd>{{ worker.host ?? '—' }} · {{ worker.version ?? '—' }}</dd>
            </div>
            <div>
              <dt>Last reconcile</dt>
              <dd>
                {{ reconcile?.last_status ?? 'not reported' }}
                <span v-if="reconcile?.last_run_at" class="tp-note">{{
                  ago(reconcile.last_run_at, now)
                }}</span>
              </dd>
            </div>
            <div>
              <dt>Last successful Dhan connection</dt>
              <dd class="tp-note">
                Not reported by the server (the heartbeat is the nearest signal).
              </dd>
            </div>
          </dl>
          <div class="tp-row">
            <Button
              size="sm"
              variant="secondary"
              :disabled="busy"
              @click="
                pending = {
                  kind: 'agent',
                  id: worker.id,
                  name: worker.name,
                  to: worker.paused ? 'resume' : 'pause',
                }
              "
              >{{ worker.paused ? 'Resume worker' : 'Pause worker' }}</Button
            >
          </div>
        </template>
        <p v-else-if="agents.error.value" class="tp-note" role="alert">{{ agents.error.value }}</p>
        <EmptyState
          v-else-if="!agents.loading.value"
          title="No Dhan feed worker is registered"
          description="The dhan-feed agent registers when it starts (is “dhan” in COMPOSE_PROFILES?)."
        />
      </Card>
    </div>

    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Incidents and recovery</span>
          <SegmentedControl
            v-model="incidentView"
            size="sm"
            aria-label="Incidents"
            :options="[
              { value: 'active', label: 'Active' },
              { value: 'history', label: 'History' },
            ]"
          />
        </div>
      </template>
      <ul v-if="shownIncidents.length" class="tp-list">
        <li v-for="i in shownIncidents" :key="i.id" class="cc-stack cc-dhan__incident">
          <div class="tp-head">
            <span class="tp-strong">{{ i.title }}</span>
            <Badge :tone="repairTone(i.status)" :label="i.status" />
          </div>
          <span class="tp-note"
            >{{ i.source }} · {{ i.severity }} · seen {{ i.count }}× · first
            {{ when(i.first_seen) }} · last {{ ago(i.last_seen, now) }}</span
          >
          <span class="tp-note"
            >Recovery attempts: {{ i.recovery_attempts
            }}{{ i.last_recovery_at ? ` · last ${ago(i.last_recovery_at, now)}` : '' }}
            ·
            {{
              i.resolved_at ? `resolved ${when(i.resolved_at)} (server-confirmed)` : 'not resolved'
            }}</span
          >
          <div class="tp-row">
            <Button
              size="sm"
              variant="ghost"
              @click="openIncident = openIncident === i.id ? '' : i.id"
              >{{ openIncident === i.id ? 'Hide details' : 'Diagnostics' }}</Button
            >
            <template v-if="!['resolved', 'ignored'].includes(i.status)">
              <Button
                size="sm"
                variant="ghost"
                :disabled="busy"
                @click="pending = { kind: 'incident', id: i.id, title: i.title, to: 'resolve' }"
                >Mark resolved</Button
              >
              <Button
                size="sm"
                variant="ghost"
                :disabled="busy"
                @click="pending = { kind: 'incident', id: i.id, title: i.title, to: 'ignore' }"
                >Ignore</Button
              >
            </template>
          </div>
          <template v-if="openIncident === i.id">
            <p v-if="detail.error.value" class="tp-note" role="alert">{{ detail.error.value }}</p>
            <template v-else-if="detail.data.value">
              <LogViewer :text="diagnostics" label="Incident details (credentials redacted)" />
              <p class="tp-note">
                Repairs: {{ detail.data.value.repairs?.length ?? 0 }}
                <template v-for="r in detail.data.value.repairs ?? []" :key="r.id">
                  · {{ r.status }} {{ ago(r.created_at, now) }}</template
                >
              </p>
            </template>
          </template>
        </li>
      </ul>
      <p v-else-if="incidents.error.value" class="tp-note" role="alert">
        {{ incidents.error.value }}
      </p>
      <EmptyState
        v-else-if="!incidents.loading.value"
        :title="incidentView === 'active' ? 'No active Dhan incident' : 'No Dhan incident recorded'"
        description="Incidents come from the server's self-repair detectors and are matched to Dhan by their title or fingerprint."
      />
    </Card>

    <Card :title="`Approvals (${pendingApprovals.length} waiting)`">
      <ul v-if="pendingApprovals.length" class="tp-list">
        <li v-for="a in pendingApprovals" :key="a.id" class="cc-stack cc-dhan__approval">
          <div class="tp-head">
            <span class="tp-strong">{{ a.summary || a.kind }}</span>
            <Badge
              :tone="approvalScope(a) === 'trading' ? 'danger' : 'info'"
              :label="SCOPE_LABEL[approvalScope(a)]"
            />
          </div>
          <span class="tp-note"
            >Action {{ a.kind }} · account {{ approvalAccount(a) }} · requested
            {{ ago(a.created_at, now) }}</span
          >
          <div class="tp-row">
            <Badge :tone="riskTone(a.risk_level)" :label="`risk ${a.risk_level}`" />
            <Badge
              :tone="actionable(a, now) ? 'warning' : 'danger'"
              :label="actionable(a, now) ? `expires in ${countdown(a.expires_at, now)}` : 'expired'"
            />
            <Badge
              v-if="a.required_approvals > 1"
              tone="info"
              :label="`${a.received_approvals} of ${a.required_approvals} approvals`"
            />
          </div>
          <div class="tp-row">
            <Button
              size="sm"
              variant="primary"
              :disabled="!actionable(a, now)"
              @click="review(a.id)"
              >Review to approve or deny</Button
            >
            <span class="tp-note">The inbox asks for your password; the server decides.</span>
          </div>
        </li>
      </ul>
      <EmptyState
        v-else-if="approvals.loaded"
        title="No Dhan or trading request is waiting"
        description="Requests that touch Dhan or trading land here and in the approval inbox."
      />
      <p v-if="approvals.error" class="tp-note" role="alert">{{ approvals.error }}</p>

      <template v-if="decided.data.value?.length">
        <h3 class="tp-title">Recent decisions</h3>
        <ul class="tp-list">
          <li v-for="a in decided.data.value.slice(0, 10)" :key="a.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ a.kind }} · {{ approvalAccount(a) }}</span>
              <span class="tp-note"
                >{{ SCOPE_LABEL[approvalScope(a)] }} · {{ when(a.decided_at ?? a.created_at)
                }}{{
                  a.executed_at ? ` · executed ${when(a.executed_at)}` : ' · not executed'
                }}</span
              >
            </div>
            <Badge :tone="approvalTone(a.status)" :label="a.status" />
          </li>
        </ul>
      </template>
    </Card>

    <Modal :open="!!pending" title="Confirm" size="sm" @close="pending = null">
      <div v-if="pending" class="cc-form">
        <p v-if="pending.kind === 'agent'" class="tp-note">
          {{ pending.to === 'pause' ? 'Pause' : 'Resume' }} {{ pending.name }}.
          {{
            pending.to === 'pause'
              ? 'Ticks stop until it is resumed.'
              : 'The server decides whether it runs; this page shows its reported state after.'
          }}
          Read-only market data; no order is affected.
        </p>
        <p v-else class="tp-note">
          {{ pending.to === 'resolve' ? 'Mark resolved' : 'Ignore' }}: {{ pending.title }}. This
          records an operator decision; it does not fix anything by itself.
        </p>
        <div class="tp-row">
          <Button variant="primary" :loading="busy" @click="confirmAction">Confirm</Button>
          <Button variant="secondary" @click="pending = null">Cancel</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.cc-dhan__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: var(--sp-2);
  margin: var(--sp-2) 0;
}

.cc-dhan__facts dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.cc-dhan__facts dd {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.cc-dhan__incident,
.cc-dhan__approval {
  padding: var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  min-width: 0;
}
</style>

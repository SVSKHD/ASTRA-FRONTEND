<script setup lang="ts">
// Risk settings per account and the risk agent's decisions. Editing the policy
// is admin-only (the server enforces it, and audits every change). The mode
// switch is shown but disabled: PAPER is Phase F, LIVE is Phase G.
import { computed, reactive, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormField from '@/components/ui/FormField.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Switch from '@/components/ui/Switch.vue'
import TextInput from '@/components/ui/TextInput.vue'
import AccountPicker from './AccountPicker.vue'
import ModeBadge from './ModeBadge.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, when } from '@/trading/format'
import { isAdmin } from '@/trading/session'
import { must, useLoad, ApiFailure } from '@/trading/useLoad'
import type { Account } from './types'

const props = defineProps<{ accounts: Account[] }>()
const accountId = ref('')
const account = computed(() => props.accounts.find((a) => a.id === accountId.value))
const path = () => ({ params: { path: { account_id: accountId.value } } })

const policy = useLoad(async () => {
  try {
    return must(await aureon.GET('/api/trading/accounts/{account_id}/risk-policy', path()))
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) return null
    throw e
  }
}, false)
const decisions = useLoad(
  async () =>
    must(
      await aureon.GET('/api/trading/risk-decisions', {
        params: { query: { account_id: accountId.value, limit: 20 } },
      }),
    ).items,
  false,
)
watch(accountId, (id) => {
  if (!id) return
  void policy.reload()
  void decisions.reload()
})

const SESSIONS = ['Asia', 'London', 'NY'] as const
const form = reactive({
  max_daily_loss: '',
  max_exposure: '',
  max_position_size: '',
  max_drawdown_pct: '',
  sessions: { Asia: true, London: true, NY: true } as Record<string, boolean>,
  kill_switch: false,
})
watch(
  () => policy.data.value,
  (p) => {
    form.max_daily_loss = p?.max_daily_loss ?? ''
    form.max_exposure = p?.max_exposure ?? ''
    form.max_position_size = p?.max_position_size ?? ''
    form.max_drawdown_pct = p?.max_drawdown_pct ?? ''
    for (const s of SESSIONS) form.sessions[s] = p ? p.allowed_sessions.includes(s) : true
    form.kill_switch = p?.kill_switch ?? false
  },
)
const DECIMAL = /^\d+(\.\d+)?$/
const valid = computed(
  () =>
    [form.max_daily_loss, form.max_exposure, form.max_position_size, form.max_drawdown_pct].every(
      (v) => DECIMAL.test(v.trim()),
    ) && SESSIONS.some((s) => form.sessions[s]),
)
const saving = ref(false)
const saveMsg = ref('')
async function save() {
  saving.value = true
  saveMsg.value = ''
  try {
    must(
      await aureon.PUT('/api/trading/accounts/{account_id}/risk-policy', {
        ...path(),
        body: {
          max_daily_loss: form.max_daily_loss.trim(),
          max_exposure: form.max_exposure.trim(),
          max_position_size: form.max_position_size.trim(),
          max_drawdown_pct: form.max_drawdown_pct.trim(),
          allowed_sessions: SESSIONS.filter((s) => form.sessions[s]),
          kill_switch: form.kill_switch,
        },
      }),
    )
    saveMsg.value = 'Saved. The change is audited on the server.'
    await policy.reload()
  } catch (e) {
    saveMsg.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

const policyStats = computed(() => {
  const p = policy.data.value
  const cur = account.value?.base_currency ?? ''
  if (!p) return []
  return [
    { label: `Max daily loss (${cur})`, value: dec(p.max_daily_loss, 2) },
    { label: `Max exposure (${cur})`, value: dec(p.max_exposure, 2) },
    { label: 'Max position size', value: dec(p.max_position_size) },
    { label: 'Max drawdown', value: `${dec(p.max_drawdown_pct, 3)}%` },
    { label: 'Sessions', value: p.allowed_sessions.join(', ') || 'none' },
    { label: 'Kill switch', value: p.kill_switch ? 'ON — all rejected' : 'off' },
  ]
})
const openChecks = ref<number | null>(null)
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="!accounts.length"
      title="No broker accounts yet"
      description="Risk policies belong to an account. An admin registers accounts on the server first."
    />
    <template v-else>
      <AccountPicker v-model="accountId" :accounts="accounts" />
      <div class="tp-grid">
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Execution mode</span>
              <ModeBadge v-if="account" :mode="account.mode" />
            </div>
          </template>
          <p class="tp-note">
            OBSERVE: data, signals and analysis only. PAPER (simulated fills) arrives in Phase F;
            LIVE needs Phase G, a server-side feature flag and written approval.
          </p>
          <div class="tp-row" role="group" aria-label="Change mode (disabled)">
            <Button size="sm" variant="secondary" disabled>Switch to PAPER</Button>
            <Button size="sm" variant="secondary" disabled>Switch to LIVE</Button>
          </div>
        </Card>
        <Card title="Risk policy">
          <Alert v-if="policy.error.value" tone="warning">{{ policy.error.value }}</Alert>
          <StatRow v-else-if="policyStats.length" :stats="policyStats" />
          <p v-else-if="!policy.loading.value" class="tp-note">
            No policy yet: the risk agent rejects every signal for this account until one is set.
          </p>
        </Card>
      </div>

      <Card v-if="isAdmin()" title="Edit risk policy (admin)">
        <form class="rk__form" @submit.prevent="save">
          <div class="tp-row">
            <FormField :label="`Max daily loss (${account?.base_currency ?? ''})`">
              <TextInput v-model="form.max_daily_loss" size="sm" placeholder="5000" />
            </FormField>
            <FormField :label="`Max exposure (${account?.base_currency ?? ''})`">
              <TextInput v-model="form.max_exposure" size="sm" placeholder="200000" />
            </FormField>
          </div>
          <div class="tp-row">
            <FormField label="Max position size (lots / units)">
              <TextInput v-model="form.max_position_size" size="sm" placeholder="1" />
            </FormField>
            <FormField label="Max drawdown (%)">
              <TextInput v-model="form.max_drawdown_pct" size="sm" placeholder="10" />
            </FormField>
          </div>
          <div class="tp-row" role="group" aria-label="Allowed sessions">
            <Checkbox v-for="s in SESSIONS" :key="s" v-model="form.sessions[s]" :label="s" />
          </div>
          <Switch v-model="form.kill_switch" label="Kill switch (reject everything)" size="sm" />
          <p class="tp-note">Decimal numbers only (e.g. 1500.50). At least one session.</p>
          <Button type="submit" size="sm" variant="primary" :loading="saving" :disabled="!valid">
            Save policy
          </Button>
          <p v-if="saveMsg" class="tp-note" role="status">{{ saveMsg }}</p>
        </form>
      </Card>

      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Recent risk decisions</span>
            <SourceTag source="calculated" />
          </div>
        </template>
        <ul v-if="decisions.data.value?.length" class="tp-list">
          <li v-for="d in decisions.data.value" :key="d.id" class="tp-item rk__decision">
            <div class="tp-main">
              <span class="tp-strong">{{ d.reason }}</span>
              <span class="tp-note">{{ when(d.created_at) }}</span>
              <ul v-if="openChecks === d.id" class="tp-list rk__checks">
                <li v-for="c in d.checks" :key="String(c.name)" class="tp-note">
                  {{ c.ok === true ? '✓' : c.ok === false ? '✕' : '–' }} {{ c.name }} —
                  {{ c.detail }}
                </li>
              </ul>
            </div>
            <div class="tp-row">
              <Badge
                :tone="d.approved ? 'success' : 'danger'"
                :label="d.approved ? 'Approved' : 'Rejected'"
              />
              <Button
                size="sm"
                variant="ghost"
                @click="openChecks = openChecks === d.id ? null : d.id"
              >
                {{ openChecks === d.id ? 'Hide checks' : 'Checks' }}
              </Button>
            </div>
          </li>
        </ul>
        <p v-else-if="!decisions.loading.value" class="tp-note">
          No decisions for this account yet. One is written for each BUY or SELL signal.
        </p>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.rk__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.rk__decision {
  align-items: flex-start;
}
.rk__checks {
  gap: 2px;
  padding-top: var(--sp-1);
}
</style>

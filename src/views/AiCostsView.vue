<script setup lang="ts">
// /ai/costs — the AI Cost Center: budget, actual billed usage (history, per provider,
// model and agent) and the versioned pricing catalog with an estimator.
//
// Everything is read from Aureon (src/ai/costs.ts). A server without the Cost Center
// endpoints answers 404 and the page says so; nothing is filled in with sample numbers.
// Usage history is server-wide, so it is admin-only; the budget and prices are for
// every signed-in user.
import { computed, ref, watch } from 'vue'
import AureonPage from '@/components/AureonPage.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import BudgetCard from '@/components/ai/costs/BudgetCard.vue'
import UsagePanel from '@/components/ai/costs/UsagePanel.vue'
import PricingEstimator from '@/components/ai/costs/PricingEstimator.vue'
import {
  costApi,
  observedWorkload,
  type AiBudget,
  type PricingCatalog,
  type PricingVersion,
  type UsageHistory,
} from '@/ai/costs'
import { isAdmin, tradingSession } from '@/trading/session'

const days = ref('30')
const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const loading = ref(false)
const missing = ref(false)
const error = ref('')
const budget = ref<AiBudget | null>(null)
const catalog = ref<PricingCatalog | null>(null)
const versions = ref<PricingVersion[]>([])
const history = ref<UsageHistory | null>(null)
const historyError = ref('')
const refreshing = ref(false)
const admin = computed(() => isAdmin())
let token = 0

async function load() {
  const mine = ++token
  loading.value = true
  error.value = ''
  try {
    const [b, p, v, h] = await Promise.all([
      costApi.budget(),
      costApi.pricing(),
      costApi.versions(),
      admin.value ? costApi.history(Number(days.value)) : Promise.resolve(null),
    ])
    if (mine !== token) return
    missing.value = !b.ok && b.missing && !p.ok && p.missing
    budget.value = b.ok ? b.data : null
    catalog.value = p.ok ? p.data : null
    versions.value = v.ok ? v.data : []
    if (h) {
      history.value = h.ok ? h.data : null
      historyError.value = h.ok ? '' : h.error
    }
    const failed = [b, p].find((r) => !r.ok && !r.missing)
    error.value = failed && !failed.ok ? failed.error : ''
  } catch (e) {
    if (mine === token) error.value = (e as Error).message
  } finally {
    if (mine === token) loading.value = false
  }
}

async function loadHistory() {
  const h = await costApi.history(Number(days.value))
  history.value = h.ok ? h.data : null
  historyError.value = h.ok ? '' : h.error
}

async function pickVersion(v: string) {
  const r = await costApi.pricing(v)
  if (r.ok) catalog.value = r.data
  else error.value = r.error
}

async function refreshPrices() {
  refreshing.value = true
  try {
    const r = await costApi.refreshPricing()
    if (r.ok) {
      catalog.value = r.data
      const v = await costApi.versions()
      if (v.ok) versions.value = v.data
    } else error.value = r.error
  } finally {
    refreshing.value = false
  }
}

watch(
  () => tradingSession.user?.uid,
  (id) => {
    if (id) void load()
  },
  { immediate: true },
)
watch(days, () => {
  if (admin.value) void loadHistory()
})

const observed = computed(() =>
  history.value ? observedWorkload(history.value, Number(days.value)) : null,
)
</script>

<template>
  <AureonPage
    title="AI Cost Center"
    subtitle="Budget, billed usage and model prices, from the Aureon server"
    gate-text="AI spend and prices are kept on the Aureon server. Sign in to see them."
  >
    <template #actions>
      <Button variant="ghost" size="sm" :loading="loading" @click="load">Refresh</Button>
    </template>

    <EmptyState
      v-if="missing"
      title="The Cost Center is not on this server yet"
      description="This Aureon server has no pricing, budget or usage-history endpoints. They arrive with the backend's AI cost center update; until then today's OpenRouter spend shows in the AI tab."
    />
    <template v-else>
      <p v-if="error" class="tp-note" role="alert">{{ error }}</p>
      <p v-if="loading && !budget && !catalog" class="tp-note">Loading…</p>

      <BudgetCard v-if="budget" :budget="budget" :admin="admin" @saved="load" />

      <section class="acv__section">
        <div class="acv__head">
          <h2 class="acv__h2">
            Usage <span class="tp-note">billed, as OpenRouter reported it</span>
          </h2>
          <Select v-if="admin" v-model="days" :options="DAY_OPTIONS" size="sm" aria-label="Range" />
        </div>
        <p v-if="!admin" class="tp-note">Usage history is server-wide, so only admins see it.</p>
        <p v-else-if="historyError" class="tp-note" role="alert">{{ historyError }}</p>
        <UsagePanel v-else-if="history" :history="history" />
      </section>

      <PricingEstimator
        v-if="catalog"
        :catalog="catalog"
        :versions="versions"
        :admin="admin"
        :refreshing="refreshing"
        :observed="observed"
        @version="pickVersion"
        @refresh="refreshPrices"
      />
    </template>
  </AureonPage>
</template>

<style scoped>
.acv__section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.acv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.acv__h2 {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-lg);
  color: var(--text-primary);
}
</style>

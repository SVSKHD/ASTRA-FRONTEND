<script setup lang="ts">
// /ai/costs — what Claude has cost this month (GET /api/ai/usage, backend docs/26):
// the month against AI_MONTHLY_BUDGET_USD and each budget against its cap, with a
// warning from 80 %. Claude is the only model, priced on the server, so there is no
// price catalog or provider breakdown here any more.
//
// The usage endpoint is admin-only (spend is server-wide); anyone else is told so.
import { ref, watch } from 'vue'
import AureonPage from '@/components/AureonPage.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BudgetCard from '@/components/ai/costs/BudgetCard.vue'
import { loadUsage, type AiUsage } from '@/ai/costs'
import { tradingSession } from '@/trading/session'

const loading = ref(false)
const usage = ref<AiUsage | null>(null)
const error = ref('')
const notAdmin = ref(false)
let token = 0

async function load() {
  const mine = ++token
  loading.value = true
  error.value = ''
  const r = await loadUsage()
  if (mine !== token) return
  loading.value = false
  if (r.ok) {
    usage.value = r.data
    notAdmin.value = false
  } else {
    usage.value = null
    notAdmin.value = r.status === 403
    error.value = r.error
  }
}

watch(
  () => tradingSession.user?.uid,
  (id) => {
    if (id) void load()
  },
  { immediate: true },
)
</script>

<template>
  <AureonPage
    title="AI spend"
    subtitle="Claude’s cost this month, against the caps the server enforces"
    gate-text="AI spend is kept on the Aureon server. Sign in to see it."
  >
    <template #actions>
      <Button variant="ghost" size="sm" :loading="loading" @click="load">Refresh</Button>
    </template>

    <EmptyState
      v-if="notAdmin"
      title="Only admins see AI spend"
      description="Spend is server-wide, so the usage figures are for admins."
    />
    <template v-else>
      <p v-if="error" class="tp-note" role="alert">{{ error }}</p>
      <Skeleton v-if="loading && !usage" :lines="6" />
      <BudgetCard v-if="usage" :usage="usage" settings-link />
    </template>
  </AureonPage>
</template>

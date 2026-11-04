<script setup lang="ts">
// /trading — the trading panel (Trading Phase E). Read-only views over
// Aureon_Agentic's trading API, with a live feed (GET /api/trading/stream).
//
// It signs in to Aureon on its own (src/trading/session.ts) so it works whether
// the app's sign-in is still Supabase or already Aureon. Every value shows where
// it came from (broker / simulated / calculated), and the execution mode of each
// account is always on screen. Nothing on this page can place a broker order.
// Paper trading (Phase F) creates order intents that the server risk-checks and,
// after an admin's approval, fills with a SIMULATED fill; LIVE stays off (Phase G).
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import ModeBadge from '@/components/trading/ModeBadge.vue'
import DhanSessionBar from '@/components/control/DhanSessionBar.vue'
import { aureon } from '@/api/client'
import { checkSession, isAdmin, signIn, tradingSession } from '@/trading/session'
import { inbox, loadInbox, useLiveRefresh } from '@/trading/inbox'
import { connect, disconnect, live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import '@/components/trading/trading.css'

const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'dhan', label: 'Dhan' },
  { value: 'mt5', label: 'MT5' },
  { value: 'origins', label: 'My vs bot' },
  { value: 'market', label: 'Watchlist & charts' },
  { value: 'signals', label: 'Signals' },
  { value: 'strategies', label: 'Strategies & backtests' },
  { value: 'orders', label: 'Orders & positions' },
  { value: 'paper', label: 'Paper' },
  { value: 'risk', label: 'Risk' },
  { value: 'agents', label: 'Agents' },
] as const
type Section = (typeof SECTIONS)[number]['value']

const PAGES: Record<Section, ReturnType<typeof defineAsyncComponent>> = {
  overview: defineAsyncComponent(() => import('@/components/trading/TradingOverview.vue')),
  dhan: defineAsyncComponent(() => import('@/components/trading/TradingDhan.vue')),
  mt5: defineAsyncComponent(() => import('@/components/trading/TradingMt5.vue')),
  origins: defineAsyncComponent(() => import('@/components/trading/TradingOrigins.vue')),
  market: defineAsyncComponent(() => import('@/components/trading/TradingMarket.vue')),
  signals: defineAsyncComponent(() => import('@/components/trading/TradingSignals.vue')),
  strategies: defineAsyncComponent(() => import('@/components/trading/TradingStrategies.vue')),
  orders: defineAsyncComponent(() => import('@/components/trading/TradingOrders.vue')),
  paper: defineAsyncComponent(() => import('@/components/trading/TradingPaper.vue')),
  risk: defineAsyncComponent(() => import('@/components/trading/TradingRisk.vue')),
  agents: defineAsyncComponent(() => import('@/components/trading/TradingAgents.vue')),
}

const route = useRoute()
const router = useRouter()
const section = computed<Section>(() => {
  const s = String(route.params.section ?? '')
  return (SECTIONS.some((x) => x.value === s) ? s : 'overview') as Section
})
function go(s: string) {
  void router.push(s === 'overview' ? '/trading' : `/trading/${s}`)
}

// The Paper tab carries the admin's approval count.
const tabs = computed(() =>
  SECTIONS.map((s) =>
    s.value === 'paper' && inbox.items.length
      ? { value: s.value, label: `${s.label} (${inbox.items.length})` }
      : { value: s.value, label: s.label },
  ),
)

const email = ref('')
const passcode = ref('')

const accounts = useLoad(async () => must(await aureon.GET('/api/trading/accounts')), false)

const STATUS_TEXT: Record<string, string> = {
  connecting: 'Live feed connecting…',
  open: 'Live feed on',
  reconnecting: 'Live feed reconnecting…',
  closed: 'Live feed off',
}

watch(
  () => tradingSession.user,
  (u) => {
    if (u) {
      void accounts.reload()
      if (isAdmin()) void loadInbox()
      connect()
    } else {
      disconnect()
    }
  },
)
// The approval count stays current on every section, not only on Paper.
useLiveRefresh(() => {
  if (tradingSession.user && isAdmin()) void loadInbox()
})
onMounted(() => void checkSession())
onBeforeUnmount(disconnect)
</script>

<template>
  <div class="tv">
    <header class="tv__bar">
      <div class="tv__brand">
        <h1 class="tv__h1">Trading</h1>
        <span class="tp-note"
          >Aureon · no broker order can be placed from here · paper fills are simulated</span
        >
      </div>
      <div v-if="tradingSession.user" class="tp-row" aria-label="Execution mode per account">
        <template v-if="accounts.data.value?.items.length">
          <ModeBadge
            v-for="a in accounts.data.value.items"
            :key="a.id"
            :mode="a.mode"
            :label="`${a.broker.toUpperCase()} ${a.label || a.account_id}`"
          />
        </template>
        <ModeBadge v-else mode="OBSERVE" label="No accounts" />
        <span class="tp-note" role="status">{{ STATUS_TEXT[live.status] }}</span>
        <Button variant="ghost" size="sm" @click="router.push('/')">Back to Aureon</Button>
      </div>
    </header>

    <div v-if="!tradingSession.checked" class="tp-note tv__pad">Checking your Aureon session…</div>

    <Card v-else-if="!tradingSession.user" title="Sign in to Aureon" class="tv__gate">
      <p class="tp-note">
        The trading panel reads from the self-hosted Aureon server. Sign in with your Aureon email
        and passcode.
      </p>
      <form class="tv__form" @submit.prevent="signIn(email, passcode)">
        <TextInput v-model="email" type="email" placeholder="Email" aria-label="Email" />
        <TextInput
          v-model="passcode"
          type="password"
          placeholder="Passcode"
          aria-label="Passcode"
        />
        <Button type="submit" variant="primary" :loading="tradingSession.busy">Sign in</Button>
      </form>
      <Alert v-if="tradingSession.error" tone="danger">{{ tradingSession.error }}</Alert>
    </Card>

    <template v-else>
      <!-- Dhan session state for everyone; the login button only for admins. -->
      <DhanSessionBar :admin="isAdmin()" class="tv__pad" />
      <Tabs
        :model-value="section"
        :tabs="tabs"
        aria-label="Trading sections"
        @update:model-value="go"
      />
      <Alert v-if="tradingSession.error" tone="warning">{{ tradingSession.error }}</Alert>
      <main class="tv__main">
        <component
          :is="PAGES[section]"
          :accounts="accounts.data.value?.items ?? []"
          @accounts-changed="accounts.reload()"
        />
      </main>
    </template>
  </div>
</template>

<style scoped>
.tv {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--sp-4) 16px var(--sp-6);
  min-width: 0;
}
.tv__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
}
.tv__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tv__h1 {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
}
.tv__gate {
  max-width: 440px;
  align-self: center;
}
.tv__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.tv__main {
  min-width: 0;
}
.tv__pad {
  padding: var(--sp-6) 0;
  text-align: center;
}
</style>

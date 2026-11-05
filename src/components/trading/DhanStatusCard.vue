<script setup lang="ts">
// Dhan's status as separate checks (src/trading/dhanHealth.ts, backend
// docs/27-dhan-audit.md): credentials, the login session, how fresh the
// account data is, the market feed worker, tick freshness and reconciliation.
// A healthy API is never shown as a healthy feed: each row has its own source,
// and "no data", "stale", "off" and "authentication failed" read differently.
//
// The feed worker and reconciliation come from the admin-only integrations
// summary; everyone else sees them as not reported rather than as fine.
// Read-only: there is no order action here.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { aureon } from '@/api/client'
import { loadIntegrations, type DhanSection } from '@/control/integrations'
import { useNow } from '@/control/poll'
import { dhanChecks, LEVEL_LABEL, LEVEL_TONE } from '@/trading/dhanHealth'
import { isAdmin } from '@/trading/session'
import { live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'

const props = defineProps<{
  hasAccount: boolean
  health: { supported: boolean; ok: boolean; detail?: string | null } | null
  fundsAsOf: string | null
  fundsError: string
}>()

const now = useNow(15_000)
const admin = computed(() => isAdmin())

const session = useLoad(async () => must(await aureon.GET('/api/v1/dhan/auth/status')))
const integration = useLoad(async () => {
  if (!isAdmin()) return null
  const r = await loadIntegrations((p) => aureon.GET(p))
  return (r.data?.integrations?.dhan as DhanSection | undefined) ?? null
})

function refresh() {
  void session.reload()
  void integration.reload()
}

const checks = computed(() =>
  dhanChecks({
    session: session.data.value ?? null,
    integration: integration.data.value ?? null,
    admin: admin.value,
    hasAccount: props.hasAccount,
    health: props.health,
    fundsAsOf: props.fundsAsOf,
    fundsError: props.fundsError,
    quotes: Object.values(live.quotes),
    now: now.value,
  }),
)
const problems = computed(() => integration.data.value?.problems ?? [])
</script>

<template>
  <Card data-testid="dhan-status">
    <template #header>
      <div class="tp-head">
        <span class="tp-title">Dhan status</span>
        <Button
          size="sm"
          variant="ghost"
          :loading="session.loading.value || integration.loading.value"
          @click="refresh"
          >Refresh</Button
        >
      </div>
    </template>
    <ul class="tp-list">
      <li v-for="c in checks" :key="c.key" class="tp-item" :data-check="c.key">
        <div class="tp-main">
          <span class="tp-strong">{{ c.label }}</span>
          <span class="tp-note">{{ c.text }}</span>
        </div>
        <Badge :tone="LEVEL_TONE[c.level]" :label="LEVEL_LABEL[c.level]" />
      </li>
    </ul>
    <p v-if="problems.length" class="tp-note" role="alert" data-testid="dhan-problems">
      The server reports: {{ problems.join('; ') }}.
    </p>
    <p class="tp-note">Read-only: orders cannot be placed, changed or cancelled from here.</p>
  </Card>
</template>

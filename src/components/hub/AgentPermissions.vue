<script setup lang="ts">
// What agents may do on their own and what waits for a person: the server's approval
// policies (read-only here; edited on /dev/approvals). An operation matching a policy is
// filed as an approval request instead of running.
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import { aureon } from '@/api/client'
import { must, useLoad } from '@/trading/useLoad'

const policies = useLoad(async () => must(await aureon.GET('/api/v1/approvals/policies')))
const RISK: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
}
const mins = (s: number | null | undefined) => (s ? `${Math.round(s / 60)} min` : '—')
</script>

<template>
  <Card title="Agent permissions" data-testid="permissions">
    <p class="tp-note">
      Operations matching a policy are filed as approval requests and run only after the required
      approvals.
    </p>
    <p v-if="policies.error.value" class="tp-note" role="alert">{{ policies.error.value }}</p>
    <ul v-else-if="policies.data.value?.length" class="tp-list">
      <li v-for="p in policies.data.value" :key="p.id ?? p.kind_pattern" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ p.kind_pattern }}</span>
          <span class="tp-note">
            {{ p.required_approvals }} approval{{ p.required_approvals === 1 ? '' : 's' }}
            <template v-if="p.require_reauth"> · password again</template>
            <template v-if="!p.allow_self_approval"> · not by the requester</template>
            · expires after {{ mins(p.expiry_seconds) }}
          </span>
          <span v-if="p.description" class="tp-note">{{ p.description }}</span>
        </div>
        <div class="tp-row">
          <Badge :tone="RISK[p.risk_level] ?? 'neutral'" :label="p.risk_level" />
          <Badge v-if="!p.enabled" tone="neutral" label="off" />
        </div>
      </li>
    </ul>
    <p v-else-if="!policies.loading.value" class="tp-note">No approval policies are set.</p>
  </Card>
</template>

<script setup lang="ts">
// Human approval requests waiting on you: what an agent or a person asked to do, its
// risk, and how many approvals it still needs. Deciding happens in the inbox, which asks
// for re-authentication where the policy requires it.
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { aureon } from '@/api/client'
import { must, useLoad } from '@/trading/useLoad'
import { ago } from '@/trading/format'

const router = useRouter()
const inbox = useLoad(async () => must(await aureon.GET('/api/v1/approvals/inbox')))
const RISK: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
}
defineExpose({ reload: () => inbox.reload() })
</script>

<template>
  <Card title="Approval requests" data-testid="approvals">
    <p v-if="inbox.error.value" class="tp-note" role="alert">{{ inbox.error.value }}</p>
    <ul v-else-if="inbox.data.value?.items.length" class="tp-list">
      <li v-for="a in inbox.data.value.items.slice(0, 10)" :key="a.id" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ a.summary || a.kind }}</span>
          <span class="tp-note">
            {{ a.kind }} · {{ a.target }} · asked {{ ago(a.created_at) }} ·
            {{ a.received_approvals }}/{{ a.required_approvals }} approvals
          </span>
        </div>
        <div class="tp-row">
          <Badge :tone="RISK[a.risk_level] ?? 'neutral'" :label="a.risk_level" />
          <Button
            size="sm"
            variant="ghost"
            @click="router.push({ path: '/dev/inbox', query: { id: a.id } })"
          >
            Decide
          </Button>
        </div>
      </li>
    </ul>
    <p v-else-if="!inbox.loading.value" class="tp-note">Nothing is waiting for your approval.</p>
  </Card>
</template>

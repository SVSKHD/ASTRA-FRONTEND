<script setup lang="ts">
// Collaboration tasks: the work agents are doing with you across repositories — code
// analyses and changes, newest first, with what each is waiting on (the agent, or your
// review). Opening one leads to the GitHub AI workspace or Code (Aureon).
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { aureon } from '@/api/client'
import { must, useLoad } from '@/trading/useLoad'
import { ago } from '@/trading/format'

const router = useRouter()
const tasks = useLoad(
  async () => must(await aureon.GET('/api/code/tasks', { params: { query: { limit: 15 } } })).items,
)
const WAITING: Record<string, string> = {
  queued: 'waiting for the agent',
  running: 'the agent is working',
  ready: 'waiting for your review',
  done: 'answered',
  approved: 'approved',
  rejected: 'rejected',
  failed: 'failed',
}
const TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  queued: 'info',
  running: 'info',
  ready: 'warning',
  done: 'success',
  approved: 'success',
  rejected: 'neutral',
  failed: 'danger',
}
</script>

<template>
  <Card title="Collaboration tasks" data-testid="collab">
    <p v-if="tasks.error.value" class="tp-note" role="alert">{{ tasks.error.value }}</p>
    <ul v-else-if="tasks.data.value?.length" class="tp-list">
      <li v-for="t in tasks.data.value" :key="t.id" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ t.title }}</span>
          <span class="tp-note">
            {{ t.repo }} · {{ t.kind === 'change' ? 'change' : 'analysis' }} ·
            {{ ago(t.created_at) }} ·
            {{ WAITING[t.status] ?? t.status }}
          </span>
        </div>
        <div class="tp-row">
          <Badge :tone="TONE[t.status] ?? 'neutral'" :label="t.status" />
          <Button size="sm" variant="ghost" @click="router.push('/code-aureon')">Open</Button>
        </div>
      </li>
    </ul>
    <p v-else-if="!tasks.loading.value" class="tp-note">No agent tasks yet.</p>
  </Card>
</template>

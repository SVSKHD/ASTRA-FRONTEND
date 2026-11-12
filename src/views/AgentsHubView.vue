<script setup lang="ts">
// /agents-hub — agents, tools and the people in the loop, from what the server reports:
// the tool registry and MCP status (GET /api/v1/capabilities), connected services, agent
// permissions (approval policies), execution history, collaboration tasks, approval
// requests waiting on you, the audit trail, and which AI provider the News, Voice and
// Research agents use (backend docs/26). Each section is a reusable component
// (src/components/hub) that loads and fails on its own. Admins only: it is server-wide.
import { ref, watch } from 'vue'
import AureonPage from '@/components/AureonPage.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ToolRegistry from '@/components/hub/ToolRegistry.vue'
import ConnectedServices from '@/components/hub/ConnectedServices.vue'
import AgentPermissions from '@/components/hub/AgentPermissions.vue'
import ExecutionHistory from '@/components/hub/ExecutionHistory.vue'
import CollaborationTasks from '@/components/hub/CollaborationTasks.vue'
import ApprovalRequests from '@/components/hub/ApprovalRequests.vue'
import AuditHistory from '@/components/hub/AuditHistory.vue'
import { loadCapabilities, type Capabilities } from '@/hub/capabilities'
import { isAdmin, tradingSession } from '@/trading/session'

const caps = ref<Capabilities | null>(null)
const capsMissing = ref(false)
const capsError = ref('')
const loading = ref(false)
const key = ref(0)

async function load() {
  loading.value = true
  try {
    const r = await loadCapabilities()
    caps.value = r.ok ? r.data : null
    capsMissing.value = !r.ok && r.missing
    capsError.value = !r.ok && !r.missing ? r.error : ''
  } finally {
    loading.value = false
  }
}
function refresh() {
  key.value++
  void load()
}
watch(
  () => tradingSession.user?.uid,
  (u) => {
    if (u && isAdmin()) void load()
  },
  { immediate: true },
)
</script>

<template>
  <AureonPage
    title="Agents & tools"
    subtitle="What the Aureon server can do, what needs a person, and what happened"
    gate-text="Agents, tools and approvals live on the Aureon server. Sign in as an admin to see them."
    admin
  >
    <template #actions>
      <Button variant="ghost" size="sm" :loading="loading" @click="refresh">Refresh</Button>
    </template>
    <div :key="key" class="ah">
      <div class="ah__col">
        <ApprovalRequests />
        <EmptyState
          v-if="capsMissing"
          title="The tool registry is not on this server yet"
          description="This Aureon server has no capabilities endpoint. It arrives with the backend's AI cost center update; agents, approvals and audit below work today."
        />
        <p v-else-if="capsError" class="tp-note" role="alert">{{ capsError }}</p>
        <template v-else-if="caps">
          <ToolRegistry :capabilities="caps" />
          <ConnectedServices :services="caps.services" />
        </template>
        <AgentPermissions />
      </div>
      <div class="ah__col">
        <CollaborationTasks />
        <ExecutionHistory />
        <AuditHistory />
      </div>
    </div>
  </AureonPage>
</template>

<style scoped>
.ah {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-3);
  min-width: 0;
}
@media (min-width: 960px) {
  .ah {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}
.ah__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
</style>

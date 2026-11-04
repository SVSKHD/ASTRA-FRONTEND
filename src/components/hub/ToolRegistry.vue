<script setup lang="ts">
// The tool registry: every tool the server reports, grouped by kind, with its status and
// whether using it needs a human approval. MCP is shown as the server reports it.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import SearchField from '@/components/ui/SearchField.vue'
import { groupTools, STATUS_TONE, type Capabilities } from '@/hub/capabilities'

const props = defineProps<{ capabilities: Capabilities }>()
const find = ref('')
const groups = computed(() => {
  const q = find.value.trim().toLowerCase()
  const tools = q
    ? props.capabilities.tools.filter((t) =>
        `${t.name} ${t.id} ${t.detail ?? ''}`.toLowerCase().includes(q),
      )
    : props.capabilities.tools
  return groupTools(tools)
})
const mcp = computed(() => props.capabilities.mcp)
</script>

<template>
  <Card title="Tools" data-testid="tool-registry">
    <div class="tr__mcp" data-testid="mcp-status">
      <Badge
        :tone="mcp.supported ? 'success' : 'neutral'"
        :label="mcp.supported ? 'MCP on' : 'MCP not supported'"
      />
      <span class="tp-note">
        <template v-if="!mcp.supported">
          This server has no MCP client yet, so no MCP tools are installed. Its own agents and
          integrations are listed below.
        </template>
        <template v-else-if="!mcp.servers.length"
          >MCP is supported; no server is connected.</template
        >
        <template v-else>
          {{ mcp.servers.filter((s) => s.connected).length }} of {{ mcp.servers.length }} MCP
          servers connected: {{ mcp.servers.map((s) => s.name).join(', ') }}
        </template>
      </span>
    </div>
    <SearchField v-model="find" size="sm" placeholder="Find a tool" />
    <section v-for="g in groups" :key="g.kind" class="tr__group">
      <h3 class="tr__h3">
        {{ g.label }} <span class="tp-note">{{ g.tools.length }}</span>
      </h3>
      <ul class="tp-list">
        <li v-for="t in g.tools" :key="t.id" class="tp-item" :data-testid="`tool-${t.id}`">
          <div class="tp-main">
            <span class="tp-strong">{{ t.name }}</span>
            <span v-if="t.detail" class="tp-note">{{ t.detail }}</span>
          </div>
          <div class="tp-row">
            <Badge v-if="t.requires_approval" tone="info" label="Needs approval" />
            <Badge :tone="STATUS_TONE[t.status] ?? 'neutral'" :label="t.status" />
          </div>
        </li>
      </ul>
    </section>
    <p v-if="!groups.length" class="tp-note">
      {{ find ? 'No tool matches.' : 'The server reports no tools.' }}
    </p>
  </Card>
</template>

<style scoped>
.tr__mcp {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
  min-width: 0;
}
.tr__mcp .tp-note {
  flex: 1 1 240px;
  min-width: 0;
}
.tr__group {
  margin-top: var(--sp-3);
  min-width: 0;
}
.tr__h3 {
  margin: 0 0 var(--sp-1);
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  color: var(--text-primary);
}
</style>

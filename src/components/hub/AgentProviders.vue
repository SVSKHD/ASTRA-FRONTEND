<script setup lang="ts">
// Which AI provider the News, Voice and Research agents use (backend docs/26):
// auto (the default external provider when allowed, else local), local Ollama,
// OpenRouter, Claude (direct Anthropic API) or Gemini (direct Google API), plus
// the external model for that provider.
//
// These are the server's own settings (AGENT_{NEWS,VOICE,RESEARCH}_{PROVIDER,MODEL},
// /api/v1/settings), written through the same path as the Settings page. Only
// the agents the server makes configurable are listed: workers that stay
// OpenRouter-only (research explanations, image generation) get no new choices.
// The server still decides per call: private data stays local whatever is set,
// trading text leaves only when AI_RESEARCH_EXTERNAL_ALLOWED is on, and voice
// speech recognition and synthesis always run locally.
import { computed, reactive } from 'vue'
import Card from '@/components/ui/Card.vue'
import SettingField from '@/components/control/SettingField.vue'
import SettingReauth from '@/components/control/SettingReauth.vue'
import { aureon } from '@/api/client'
import { aureonAi } from '@/ai/aureonChat'
import { PROVIDER_AGENTS, type ProviderAgent } from '@/control/aiSettings'
import { useSettingWriter } from '@/control/useSettingWriter'
import { must, useLoad } from '@/trading/useLoad'

const status = reactive({ missing: false, forbidden: false })
const list = useLoad(async () => {
  const r = await aureon.GET('/api/v1/settings')
  status.missing = r.response.status === 404
  status.forbidden = r.response.status === 403
  return status.missing || status.forbidden ? null : must(r)
})
const writer = useSettingWriter(() => list.reload())

const AGENT_LABEL: Record<ProviderAgent, string> = {
  NEWS: 'News',
  VOICE: 'Voice',
  RESEARCH: 'Research',
}

const agents = computed(() => {
  const rows = list.data.value?.settings ?? []
  return PROVIDER_AGENTS.map((a) => ({
    agent: a,
    label: AGENT_LABEL[a],
    rows: rows.filter((r) => r.key === `AGENT_${a}_PROVIDER` || r.key === `AGENT_${a}_MODEL`),
  })).filter((a) => a.rows.length)
})
</script>

<template>
  <Card title="Agent providers" data-testid="agent-providers">
    <p class="tp-note">
      The provider and model each agent asks. The server still keeps private data local, and falls
      back to the local model — never to another external provider.
    </p>
    <p v-if="status.missing" class="tp-note">
      This server has no settings manager yet, so agent providers come from its .env.
    </p>
    <p v-else-if="status.forbidden" class="tp-note">Only an admin can change agent providers.</p>
    <p v-else-if="list.error.value" class="tp-note" role="alert">{{ list.error.value }}</p>
    <p v-else-if="list.data.value && !agents.length" class="tp-note">
      This server does not offer per-agent providers yet.
    </p>
    <section v-for="a in agents" :key="a.agent" class="ap" :data-agent="a.agent">
      <h4 class="ap__title">{{ a.label }}</h4>
      <ul class="ap__rows">
        <SettingField
          v-for="row in a.rows"
          :key="row.key"
          :row="row"
          :writer="writer"
          :encryption-ready="!!list.data.value?.encryption_ready"
          :catalog="aureonAi.catalog"
        />
      </ul>
    </section>
    <SettingReauth :writer="writer" />
  </Card>
</template>

<style scoped>
.ap {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}
.ap__title {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.ap__rows {
  display: grid;
  gap: var(--sp-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

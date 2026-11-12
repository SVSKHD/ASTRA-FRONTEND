<script setup lang="ts">
// The agent a chat asks for (backend docs/26 "Agents and tools"): Auto lets the
// server's router pick from the message; Investments, Business and General ask
// for that agent by name. Claude is the only model, so there is no model to pick.
//
// The pick is per chat (src/ai/aureonChat.ts agentFor/setAgent); with no chat
// open it is the pick the next new chat starts with. Beside it, the agent that
// answered the chat's latest reply and the run's one-line status.
import { computed } from 'vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useAppStore } from '@/stores/app'
import {
  AGENT_HINT,
  AGENT_LABEL,
  agentFor,
  agentLabel,
  setAgent,
  type AgentPick,
} from '@/ai/aureonChat'
import { aiTraces, phaseText } from '@/ai/steps'

defineProps<{ disabled?: boolean }>()

const app = useAppStore()
const chatKey = computed(() => (app.aiActiveChatId == null ? null : String(app.aiActiveChatId)))
const pick = computed(() => agentFor(chatKey.value))

const PICKS: AgentPick[] = ['auto', 'investments', 'business', 'general']
const options = PICKS.map((value) => ({ value, label: AGENT_LABEL[value] }))

function choose(v: string) {
  if ((PICKS as string[]).includes(v)) setAgent(chatKey.value, v as AgentPick)
}

/** The agent that answered the latest reply in this chat (meta), if any. */
const answered = computed(() => {
  const msgs = app.activeAiChat?.messages ?? []
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].agent) return msgs[i].agent!
  return null
})

/** The run in progress in this chat, if any: "Reading positions…", "Writing…". */
const live = computed(() => {
  const key = chatKey.value
  if (key == null) return ''
  const prefix = `${key}:`
  const running = Object.entries(aiTraces)
    .filter(([k, t]) => k.startsWith(prefix) && ['sending', 'working', 'writing'].includes(t.phase))
    .map(([, t]) => t)
  return running.length ? phaseText(running[running.length - 1]) : ''
})

const note = computed(() => {
  if (pick.value === 'auto' && answered.value) {
    return `Auto · last answered by the ${agentLabel(answered.value)} agent`
  }
  return AGENT_HINT[pick.value]
})
</script>

<template>
  <div class="agp" data-testid="agent-picker">
    <div class="agp__row">
      <SegmentedControl
        :model-value="pick"
        :options="options"
        size="sm"
        aria-label="Agent"
        :disabled="disabled"
        @update:model-value="choose"
      />
      <span v-if="live" class="agp__live" aria-live="polite" data-testid="run-status">{{
        live
      }}</span>
    </div>
    <p class="agp__note" data-testid="agent-note">{{ note }}</p>
  </div>
</template>

<style scoped>
.agp {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.agp__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
/* Four short segments fit a phone; if a theme's type is wider they scroll, never the page. */
.agp__row > :first-child {
  max-width: 100%;
  overflow-x: auto;
}
.agp__live {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.agp__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
</style>

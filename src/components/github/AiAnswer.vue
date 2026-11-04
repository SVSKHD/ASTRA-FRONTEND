<script setup lang="ts">
// One AI answer in the GitHub workspace: the provider and model to ask (from the server's
// catalog, grouped by vendor), Think, the live thinking steps, and the answer streaming
// in. Each repository is one conversation on the server (`gh:<owner/name>`), so follow-up
// questions keep the context and the history is kept with the other chats.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import TextArea from '@/components/ui/TextArea.vue'
import ThinkingSteps from '@/components/ai/ThinkingSteps.vue'
import {
  aureonAi,
  loadCatalog,
  setTarget,
  streamChat,
  targetFor,
  type AiProvider,
} from '@/ai/aureonChat'
import { groupOf } from '@/ai/providers'
import { applyEvent, endTrace, startTrace, type AiTrace } from '@/ai/steps'
import { renderMarkdown } from '@/utils/markdown'
import { SYSTEM, type Ask } from '@/github/workspace'

const props = defineProps<{ repo: string; ask: Ask | null }>()

const chatKey = computed(() => `gh:${props.repo}`)
const SEP = '|'
const options = computed(() =>
  (aureonAi.catalog?.models ?? []).map((m) => ({
    value: `${m.provider}${SEP}${m.id}`,
    label: m.label,
    group: groupOf(m),
  })),
)
const current = computed(() => targetFor(chatKey.value))
const value = computed(() =>
  current.value ? `${current.value.provider}${SEP}${current.value.model}` : '',
)
function pick(v: string) {
  const i = v.indexOf(SEP)
  if (i > 0)
    setTarget(chatKey.value, { provider: v.slice(0, i) as AiProvider, model: v.slice(i + 1) })
}
const catalogError = ref('')
onMounted(async () => {
  if (!aureonAi.catalog) {
    try {
      await loadCatalog()
    } catch (e) {
      catalogError.value = (e as Error).message
    }
  }
})

const title = ref('')
const answer = ref('')
const trace = ref<AiTrace | null>(null)
const error = ref('')
const running = ref(false)
let abort: AbortController | null = null

async function run(a: { title: string; prompt: string }) {
  abort?.abort()
  const ctl = (abort = new AbortController())
  title.value = a.title
  answer.value = ''
  error.value = ''
  running.value = true
  trace.value = startTrace(Date.now(), aureonAi.think)
  const t = trace.value
  const target = current.value
  // Keep the pick with this repository's conversation, as the AI tab does: once the
  // server has a conversation, an unsaved pick would fall back to the local model.
  if (target) setTarget(chatKey.value, target)
  try {
    for await (const ev of streamChat({
      model: target?.model ?? '',
      provider: target?.provider,
      system: SYSTEM,
      history: [],
      prompt: a.prompt,
      chatKey: chatKey.value,
      signal: ctl.signal,
      think: aureonAi.think,
    })) {
      if (ctl !== abort) return
      applyEvent(t, ev)
      if (ev.reset) answer.value = ''
      if (ev.text) answer.value += ev.text
      if (ev.error) error.value = ev.error
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') endTrace(t, 'stopped')
    else {
      error.value = (e as Error).message
      endTrace(t, 'error', error.value)
    }
  } finally {
    if (ctl === abort) running.value = false
  }
}
function stop() {
  abort?.abort()
}
onBeforeUnmount(stop)

watch(
  () => props.ask,
  (a) => {
    if (a) void run(a)
  },
)

// A follow-up in the same repository conversation.
const followUp = ref('')
function send() {
  const q = followUp.value.trim()
  if (!q || running.value) return
  followUp.value = ''
  void run({ title: q.length > 60 ? `${q.slice(0, 59)}…` : q, prompt: q })
}
</script>

<template>
  <section class="aia" data-testid="ai-answer">
    <div class="aia__bar">
      <div class="aia__model">
        <Select
          v-if="options.length"
          :model-value="value"
          :options="options"
          size="sm"
          aria-label="Model"
          :disabled="running"
          @update:model-value="pick(String($event))"
        />
        <span v-else class="tp-note">{{ catalogError || 'Loading models…' }}</span>
      </div>
      <Switch
        :model-value="aureonAi.think"
        label="Think"
        size="sm"
        :disabled="running"
        @update:model-value="aureonAi.think = $event"
      />
      <Button v-if="running" size="sm" variant="secondary" @click="stop">Stop</Button>
    </div>

    <p v-if="!title" class="tp-note">
      Pick an action: explain a file, map the architecture, look for bugs, summarize commits or
      review a pull request. The answer streams here.
    </p>
    <template v-else>
      <h3 class="aia__title">{{ title }}</h3>
      <p v-if="ask?.clipped && ask.title === title" class="tp-note">
        The material was longer than one message, so the end was cut; the model is told so.
      </p>
      <ThinkingSteps v-if="trace" :trace="trace" />
      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes everything first -->
      <div v-if="answer" class="aia__answer" v-html="renderMarkdown(answer)"></div>
      <p v-if="error" class="tp-note" role="alert">{{ error }}</p>
      <form class="aia__follow" @submit.prevent="send">
        <TextArea
          v-model="followUp"
          :rows="2"
          placeholder="Ask a follow-up about this repository"
          label="Follow-up"
          @keydown.enter.exact.prevent="send"
        />
        <Button type="submit" size="sm" variant="secondary" :disabled="running || !followUp.trim()"
          >Ask</Button
        >
      </form>
    </template>
  </section>
</template>

<style scoped>
.aia {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.aia__bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.aia__model {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 360px;
}
.aia__title {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-md, var(--text-sm));
  color: var(--text-primary);
}
.aia__answer {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.55;
  color: var(--text-primary);
}
.aia__answer :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
}
.aia__follow {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  min-width: 0;
}
.aia__follow > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}
</style>

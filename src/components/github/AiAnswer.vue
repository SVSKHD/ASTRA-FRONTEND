<script setup lang="ts">
// One AI answer in the GitHub workspace: Claude (the General agent, through the
// Aureon server), its steps as it works, and the answer streaming in. Each
// repository is one conversation on the server (`gh:<owner/name>`), so follow-up
// questions keep the context and the history is kept with the other chats.
//
// The server owns the system prompt now, so the review instructions (SYSTEM)
// travel at the top of the first message of a repository's conversation.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import TextArea from '@/components/ui/TextArea.vue'
import ThinkingSteps from '@/components/ai/ThinkingSteps.vue'
import { aureonAi, errorText, MAX_CONTENT, streamChat } from '@/ai/aureonChat'
import { applyEvent, endTrace, startTrace, type AiTrace } from '@/ai/steps'
import { renderMarkdown } from '@/utils/markdown'
import { SYSTEM, type Ask } from '@/github/workspace'

const props = defineProps<{ repo: string; ask: Ask | null }>()

const chatKey = computed(() => `gh:${props.repo}`)

/** The message sent: the instructions first in a new conversation, then the ask. */
function messageFor(prompt: string): string {
  const fresh = !aureonAi.conversations[chatKey.value]
  return (fresh ? `${SYSTEM}\n\n${prompt}` : prompt).slice(0, MAX_CONTENT)
}

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
  trace.value = startTrace(Date.now())
  const t = trace.value
  try {
    for await (const ev of streamChat({
      message: messageFor(a.prompt),
      agent: 'general',
      chatKey: chatKey.value,
      signal: ctl.signal,
    })) {
      if (ctl !== abort) return
      applyEvent(t, ev)
      if (ev.text) answer.value += ev.text
      if (ev.error) error.value = errorText(ev.error.code)
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
      <span class="aia__model tp-note">Claude · General agent</span>
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

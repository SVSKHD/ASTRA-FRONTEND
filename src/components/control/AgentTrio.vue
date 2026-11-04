<script setup lang="ts">
// News, Image and Voice at a glance: health, last run, last error, with a
// retry for whatever could not be read. src/control/agentTrio.ts says where
// each one's state comes from.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { aureon, type components } from '@/api/client'
import { must } from '@/control/api'
import { HEALTH_TONE, imageCard, newsCard, voiceCard, type TrioCard } from '@/control/agentTrio'
import { useNow } from '@/control/poll'
import { recognitionCtor } from '@/composables/useSpeechInput'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'
import { voiceActivity } from '@/voice/assistant'

type Job = components['schemas']['ScheduledJobOut']
type Agent = components['schemas']['AgentOut']

const props = defineProps<{
  agents: Agent[] | null
  agentsError: string
  jobs: Job[] | null
  jobsError: string
}>()
const emit = defineEmits<{ retry: [] }>()

const now = useNow(10_000)
const imageRun = useLoad(async () => {
  const page = must(
    await aureon.GET('/api/agents/{agent_id}/runs', {
      params: { path: { agent_id: 'imaging' }, query: { limit: 1 } },
    }),
  )
  return page.items[0] ?? null
})

const secure = typeof window === 'undefined' || window.isSecureContext !== false
const cards = computed(() => {
  const list: { key: string; title: string; card: TrioCard | null; error: string; link: string }[] =
    [
      {
        key: 'news',
        title: 'News',
        card: props.jobs ? newsCard(props.jobs) : null,
        error: props.jobsError,
        link: '/news',
      },
      {
        key: 'images',
        title: 'Images',
        card: props.agents ? imageCard(props.agents, imageRun.data.value) : null,
        error: props.agentsError,
        link: '/images',
      },
      {
        key: 'voice',
        title: 'Voice',
        card: voiceCard({ supported: !!recognitionCtor(), secure, ...voiceActivity }),
        error: '',
        link: '',
      },
    ]
  return list
})

function when(v: string | number | null): string {
  if (!v) return 'never'
  return ago(typeof v === 'number' ? new Date(v).toISOString() : v, now.value)
}
function retry() {
  emit('retry')
  void imageRun.reload()
}
</script>

<template>
  <Card title="News, Images & Voice">
    <ul class="trio" aria-label="News, image and voice agents">
      <li v-for="c in cards" :key="c.key" class="trio__item" :data-testid="`trio-${c.key}`">
        <div class="trio__head">
          <span class="tp-strong">{{ c.title }}</span>
          <Badge v-if="c.card" :tone="HEALTH_TONE[c.card.health]" :label="c.card.health" />
        </div>
        <template v-if="c.card">
          <span class="tp-note">Last run {{ when(c.card.lastRun) }}</span>
          <span class="tp-note">{{ c.card.note }}</span>
          <span v-if="c.card.lastError" class="tp-note trio__err" role="alert"
            >Last error: {{ c.card.lastError }}</span
          >
          <RouterLink v-if="c.link" :to="c.link" class="trio__link">Open {{ c.title }}</RouterLink>
        </template>
        <template v-else-if="c.error">
          <span class="tp-note" role="alert">{{ c.error }}</span>
          <Button size="sm" variant="ghost" @click="retry">Retry</Button>
        </template>
        <Skeleton v-else :lines="2" />
      </li>
    </ul>
    <p class="tp-note">
      Voice has no server agent — speech is recognised by the browser — so its card describes this
      browser.
    </p>
  </Card>
</template>

<style scoped>
.trio {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.trio__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: var(--radius-card);
}
.trio__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.trio__err {
  min-width: 0;
  color: var(--theme-danger, inherit);
  overflow-wrap: anywhere;
}
.trio__link {
  font-size: var(--text-xs);
  color: var(--theme-accent);
}
</style>

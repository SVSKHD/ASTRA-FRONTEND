<script setup lang="ts">
// The News tab's admin strip: the sources in the feed, the server job that
// pulls them (`news-pull`, GET /api/scheduler/jobs), and "Refresh now" — which
// asks the scheduler to run that job at once (POST …/news-pull/run, audited)
// and re-reads the feed when the run has finished. Admin only on the server.
import { computed, onBeforeUnmount, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { aureon, errorMessage, type components } from '@/api/client'
import { NEWS_JOB, loadNews } from '@/news/feed'
import { istStamp, type SourceStat } from '@/news/match'
import { ago, when } from '@/trading/format'
import { useNow } from '@/control/poll'

defineProps<{ sources: SourceStat[] }>()

const now = useNow(30_000)

type Job = components['schemas']['ScheduledJobOut']
const job = ref<Job | null>(null)
const jobMissing = ref(false)
const error = ref('')
const busy = ref(false)
const note = ref('')

async function readJob(): Promise<Job | null> {
  const { data, error: err, response } = await aureon.GET('/api/scheduler/jobs')
  if (!data) {
    error.value = errorMessage(err, `Aureon answered ${response.status}`)
    return null
  }
  const j = data.find((x) => x.id === NEWS_JOB) ?? null
  jobMissing.value = !j
  job.value = j
  return j
}
void readJob().catch((e) => (error.value = (e as Error).message))

let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

async function refresh() {
  busy.value = true
  error.value = ''
  note.value = 'Asked the server to pull the feeds…'
  const before = job.value?.last_run_at ?? null
  try {
    const r = await aureon.POST('/api/scheduler/jobs/{job_id}/run', {
      params: { path: { job_id: NEWS_JOB } },
    })
    if (!r.data) {
      error.value = errorMessage(r.error, `Aureon answered ${r.response.status}`)
      note.value = ''
      busy.value = false
      return
    }
    job.value = r.data
    // Watch the job until its last run moves on (the scheduler ticks every few
    // seconds), then read the feed. Give up quietly after two minutes.
    let tries = 0
    const tick = async () => {
      tries++
      const j = await readJob().catch(() => null)
      if (j && j.last_run_at && j.last_run_at !== before && !j.running) {
        await loadNews()
        note.value =
          j.last_status === 'succeeded'
            ? 'Feeds pulled. Any new headlines show under “new”.'
            : `The pull ended ${j.last_status ?? 'without a status'}${j.last_error ? `: ${j.last_error}` : ''}.`
        busy.value = false
        return
      }
      if (tries >= 24) {
        note.value = 'The pull has not finished yet; the feed refreshes on its own.'
        busy.value = false
        return
      }
      timer = setTimeout(tick, 5_000)
    }
    timer = setTimeout(tick, 3_000)
  } catch (e) {
    error.value = (e as Error).message
    note.value = ''
    busy.value = false
  }
}

const tone = computed(() => {
  const j = job.value
  if (!j) return 'neutral'
  if (j.paused) return 'warning'
  if (j.last_error || (j.consecutive_failures ?? 0) > 0) return 'danger'
  return 'success'
})
</script>

<template>
  <section class="nadmin" aria-label="News admin">
    <div class="nadmin__head">
      <div class="nadmin__job">
        <strong>Feed job</strong>
        <Badge
          v-if="job"
          :tone="tone"
          :label="
            job.running ? 'running' : job.paused ? 'paused' : (job.last_status ?? 'never run')
          "
        />
        <span v-if="job" class="nadmin__note"
          >{{ job.last_run_at ? `last run ${ago(job.last_run_at, now)}` : 'not run yet'
          }}{{ job.next_run_at && !job.paused ? ` · next ${when(job.next_run_at)}` : '' }}</span
        >
        <span v-else-if="jobMissing" class="nadmin__note"
          >Not scheduled: the server has no feed URLs (NEWS_FEED_URLS) configured.</span
        >
      </div>
      <Button size="sm" variant="tinted" :loading="busy" :disabled="jobMissing" @click="refresh"
        >Refresh now</Button
      >
    </div>
    <p v-if="job?.last_error" class="nadmin__note" role="alert">Last error: {{ job.last_error }}</p>
    <p v-if="note" class="nadmin__note" role="status" aria-live="polite">{{ note }}</p>
    <p v-if="error" class="nadmin__note" role="alert">{{ error }}</p>
    <div>
      <strong class="nadmin__label">Sources in the feed</strong>
      <ul v-if="sources.length" class="nadmin__sources">
        <li v-for="s in sources" :key="s.source">
          <span class="nadmin__src">{{ s.source || 'Unknown' }}</span>
          <span class="nadmin__note">{{ s.count }} · latest {{ istStamp(s.latest, now) }}</span>
        </li>
      </ul>
      <p v-else class="nadmin__note">No sources yet: the feed is empty.</p>
      <p class="nadmin__note">
        The feed URLs themselves are server configuration (NEWS_FEED_URLS); the list above is what
        they have delivered.
      </p>
    </div>
  </section>
</template>

<style scoped>
.nadmin {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border, var(--glass-border));
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg, var(--glass-card));
}
.nadmin__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.nadmin__job {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-sm);
}
.nadmin__label {
  font-size: var(--text-xs);
}
.nadmin__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
.nadmin__sources {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: var(--sp-1) 0;
  padding: 0;
  list-style: none;
}
.nadmin__sources li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.nadmin__src {
  min-width: 0;
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}
</style>

<script setup lang="ts">
// Automated PR reviews on the selected repo: verdict, summary, findings and the
// data-classification outcome (what was allowed to leave the server). A review
// is advisory: it never approves or blocks a merge, and publishing it posts a
// plain COMMENT review on GitHub, labelled as such here.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Switch from '@/components/ui/Switch.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams, short, type Schemas } from '@/control/api'
import { usePoll } from '@/control/poll'
import { verdictTone } from '@/control/status'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

type Review = Schemas['app__schemas__reviews__ReviewOut']
interface Finding {
  file?: string
  line?: number | null
  severity?: string
  message?: string
}

const route = useRoute()
const router = useRouter()
const prInput = ref(String(route.query.pr ?? ''))
const pr = computed(() => Number(route.query.pr) || 0)
function filter() {
  const n = Number(prInput.value)
  void router.push({ query: n > 0 ? { pr: String(n) } : {} })
}

const list = useLoad(async () => {
  if (!cc.repo) return null
  return must(
    await aureon.GET('/api/v1/reviews', {
      params: { query: { repo: cc.repo, limit: 50, ...(pr.value ? { pr: pr.value } : {}) } },
    }),
  )
}, false)
watch([() => cc.repo, pr], () => void list.reload(), { immediate: true })
const inFlight = computed(() =>
  (list.data.value?.items ?? []).some((r) => r.status === 'queued' || r.status === 'running'),
)
usePoll(() => {
  if (inFlight.value) void list.reload()
}, 5_000)

const busy = ref(false)
const message = ref('')
const force = ref(false)
async function request() {
  const p = repoParams()
  if (!p || !pr.value) return
  busy.value = true
  message.value = ''
  try {
    const q = must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/claude-review', {
        params: { path: { ...p, n: pr.value } },
        body: { force: force.value },
      }),
    )
    message.value = q.deduplicated
      ? `A review of head ${short(q.head_sha)} already exists; showing it.`
      : `Review queued for head ${short(q.head_sha)}.`
    await list.reload()
  } catch (e) {
    message.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const published = ref<Record<string, string>>({})
async function publish(r: Review) {
  busy.value = true
  try {
    const out = must(
      await aureon.POST('/api/v1/reviews/{review_id}/publish', {
        params: { path: { review_id: r.id } },
      }),
    )
    published.value[r.id] =
      `Posted as an advisory COMMENT review: ${out.inline_comments} inline comments, ${out.body_findings} in the body.`
    await list.reload()
  } catch (e) {
    published.value[r.id] = (e as Error).message
  } finally {
    busy.value = false
  }
}

function findings(r: Review): Finding[] {
  return (r.findings ?? []) as Finding[]
}
function severityTone(s?: string) {
  return s === 'critical' || s === 'major' ? 'danger' : s === 'minor' ? 'warning' : 'neutral'
}
function classification(r: Review): string {
  const c = r.classification as { outcome?: string; reasons?: string[] }
  if (!c?.outcome) return ''
  const reasons = c.reasons?.length ? `: ${c.reasons.join('; ')}` : ''
  return `${c.outcome}${reasons}`
}
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="!cc.repo"
      title="No repository selected"
      description="Pick an allowlisted repository in the header."
    />
    <template v-else>
      <Card title="Request a review">
        <p class="tp-note">
          Reviews are advisory. They never approve or block a merge; merging always goes through the
          approval inbox.
        </p>
        <form class="tp-row" @submit.prevent="filter">
          <TextInput
            v-model="prInput"
            size="sm"
            type="number"
            placeholder="PR number"
            aria-label="Pull request number"
          />
          <Button size="sm" type="submit" variant="secondary">Show</Button>
        </form>
        <div v-if="pr" class="tp-row">
          <Switch v-model="force" size="sm" label="Review again even if this head was reviewed" />
          <Button size="sm" variant="primary" :loading="busy" @click="request"
            >Request review of #{{ pr }}</Button
          >
        </div>
        <p v-if="message" class="tp-note" role="status">{{ message }}</p>
      </Card>

      <Card :title="pr ? `Reviews of #${pr}` : 'Recent reviews'">
        <ul v-if="list.data.value?.items.length" class="tp-list">
          <li v-for="r in list.data.value.items" :key="r.id" class="cc-stack cc-review">
            <div class="tp-head">
              <span class="tp-strong">#{{ r.pr_number }} · head {{ short(r.head_sha) }}</span>
              <div class="tp-row">
                <Badge :tone="verdictTone(r.verdict)" :label="r.verdict ?? r.status" />
                <Badge label="Advisory" tone="info" />
              </div>
            </div>
            <span class="tp-note"
              >{{ r.status }} · {{ ago(r.created_at)
              }}{{ r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)} s` : ''
              }}{{ r.forced ? ' · forced' : '' }}</span
            >
            <p v-if="r.summary" class="cc-body">{{ r.summary }}</p>
            <p v-if="r.reason" class="tp-note">Reason: {{ r.reason }}</p>
            <p v-if="classification(r)" class="tp-note">Classification: {{ classification(r) }}</p>
            <ul
              v-if="findings(r).length"
              class="tp-list"
              :aria-label="`Findings of review ${r.id}`"
            >
              <li v-for="(f, i) in findings(r)" :key="i" class="tp-item">
                <div class="tp-main">
                  <span class="tp-strong">{{ f.message }}</span>
                  <span class="tp-note">{{ f.file ?? '—' }}{{ f.line ? `:${f.line}` : '' }}</span>
                </div>
                <Badge :tone="severityTone(f.severity)" :label="f.severity ?? 'info'" />
              </li>
            </ul>
            <p v-else-if="r.status === 'done'" class="tp-note">No findings.</p>
            <div class="tp-row">
              <Button
                v-if="
                  r.status === 'done' &&
                  r.verdict &&
                  r.verdict !== 'REVIEW_UNAVAILABLE' &&
                  r.verdict !== 'BLOCKED'
                "
                size="sm"
                variant="secondary"
                :disabled="busy || r.published"
                @click="publish(r)"
                >{{
                  r.published ? 'Published as a comment' : 'Publish as comment (advisory)'
                }}</Button
              >
              <Button
                size="sm"
                variant="ghost"
                @click="router.push({ path: '/dev/pulls', query: { n: String(r.pr_number) } })"
                >Open PR</Button
              >
            </div>
            <p v-if="published[r.id]" class="tp-note" role="status">{{ published[r.id] }}</p>
          </li>
        </ul>
        <p v-else-if="list.error.value" class="tp-note" role="alert">{{ list.error.value }}</p>
        <p v-else-if="!list.loading.value" class="tp-note">
          No reviews yet{{ pr ? ` for #${pr}` : ' on this repository' }}.
        </p>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.cc-review {
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--glass-border);
}
.cc-review:last-child {
  border-bottom: 0;
}
</style>

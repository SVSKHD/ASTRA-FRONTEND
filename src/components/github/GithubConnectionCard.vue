<script setup lang="ts">
// Aureon's GitHub connection, in one card: whether the server has a token, whose it
// is, what it may do, how much rate limit is left and when the repositories were last
// synced. Shared by the Code tab, the GitHub tab and /dev/github.
//
// The token never comes here: GET /api/v1/github/connection reports a fingerprint and
// a kind. "Check now" asks GitHub who the token is (POST …/connection/check), "Sync
// repositories" refreshes the server's allowlisted repository table.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { ghApi, type GhConnectionOut } from '@/github/aureon'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'
import '@/components/trading/trading.css'
import '@/components/control/control.css'

const emit = defineEmits<{ synced: [count: number] }>()

const conn = useLoad<GhConnectionOut>(() => ghApi.connection())
const busy = defineModel<'' | 'check' | 'sync'>('busy', { default: '' })

async function run(kind: 'check' | 'sync') {
  busy.value = kind
  conn.error.value = ''
  try {
    if (kind === 'check') {
      conn.data.value = await ghApi.checkConnection()
    } else {
      const page = await ghApi.repositories({ refresh: true, limit: 1 })
      conn.data.value = await ghApi.connection()
      emit('synced', page.total)
    }
  } catch (e) {
    conn.error.value = (e as Error).message
  } finally {
    busy.value = ''
  }
}

const c = computed(() => conn.data.value)
const rate = computed(() => c.value?.rate_limit ?? null)
const ratePct = computed(() =>
  rate.value?.limit && rate.value.remaining != null
    ? Math.round((rate.value.remaining / rate.value.limit) * 100)
    : null,
)
const health = computed<{ tone: 'success' | 'danger' | 'neutral'; label: string }>(() =>
  c.value?.ok
    ? { tone: 'success', label: 'Healthy' }
    : c.value?.ok === false
      ? { tone: 'danger', label: 'Failing' }
      : { tone: 'neutral', label: 'Not checked' },
)
const sync = computed(() => c.value?.last_sync ?? null)
const allowlist = computed(() =>
  c.value ? [...c.value.allowed_repos, ...c.value.allowed_owners].join(', ') : '',
)

defineExpose({ reload: conn.reload })
</script>

<template>
  <Card title="GitHub connection" data-testid="gh-connection">
    <p v-if="conn.loading.value && !c" class="tp-note">Reading the connection…</p>
    <template v-else-if="c">
      <div v-if="!c.configured" class="cc-notice cc-notice--warning" role="status">
        <p class="cc-notice__title">GitHub is not configured on the server</p>
        <p class="tp-note">
          Set GITHUB_TOKEN in Aureon's environment (or in Settings). The token never comes to the
          browser.
        </p>
      </div>
      <template v-else>
        <div class="tp-row">
          <Badge :tone="health.tone" :label="health.label" />
          <span class="tp-strong" data-testid="gh-login">{{ c.login ?? 'unknown login' }}</span>
        </div>
        <p class="tp-note">
          {{ c.token_kind ?? 'token' }} · fingerprint {{ c.fingerprint ?? '—' }} · checked
          {{ ago(c.last_checked_at) }}
        </p>
        <p v-if="c.detail" class="tp-note">{{ c.detail }}</p>
        <div class="ghc__scopes" aria-label="Permissions">
          <span class="tp-note">Permissions:</span>
          <template v-if="c.scopes?.length">
            <Badge v-for="s in c.scopes" :key="s" tone="neutral" :label="s" />
          </template>
          <span v-else class="tp-note">
            {{
              c.token_kind === 'fine_grained'
                ? 'fine-grained token (GitHub does not list its permissions)'
                : 'not reported yet'
            }}
          </span>
        </div>
        <p v-if="rate && rate.limit" class="tp-note tp-num">
          Rate limit: {{ rate.remaining }} of {{ rate.limit }} left ({{ ratePct }}%) · resets
          {{ when(rate.reset_at) }}
        </p>
        <p v-else class="tp-note">No rate-limit reading yet. Check the connection to get one.</p>
        <p v-if="sync" class="tp-note" data-testid="gh-last-sync">
          Last sync: {{ sync.status }} {{ ago(sync.finished_at ?? sync.started_at) }} ·
          {{ sync.repos_seen }} seen, {{ sync.repos_upserted }} updated, {{ sync.repos_removed }}
          removed
          <template v-if="sync.error"> · {{ sync.error }}</template>
        </p>
        <p v-else class="tp-note" data-testid="gh-last-sync">Repositories not synced yet.</p>
        <p class="tp-note">Allowlist: {{ allowlist || "the token user's own repositories" }}</p>
      </template>
    </template>
    <p v-if="conn.error.value" class="tp-note" role="alert">{{ conn.error.value }}</p>
    <template #footer>
      <Button
        size="sm"
        variant="secondary"
        :loading="busy === 'check'"
        :disabled="!!busy || c?.configured === false"
        @click="run('check')"
        >Check now</Button
      >
      <Button
        size="sm"
        variant="ghost"
        :loading="busy === 'sync'"
        :disabled="!!busy || c?.configured === false"
        @click="run('sync')"
        >Sync repositories</Button
      >
    </template>
  </Card>
</template>

<style scoped>
.ghc__scopes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
</style>

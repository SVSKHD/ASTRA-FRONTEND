<script setup lang="ts">
// Settings → Integrations → GitHub (section 13a). "Connect GitHub", then a repo
// picker listing the repos the App installation can see with a switch per repo.
//
// The panel never sees a GitHub token: connecting means installing the GitHub
// App, and every read here is a ghProxy Cloud Function call authenticated with
// the user's Firebase ID token.
//
// Built on the app's drawer (focus trap, Escape, a labelled close button) and its
// controls, so every switch and button works from the keyboard. The two actions
// that throw something away ask first, in place: unlinking drops the repo's
// mirrored issues, and disconnecting stops sync.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import SlideOver from '@/components/ui/SlideOver.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import { formatRelative } from '@/utils/timestamps'
import { pausedLabel, rateLimitLabel } from '@/utils/ghPoll'
import type { LinkedRepo } from '@/types'

const app = useAppStore()
const auth = useAuthStore()
const { githubPanelOpen } = storeToRefs(auth)
const { githubIntegration, repos, ghInstalled, ghBusy, ghError } = storeToRefs(app)

const search = ref('')
const installUrl = computed(() => app.githubInstallUrl())

// Opening the panel is what triggers the installation read — there is no reason
// to spend rate limit on a panel nobody opened.
watch(
  githubPanelOpen,
  (open) => {
    if (open && app.githubConfigured && ghInstalled.value === null && !ghBusy.value) {
      void app.loadInstalledRepos()
    }
    if (!open) {
      confirmUnlink.value = null
      confirmDisconnect.value = false
    }
  },
  { immediate: true },
)

const linkedIds = computed(() => new Set(repos.value.map((r) => r.id)))

// What the installation can see, split into what is linked and what is not, each
// newest push first, filtered by the search.
const matches = computed<LinkedRepo[]>(() => {
  const q = search.value.trim().toLowerCase()
  return (ghInstalled.value || [])
    .filter((r) => !q || r.fullName.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => b.pushedAt - a.pushedAt)
})
const linked = computed(() => matches.value.filter((r) => linkedIds.value.has(r.id)))
const available = computed(() => matches.value.filter((r) => !linkedIds.value.has(r.id)))
const installedCount = computed(() => ghInstalled.value?.length ?? 0)

// Rate limit and the paused state are always on screen: a stalled sync should
// be explicable at a glance rather than looking like nothing is happening.
const now = ref(Date.now())
const rateLabel = computed(() => rateLimitLabel(githubIntegration.value.rateLimit, now.value))
const paused = computed(() =>
  pausedLabel(githubIntegration.value.pausedUntil, githubIntegration.value.pausedReason, now.value),
)
const lastSync = computed(() => githubIntegration.value.lastSyncAt)

// Tick the clock while the panel is open so "resuming in 3m" counts down.
let clock: ReturnType<typeof setInterval> | undefined
watch(
  githubPanelOpen,
  (open) => {
    clearInterval(clock)
    clock = open ? setInterval(() => (now.value = Date.now()), 15_000) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(clock))

// --- sync ----------------------------------------------------------------------------
const syncing = ref(false)
const syncNote = ref<{ tone: 'success' | 'warning'; text: string } | null>(null)
async function syncNow() {
  if (syncing.value || !repos.value.length) return
  syncing.value = true
  syncNote.value = null
  let failed = 0
  try {
    for (const repo of repos.value) {
      if (!(await app.refreshRepoIssues(repo.id, true))) failed++
    }
  } finally {
    syncing.value = false
    now.value = Date.now()
  }
  const n = repos.value.length
  syncNote.value = failed
    ? {
        tone: 'warning',
        text: `${failed} of ${n} ${n === 1 ? 'repository' : 'repositories'} could not be synced.`,
      }
    : { tone: 'success', text: `Synced ${n} ${n === 1 ? 'repository' : 'repositories'}.` }
}

// --- link / unlink -----------------------------------------------------------------
/** The repo whose unlink is waiting for a yes. */
const confirmUnlink = ref<string | null>(null)
function onSwitch(repo: LinkedRepo, on: boolean) {
  if (on) {
    if (!linkedIds.value.has(repo.id)) app.toggleRepoLink(repo)
    return
  }
  confirmUnlink.value = repo.id
}
function unlink(repo: LinkedRepo) {
  confirmUnlink.value = null
  if (linkedIds.value.has(repo.id)) app.toggleRepoLink(repo)
}

// --- disconnect ----------------------------------------------------------------------
const confirmDisconnect = ref(false)
function disconnect() {
  confirmDisconnect.value = false
  syncNote.value = null
  app.disconnectGithub()
}

function meta(repo: LinkedRepo): string {
  const bits = [repo.language, repo.defaultBranch, `${repo.openIssuesCount} open`]
  if (repo.pushedAt) bits.push(`pushed ${formatRelative(repo.pushedAt, now.value)}`)
  return bits.filter(Boolean).join(' · ')
}
</script>

<template>
  <SlideOver :open="githubPanelOpen" title="GitHub" size="compact" @close="auth.closeGithubPanel()">
    <div class="gh">
      <!-- No proxy URL: the integration is simply not deployed here. Say so
           rather than offering a Connect button that cannot work. -->
      <EmptyState
        v-if="!app.githubConfigured"
        glyph="🔌"
        title="GitHub is not set up here"
        description="This workspace has no GitHub proxy configured. Set VITE_GH_PROXY_URL to the ghProxy Cloud Function endpoint; the access token stays in Secret Manager and never reaches the browser."
      />

      <!-- Not connected: two steps, in order. -->
      <template v-else-if="!app.githubConnected">
        <section class="gh__intro">
          <h3 class="gh__h">Connect GitHub</h3>
          <p class="gh__muted">
            Install the GitHub App and choose exactly which repositories this workspace can see.
          </p>
          <ul class="gh__perms">
            <li><b>Issues</b> read and write, so tasks and issues stay in step</li>
            <li><b>Contents, metadata, pull requests</b> read only</li>
          </ul>
        </section>

        <ol class="gh__steps">
          <li class="gh__step">
            <span class="gh__num" aria-hidden="true">1</span>
            <div class="gh__stepBody">
              <span class="gh__stepTitle">Install the app on GitHub</span>
              <span class="gh__muted">Opens in a new tab. Pick the repositories there.</span>
              <a
                v-if="installUrl"
                class="gh__linkBtn"
                :href="installUrl"
                target="_blank"
                rel="noopener noreferrer"
                >Install on GitHub ↗</a
              >
            </div>
          </li>
          <li class="gh__step">
            <span class="gh__num" aria-hidden="true">2</span>
            <div class="gh__stepBody">
              <span class="gh__stepTitle">Come back and check</span>
              <span class="gh__muted">This reads the installation and lists its repositories.</span>
              <Button
                size="sm"
                variant="secondary"
                :loading="ghBusy"
                :disabled="ghBusy"
                @click="app.connectGithub()"
              >
                {{ ghBusy ? 'Checking…' : 'I’ve installed it' }}
              </Button>
            </div>
          </li>
        </ol>
        <div v-if="ghError" class="gh__notice is-danger" role="alert">
          <strong>Could not find the installation</strong>
          <span>{{ ghError }}</span>
        </div>
      </template>

      <!-- Connected. -->
      <template v-else>
        <section class="gh__account">
          <Avatar
            :name="githubIntegration.login || 'GitHub'"
            :src="githubIntegration.avatarUrl || undefined"
            size="md"
          />
          <div class="gh__who">
            <span class="gh__login">{{ githubIntegration.login || 'Installed' }}</span>
            <span class="gh__muted">
              {{
                githubIntegration.installationId
                  ? `Installation ${githubIntegration.installationId}`
                  : 'Server token'
              }}
              · connected {{ formatRelative(githubIntegration.connectedAt ?? 0, now) }}
            </span>
          </div>
          <Button
            v-if="!confirmDisconnect"
            size="sm"
            variant="ghost"
            @click="confirmDisconnect = true"
          >
            Disconnect
          </Button>
        </section>

        <div v-if="confirmDisconnect" class="gh__confirm" role="alertdialog" aria-live="polite">
          <span>
            Disconnect GitHub? Sync stops. Linked repositories and their issues stay in the
            workspace, and nothing changes on GitHub.
          </span>
          <span class="gh__confirmActions">
            <Button size="sm" variant="danger" @click="disconnect">Disconnect</Button>
            <Button size="sm" variant="ghost" @click="confirmDisconnect = false">Cancel</Button>
          </span>
        </div>

        <!-- Rate limit is always visible, so a stalled sync is explicable (13f). -->
        <section class="gh__status">
          <div class="gh__statusText">
            <span>{{ rateLabel }}</span>
            <span class="gh__muted">
              {{ lastSync ? `Last synced ${formatRelative(lastSync, now)}` : 'Not synced yet' }}
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            :loading="syncing"
            :disabled="syncing || !repos.length || !!paused"
            :title="!repos.length ? 'Link a repository first' : ''"
            @click="syncNow"
          >
            {{ syncing ? 'Syncing…' : 'Sync now' }}
          </Button>
        </section>

        <!-- Inline, beside what they are about, with their buttons (the library's
             Alert goes to the app's warnings tray and drops actions). -->
        <div v-if="paused" class="gh__notice is-warning" role="status">
          <strong>Sync paused</strong>
          <span>{{ paused }}</span>
          <Button size="sm" variant="secondary" @click="app.resumeGithubSync()">Resume now</Button>
        </div>
        <div v-if="syncNote" class="gh__notice" :class="`is-${syncNote.tone}`" role="status">
          <span>{{ syncNote.text }}</span>
          <Button size="sm" variant="ghost" @click="syncNote = null">Dismiss</Button>
        </div>
        <div v-if="ghError" class="gh__notice is-danger" role="alert">
          <strong>GitHub did not answer</strong>
          <span>{{ ghError }}</span>
          <Button size="sm" variant="secondary" :loading="ghBusy" @click="app.loadInstalledRepos()">
            Try again
          </Button>
        </div>

        <!-- The picker. -->
        <section class="gh__repos" aria-label="Repositories">
          <div class="gh__reposHead">
            <h3 class="gh__h">Repositories</h3>
            <span class="gh__muted">{{ repos.length }} linked of {{ installedCount }}</span>
          </div>
          <SearchField
            v-if="installedCount > 6"
            v-model="search"
            size="sm"
            placeholder="Search repositories"
            label="Search repositories"
          />

          <Skeleton
            v-if="ghBusy && !ghInstalled"
            :lines="4"
            height="52px"
            radius="var(--radius-card)"
          />
          <EmptyState
            v-else-if="!installedCount"
            glyph="📦"
            title="No repositories in this installation"
            description="Add repositories to the GitHub App's installation, then refresh this list."
          />
          <EmptyState
            v-else-if="!matches.length"
            glyph="🔍"
            :title="`Nothing matches “${search.trim()}”`"
          >
            <template #action>
              <Button size="sm" variant="secondary" @click="search = ''">Clear search</Button>
            </template>
          </EmptyState>

          <template v-else>
            <template
              v-for="group in [
                { key: 'linked', title: 'Linked', items: linked },
                { key: 'available', title: 'Available', items: available },
              ]"
              :key="group.key"
            >
              <h4 v-if="group.items.length" class="gh__group">
                {{ group.title }} <span class="gh__count">{{ group.items.length }}</span>
              </h4>
              <ul v-if="group.items.length" class="gh__list">
                <li
                  v-for="repo in group.items"
                  :key="repo.id"
                  class="gh__repo"
                  :class="{ 'is-linked': linkedIds.has(repo.id) }"
                >
                  <div class="gh__repoRow">
                    <div class="gh__repoMain">
                      <span class="gh__repoName">
                        {{ repo.fullName }}
                        <Badge v-if="repo.private" tone="neutral" label="Private" />
                      </span>
                      <span class="gh__muted">{{ meta(repo) }}</span>
                    </div>
                    <Switch
                      class="gh__switch"
                      :model-value="linkedIds.has(repo.id)"
                      :label="`Link ${repo.fullName} to the workspace`"
                      @update:model-value="onSwitch(repo, $event)"
                    />
                  </div>
                  <div v-if="confirmUnlink === repo.id" class="gh__confirm" role="alertdialog">
                    <span>
                      Unlink {{ repo.fullName }}? Its mirrored issues leave the workspace; tasks
                      keep their issue links, and nothing changes on GitHub.
                    </span>
                    <span class="gh__confirmActions">
                      <Button size="sm" variant="danger" @click="unlink(repo)">Unlink</Button>
                      <Button size="sm" variant="ghost" @click="confirmUnlink = null">
                        Keep
                      </Button>
                    </span>
                  </div>
                </li>
              </ul>
            </template>
          </template>

          <p class="gh__foot">
            Missing a repository?
            <a v-if="installUrl" :href="installUrl" target="_blank" rel="noopener noreferrer"
              >Add it to the installation on GitHub ↗</a
            ><template v-else>Add it to the GitHub App's installation</template>, then
            <button
              type="button"
              class="gh__textBtn"
              :disabled="ghBusy"
              @click="app.loadInstalledRepos()"
            >
              {{ ghBusy ? 'refreshing…' : 'refresh the list' }}</button
            >.
          </p>
        </section>
      </template>
    </div>
  </SlideOver>
</template>

<style scoped>
.gh {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.gh__h {
  margin: 0;
  font-size: var(--text-md, var(--text-base));
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.gh__muted {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  overflow-wrap: anywhere;
}
.gh__intro {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.gh__intro p {
  margin: 0;
}
.gh__perms {
  margin: 0;
  padding-left: 1.1em;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gh__perms b {
  color: var(--theme-text);
  font-weight: var(--weight-medium);
}
.gh__steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.gh__step {
  display: flex;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
}
.gh__num {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.gh__stepBody {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  min-width: 0;
}
.gh__stepTitle {
  font-weight: var(--weight-medium);
  color: var(--theme-text);
}
.gh__stepBody > :last-child {
  margin-top: var(--sp-1);
}
.gh__linkBtn {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-decoration: none;
}
.gh__linkBtn:focus-visible,
.gh__textBtn:focus-visible,
.gh__foot a:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.gh__account {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.gh__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.gh__login {
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.gh__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.gh__statusText {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.gh__notice {
  --tone: var(--theme-accent);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid color-mix(in oklch, var(--tone) 40%, var(--theme-border));
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--tone) 9%, transparent);
  font-size: var(--text-sm);
  color: var(--theme-text);
  min-width: 0;
}
.gh__notice.is-danger {
  --tone: var(--theme-danger);
}
.gh__notice.is-warning {
  --tone: var(--theme-warning);
}
.gh__notice.is-success {
  --tone: var(--theme-success);
}
.gh__confirm {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in oklch, var(--theme-danger) 45%, var(--theme-border));
  background: color-mix(in oklch, var(--theme-danger) 8%, transparent);
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.gh__confirmActions {
  display: flex;
  gap: var(--sp-2);
}
.gh__repos {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.gh__reposHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}
.gh__group {
  margin: var(--sp-1) 0 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.gh__count {
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}
.gh__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.gh__repo {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  transition: border-color var(--dur-fast) ease;
}
.gh__repo.is-linked {
  border-color: color-mix(in oklch, var(--theme-success) 45%, var(--theme-border));
}
.gh__repoRow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.gh__repoMain {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.gh__repoName {
  min-width: 0;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  font-weight: var(--weight-medium);
  color: var(--theme-text);
  overflow-wrap: anywhere;
}
/* The switch's label names the repo for a screen reader; the row already shows it. */
.gh__switch :deep(.ui-switch__label) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.gh__foot {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.gh__foot a {
  color: var(--theme-accent);
}
.gh__textBtn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--theme-accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.gh__textBtn:disabled {
  color: var(--theme-dim);
  cursor: default;
}
</style>

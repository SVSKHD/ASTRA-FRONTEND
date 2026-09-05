<script setup lang="ts">
// Linking GitHub, as numbered steps in the app (section 44, item 9).
//
// It replaces a setup that lived in `firebase functions:secrets:set` and in
// somebody's memory of which permissions to tick. Four steps, in the order they
// have to happen, each one saying what it needs and what it will do with it —
// and a live status underneath saying whether any of it worked, which is the
// half a config file can never have.
//
// THE TOKEN IS TYPED HERE AND NOWHERE ELSE. It goes straight to the Cloud
// Function, the field is cleared on the answer, and nothing in this component
// or in `ghSetup.ts` keeps a copy. `type="password"` and `autocomplete="off"`
// so a browser does not offer to remember it either.
import { computed, onMounted, ref } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Icon from '@/components/ui/Icon.vue'
import { useSettings } from '@/composables/useSettings'
import { formatRelative } from '@/utils/timestamps'
import {
  NEW_TOKEN_URL,
  connectGithub,
  disconnectGithub,
  githubRepoOptions,
  githubStatus,
  rateLimitText,
  sendTestEvent,
  webhookUrl,
  type GhRepoOption,
  type GhStatus,
  type GhTestResult,
} from '@/utils/ghSetup'
import { REQUIRED_SCOPES, WEBHOOK_EVENTS } from '@/utils/ghSetupCopy'

const store = useSettings()
const { settings } = store

const status = ref<GhStatus | null>(null)
const statusError = ref('')
const loading = ref(true)

async function refresh(): Promise<void> {
  loading.value = true
  statusError.value = ''
  try {
    status.value = await githubStatus()
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'Could not read the connection.'
    status.value = null
  } finally {
    loading.value = false
  }
}
onMounted(refresh)

const connected = computed(() => status.value?.connected === true)

// ---- step 2: the token ------------------------------------------------------
const pat = ref('')
const connecting = ref<'idle' | 'working' | 'done' | 'failed'>('idle')
const connectError = ref('')

async function connect(): Promise<void> {
  connectError.value = ''
  connecting.value = 'working'
  try {
    await connectGithub(pat.value)
    // Cleared the instant the function has it. The field is the only place the
    // token has ever lived on this machine and it does not live there now.
    pat.value = ''
    connecting.value = 'done'
    await refresh()
    await loadRepos()
  } catch (err) {
    connecting.value = 'failed'
    connectError.value = err instanceof Error ? err.message : 'GitHub refused that token.'
  }
}

async function disconnect(): Promise<void> {
  await disconnectGithub()
  repos.value = []
  await refresh()
}

// ---- step 3: which repositories --------------------------------------------
const repos = ref<GhRepoOption[]>([])
const reposError = ref('')
const reposLoading = ref(false)
const filter = ref('')

async function loadRepos(): Promise<void> {
  if (!connected.value) return
  reposLoading.value = true
  reposError.value = ''
  try {
    repos.value = (await githubRepoOptions()).repos
  } catch (err) {
    reposError.value = err instanceof Error ? err.message : 'Could not list repositories.'
  } finally {
    reposLoading.value = false
  }
}

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const list = q ? repos.value.filter((r) => r.fullName.toLowerCase().includes(q)) : repos.value
  return list.slice(0, 40)
})

const tracked = computed(() => new Set(settings.value.trackedRepos))
function isTracked(fullName: string): boolean {
  return tracked.value.has(fullName.toLowerCase())
}
function toggleRepo(fullName: string, on: boolean): void {
  const name = fullName.toLowerCase()
  const next = on
    ? [...settings.value.trackedRepos, name]
    : settings.value.trackedRepos.filter((r) => r !== name)
  // Tracking is a settings change, so it takes effect without any redeploy —
  // the webhook resolves a delivery to a uid by reading this list.
  void store.save({ trackedRepos: [...new Set(next)] })
}

// ---- step 4: the webhook ----------------------------------------------------
const hookUrl = computed(() => webhookUrl())
const copied = ref('')
async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    setTimeout(() => {
      if (copied.value === what) copied.value = ''
    }, 1600)
  } catch {
    // Clipboard access can be refused; the value is on screen and selectable,
    // which is the fallback rather than an error worth a dialog.
  }
}

const testing = ref<'idle' | 'working' | 'done' | 'failed'>('idle')
const testResult = ref<GhTestResult | null>(null)
const testError = ref('')

async function test(): Promise<void> {
  testing.value = 'working'
  testError.value = ''
  testResult.value = null
  try {
    const result = await sendTestEvent(hookUrl.value)
    testResult.value = result
    testing.value = result.ok ? 'done' : 'failed'
  } catch (err) {
    testing.value = 'failed'
    testError.value = err instanceof Error ? err.message : 'The test could not be sent.'
  }
}

// ---- the live status --------------------------------------------------------
const lastSyncLabel = computed(() => {
  const s = status.value
  if (!s?.connected) return ''
  return s.lastSyncAt
    ? formatRelative(s.lastSyncAt, Date.now())
    : 'not yet — the sweep runs every 15 minutes'
})
const rateText = computed(() =>
  status.value?.connected ? rateLimitText(status.value.rateLimit) : '',
)
</script>

<template>
  <section class="ghs">
    <header class="ghs__head">
      <h3 class="ui-label">Connect GitHub</h3>
      <Button v-if="connected" size="sm" variant="ghost" @click="disconnect">Disconnect</Button>
    </header>

    <!-- THE LIVE STATUS, above the steps once there is one: somebody returning
         to this panel is far more often checking than setting up. -->
    <div v-if="loading" class="ghs__note">Reading the connection…</div>
    <Alert v-else-if="statusError" tone="danger">{{ statusError }}</Alert>
    <Alert v-else-if="status && !status.connected && status.revoked" tone="danger">
      GitHub has revoked the token for <strong>{{ status.login }}</strong
      >. Paste a new one in step 2.
    </Alert>
    <dl v-else-if="status?.connected" class="ghs__status" :class="{ 'is-low': status.low }">
      <div class="ghs__stat">
        <dt>Authenticated as</dt>
        <dd class="ui-mono">{{ status.login || 'unknown' }}</dd>
      </div>
      <div class="ghs__stat">
        <dt>Rate limit remaining</dt>
        <dd class="ui-mono">{{ rateText }}</dd>
      </div>
      <div class="ghs__stat">
        <dt>Last successful sync</dt>
        <dd class="ui-mono">{{ lastSyncLabel }}</dd>
      </div>
      <p v-if="!status.own" class="ghs__note ghs__span">
        Running on the deployment's shared token. Paste your own below to use your own quota.
      </p>
    </dl>

    <ol class="ghs__steps">
      <!-- 1 -->
      <li class="ghs__step">
        <h4 class="ghs__stepTitle">Create a fine-grained token</h4>
        <p class="ghs__note">
          On GitHub, open
          <a class="ghs__link" :href="NEW_TOKEN_URL" target="_blank" rel="noopener noreferrer">
            Settings → Developer settings → Fine-grained tokens<Icon
              name="external-link"
              size="xs"
            />
          </a>
          and give it access to the repositories you want mirrored. Then set exactly these three
          permissions — GitHub cannot pre-fill them from a link, so they are ticked by hand:
        </p>
        <ul class="ghs__scopes">
          <li v-for="scope in REQUIRED_SCOPES" :key="scope.key" class="ghs__scope">
            <span class="ghs__scopeName ui-mono">{{ scope.label }}: {{ scope.access }}</span>
            <span class="ghs__note">{{ scope.why }}</span>
          </li>
        </ul>
        <p class="ghs__note">
          Every one is read-only. This integration mirrors; it never pushes, comments or merges, so
          a leak of a correctly-scoped token reads data you can already see.
        </p>
      </li>

      <!-- 2 -->
      <li class="ghs__step">
        <h4 class="ghs__stepTitle">Paste it once</h4>
        <p class="ghs__note">
          It goes straight to the Cloud Function and is never stored in this browser. The field
          clears itself as soon as the function has it, and nothing can read it back afterwards —
          not this app, and not the account it belongs to.
        </p>
        <div class="ghs__row">
          <TextInput
            v-model="pat"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="github_pat_…"
            aria-label="GitHub fine-grained token"
            @keydown.enter="connect"
          />
          <Button :state="connecting" :disabled="!pat" @click="connect">
            {{ connected ? 'Replace token' : 'Connect' }}
          </Button>
        </div>
        <Alert v-if="connectError" tone="danger" dismissible @dismiss="connectError = ''">
          {{ connectError }}
        </Alert>
      </li>

      <!-- 3 -->
      <li class="ghs__step">
        <h4 class="ghs__stepTitle">Pick the repositories to track</h4>
        <p class="ghs__note">
          A webhook delivery for an untracked repository is acknowledged and dropped. Changing this
          list needs no redeploy.
        </p>
        <template v-if="!connected">
          <p class="ghs__note">Connect a token first — this list is what it can see.</p>
        </template>
        <template v-else>
          <div class="ghs__row">
            <TextInput v-model="filter" placeholder="Filter" aria-label="Filter repositories" />
            <Button
              size="sm"
              variant="ghost"
              :state="reposLoading ? 'working' : 'idle'"
              @click="loadRepos"
            >
              Refresh
            </Button>
          </div>
          <Alert v-if="reposError" tone="danger">{{ reposError }}</Alert>
          <ul v-else-if="shown.length" class="ghs__repos">
            <li v-for="repo in shown" :key="repo.fullName" class="ghs__repo">
              <Checkbox
                :model-value="isTracked(repo.fullName)"
                :aria-label="`Track ${repo.fullName}`"
                @update:model-value="toggleRepo(repo.fullName, $event)"
              />
              <span class="ghs__repoName">{{ repo.fullName }}</span>
              <span v-if="repo.private" class="ghs__badge">private</span>
            </li>
          </ul>
          <p v-else-if="!reposLoading" class="ghs__note">
            The token can see no repositories. Check which ones it was granted in step 1.
          </p>
        </template>
      </li>

      <!-- 4 -->
      <li class="ghs__step">
        <h4 class="ghs__stepTitle">Add the webhook</h4>
        <p class="ghs__note">On each tracked repository: Settings → Webhooks → Add webhook.</p>
        <dl class="ghs__fields">
          <div class="ghs__field">
            <dt>Payload URL</dt>
            <dd>
              <code class="ghs__code">{{ hookUrl }}</code>
              <Button size="sm" variant="ghost" @click="copy(hookUrl, 'url')">
                {{ copied === 'url' ? 'Copied' : 'Copy' }}
              </Button>
            </dd>
          </div>
          <div class="ghs__field">
            <dt>Content type</dt>
            <dd><code class="ghs__code">application/json</code></dd>
          </div>
          <div class="ghs__field">
            <dt>Secret</dt>
            <dd class="ghs__note">
              The same value as the server's <code class="ghs__code">GITHUB_WEBHOOK_SECRET</code>.
              It is never shown here — the app cannot read it, which is the point of it being a
              secret. Set it once with
              <code class="ghs__code">firebase functions:secrets:set GITHUB_WEBHOOK_SECRET</code>
              and paste the same string into GitHub.
            </dd>
          </div>
          <div class="ghs__field">
            <dt>Events</dt>
            <dd>
              <span class="ghs__note">
                Choose “Let me select individual events” and tick these five — they are the ones the
                handler acts on, and any other delivery is acknowledged and dropped:
              </span>
              <ul class="ghs__events">
                <li v-for="event in WEBHOOK_EVENTS" :key="event">
                  <code class="ghs__code">{{ event }}</code>
                </li>
              </ul>
            </dd>
          </div>
        </dl>

        <div class="ghs__row">
          <Button :state="testing" @click="test">Send test event</Button>
          <span v-if="copied === 'url'" class="ghs__note">URL copied.</span>
        </div>
        <Alert v-if="testError" tone="danger" dismissible @dismiss="testError = ''">
          {{ testError }}
        </Alert>
        <Alert v-else-if="testResult" :tone="testResult.ok ? 'success' : 'danger'">
          {{ testResult.detail }}
          <template v-if="testResult.ok">
            This checks the URL and the server's own secret. It cannot check GitHub's copy of the
            secret — a read-only token cannot read a repository's hooks — so if deliveries still do
            not arrive, compare the secret in GitHub's webhook settings with the one you set.
          </template>
        </Alert>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.ghs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.ghs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.ghs__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.ghs__status {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-control);
}
/* A tenth of the window left. The border carries it and the number is still
   ordinary text — colour on a figure would say the figure is bad rather than
   that the quota is low. */
.ghs__status.is-low {
  border-color: var(--theme-warning);
}
.ghs__span {
  grid-column: 1 / -1;
}
.ghs__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ghs__stat dt {
  min-width: 0;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.ghs__stat dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}
/* NUMBERED, and it has to be done with a counter rather than by leaving the
   `<ol>` alone: `display: flex` on a list removes the list-item markers, and
   every step here is a flex column. The counter puts the number back as real
   generated content on a real `<ol>`, so the semantics and the numbers agree —
   and so "step 3" in the copy means the third one however many are added. */
.ghs__steps {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  margin: 0;
  padding: 0;
  min-width: 0;
  counter-reset: ghs-step;
}
.ghs__step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-2) var(--sp-3);
  min-width: 0;
  counter-increment: ghs-step;
}
.ghs__step::before {
  content: counter(ghs-step);
  grid-row: 1 / 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--accent, var(--theme-accent));
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-semibold);
  color: var(--accent, var(--theme-accent));
}
/* Everything after the title sits in the second column, under it. */
.ghs__step > :not(.ghs__stepTitle) {
  grid-column: 2;
}
.ghs__stepTitle {
  grid-column: 2;
  align-self: center;
}
.ghs__stepTitle {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
/* The one link on the panel. Left to the browser it renders `#0000EE` on every
   theme — a hard-coded colour arriving by default rather than by decision,
   which is the same fault section 44 item 10 is about. */
.ghs__link {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  color: var(--accent, var(--theme-accent));
  text-underline-offset: 2px;
}
.ghs__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.ghs__row > :first-child {
  flex: 1 1 220px;
  min-width: 0;
}
.ghs__scopes,
.ghs__repos,
.ghs__events {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.ghs__events {
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.ghs__scope {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ghs__scopeName {
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}
.ghs__repos {
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}
.ghs__repo {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: 2px 0;
}
.ghs__repoName {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}
.ghs__badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  color: var(--text-secondary, var(--theme-dim));
}
.ghs__fields {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
}
.ghs__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ghs__field dt {
  min-width: 0;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.ghs__field dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
}
.ghs__code {
  min-width: 0;
  padding: 2px 6px;
  border-radius: var(--radius-control);
  background: var(--surface-base, transparent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  /* A URL has no break opportunity in it and will otherwise push the panel off
     its own edge. */
  overflow-wrap: anywhere;
  color: var(--text-primary, var(--theme-text));
}
</style>

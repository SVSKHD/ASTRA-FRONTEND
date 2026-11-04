<script setup lang="ts">
// /code-aureon — Code (Aureon): what the self-hosted coding agent offers today.
//
// Two things, both admin-only on the server:
//   - a read-only browser over the allowlisted repositories on the Aureon box
//     (GET /api/repos, …/branches, …/tree, …/file, …/commits)
//   - code tasks (/api/code/*): ask a question about a repo (analyze) or ask for
//     a change. A change runs in its own worktree and branch with the repo's
//     tests; an admin reads the diff and approves or rejects it. Approval queues
//     a git op on the server's coding worker (keep the branch; for a clone of an
//     allowlisted GitHub repo, push it and open a PR), polled here until it ends.
//     Nothing is merged or deployed.
//
// The GitHub mirror (issues, pull requests, comments) and the GitHub setup move
// to Aureon in Phase 21; until then the old Code tab says so and links here.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import FormField from '@/components/ui/FormField.vue'
import Select from '@/components/ui/Select.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import CodeTaskList from '@/components/code/CodeTaskList.vue'
import { aureon, type components } from '@/api/client'
import { checkSession, isAdmin, signIn, tradingSession } from '@/trading/session'
import { must, useLoad } from '@/trading/useLoad'
import { when } from '@/trading/format'
import '@/components/trading/trading.css'

type Task = components['schemas']['CodeTaskOut']

const router = useRouter()
const email = ref('')
const passcode = ref('')

const repos = useLoad(async () => must(await aureon.GET('/api/repos')), false)
const repo = ref('')
const ref_ = ref('')
const dir = ref('')
const filePath = ref('')

const repoOptions = computed(() =>
  (repos.data.value ?? []).map((r) => ({
    value: r.name,
    label: r.available ? r.name : `${r.name} (unavailable)`,
  })),
)
const current = computed(() => repos.data.value?.find((r) => r.name === repo.value))

const branches = useLoad(
  async () =>
    must(
      await aureon.GET('/api/repos/{name}/branches', { params: { path: { name: repo.value } } }),
    ),
  false,
)
const branchOptions = computed(() =>
  (branches.data.value ?? []).map((b) => ({ value: b, label: b })),
)

const tree = useLoad(
  async () =>
    must(
      await aureon.GET('/api/repos/{name}/tree', {
        params: {
          path: { name: repo.value },
          query: { ...(ref_.value ? { ref: ref_.value } : {}), path: dir.value },
        },
      }),
    ),
  false,
)
const sortedTree = computed(() =>
  (tree.data.value ?? [])
    .slice()
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1,
    ),
)

const file = useLoad(
  async () =>
    must(
      await aureon.GET('/api/repos/{name}/file', {
        params: {
          path: { name: repo.value },
          query: { path: filePath.value, ...(ref_.value ? { ref: ref_.value } : {}) },
        },
      }),
    ),
  false,
)

const commits = useLoad(
  async () =>
    must(
      await aureon.GET('/api/repos/{name}/commits', {
        params: {
          path: { name: repo.value },
          query: { ...(ref_.value ? { ref: ref_.value } : {}), limit: 20 },
        },
      }),
    ),
  false,
)

const taskList = ref<InstanceType<typeof CodeTaskList> | null>(null)

watch(repo, () => {
  ref_.value = current.value?.base ?? ''
  dir.value = ''
  filePath.value = ''
  file.data.value = null
  if (!repo.value) return
  void branches.reload()
  void taskList.value?.reload()
})
watch([repo, ref_], () => {
  if (!repo.value) return
  void tree.reload()
  void commits.reload()
})
watch(dir, () => {
  if (repo.value) void tree.reload()
})

function open(item: { type: string; path: string }) {
  if (item.type === 'tree') dir.value = item.path
  else {
    filePath.value = item.path
    void file.reload()
  }
}
function up() {
  dir.value = dir.value.split('/').slice(0, -1).join('/')
}

// --- tasks ------------------------------------------------------------------

const ask = reactive({ question: '', title: '', instruction: '' })
const sending = ref(false)
const sendMsg = ref('')
async function analyze() {
  if (!repo.value || !ask.question.trim()) return
  await submit(() =>
    aureon.POST('/api/code/analyze', {
      body: { repo: repo.value, question: ask.question.trim(), ref: ref_.value || null },
    }),
  )
  ask.question = ''
}
async function change() {
  if (!repo.value || !ask.title.trim() || !ask.instruction.trim()) return
  await submit(() =>
    aureon.POST('/api/code/tasks', {
      body: { repo: repo.value, title: ask.title.trim(), instruction: ask.instruction.trim() },
    }),
  )
  ask.title = ''
  ask.instruction = ''
}
async function submit(
  call: () => Promise<{ data?: Task; error?: unknown; response: Response }>,
): Promise<void> {
  sending.value = true
  sendMsg.value = ''
  try {
    const t = must(await call())
    sendMsg.value = `Queued: ${t.title}. It runs on the server; refresh to follow it.`
    void taskList.value?.reload()
  } catch (e) {
    sendMsg.value = (e as Error).message
  } finally {
    sending.value = false
  }
}

watch(
  () => tradingSession.user,
  (u) => {
    if (u && isAdmin()) void repos.reload()
  },
)
onMounted(() => void checkSession())
</script>

<template>
  <div class="ca">
    <header class="tp-head">
      <div class="ca__brand">
        <h1 class="ca__h1">Code (Aureon)</h1>
        <span class="tp-note"
          >Repositories on the Aureon server, read-only · code tasks run in their own branch ·
          nothing is pushed</span
        >
      </div>
      <Button variant="ghost" size="sm" @click="router.push('/')">Back to Aureon</Button>
    </header>

    <div v-if="!tradingSession.checked" class="tp-note">Checking your Aureon session…</div>

    <Card v-else-if="!tradingSession.user" title="Sign in to Aureon" class="ca__gate">
      <form class="ca__form" @submit.prevent="signIn(email, passcode)">
        <TextInput v-model="email" type="email" placeholder="Email" aria-label="Email" />
        <TextInput
          v-model="passcode"
          type="password"
          placeholder="Passcode"
          aria-label="Passcode"
        />
        <Button type="submit" variant="primary" :loading="tradingSession.busy">Sign in</Button>
      </form>
      <Alert v-if="tradingSession.error" tone="danger">{{ tradingSession.error }}</Alert>
    </Card>

    <p v-else-if="!isAdmin()" class="tp-note">
      The repositories and code tasks are for admins. Ask an admin for access.
    </p>

    <template v-else>
      <Alert v-if="repos.error.value" tone="warning">{{ repos.error.value }}</Alert>
      <p v-else-if="repos.data.value && !repos.data.value.length" class="tp-note">
        No repository is allowlisted on the server yet (CODING_REPOS).
      </p>

      <div v-if="repoOptions.length" class="tp-row">
        <FormField label="Repository">
          <Select v-model="repo" :options="repoOptions" placeholder="Choose a repository" />
        </FormField>
        <FormField v-if="branchOptions.length" label="Branch">
          <Select v-model="ref_" :options="branchOptions" />
        </FormField>
      </div>
      <p v-if="current && !current.available" class="tp-note">
        {{ current.detail || 'This repository is not available on the server.' }}
      </p>

      <div v-if="repo" class="tp-grid">
        <Card>
          <template #header>
            <div class="tp-head">
              <span class="tp-title">Files · /{{ dir }}</span>
              <Button v-if="dir" size="sm" variant="ghost" @click="up">Up</Button>
            </div>
          </template>
          <Alert v-if="tree.error.value" tone="warning">{{ tree.error.value }}</Alert>
          <ul v-else-if="sortedTree.length" class="tp-list">
            <li v-for="item in sortedTree" :key="item.path" class="tp-item">
              <button type="button" class="ca__entry" @click="open(item)">
                {{ item.type === 'tree' ? `${item.name}/` : item.name }}
              </button>
              <span v-if="item.type !== 'tree'" class="tp-note">{{ item.size }} B</span>
            </li>
          </ul>
          <p v-else-if="!tree.loading.value" class="tp-note">This folder is empty.</p>
        </Card>

        <Card title="Recent commits">
          <Alert v-if="commits.error.value" tone="warning">{{ commits.error.value }}</Alert>
          <ul v-else-if="commits.data.value?.length" class="tp-list">
            <li v-for="c in commits.data.value" :key="c.sha" class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ c.subject }}</span>
                <span class="tp-note"
                  >{{ c.sha.slice(0, 8) }} · {{ c.author }} · {{ when(c.date) }}</span
                >
              </div>
            </li>
          </ul>
          <p v-else-if="!commits.loading.value" class="tp-note">No commits on this branch.</p>
        </Card>
      </div>

      <Card v-if="filePath" :title="filePath">
        <Alert v-if="file.error.value" tone="warning">{{ file.error.value }}</Alert>
        <template v-else-if="file.data.value">
          <p v-if="file.data.value.binary" class="tp-note">A binary file; it is not shown.</p>
          <pre v-else class="ca__code">{{ file.data.value.content }}</pre>
          <p v-if="file.data.value.truncated" class="tp-note">Cut short: the file is large.</p>
        </template>
      </Card>

      <Card v-if="repo" title="Code tasks">
        <form class="ca__form" @submit.prevent="analyze">
          <FormField label="Ask about this repository">
            <TextInput v-model="ask.question" placeholder="Where is the session cookie set?" />
          </FormField>
          <div class="tp-row">
            <Button type="submit" size="sm" variant="secondary" :loading="sending">Analyze</Button>
          </div>
        </form>
        <form class="ca__form" @submit.prevent="change">
          <FormField label="Ask for a change">
            <TextInput v-model="ask.title" placeholder="Title" />
          </FormField>
          <TextArea v-model="ask.instruction" placeholder="What should change, and why" />
          <p class="tp-note">
            It runs in its own worktree and branch with the repository's tests. You read the diff
            before anything is kept, and approving makes a local branch only.
          </p>
          <div class="tp-row">
            <Button type="submit" size="sm" variant="primary" :loading="sending">
              Request change
            </Button>
            <span v-if="sendMsg" class="tp-note" role="status">{{ sendMsg }}</span>
          </div>
        </form>

        <CodeTaskList ref="taskList" :repo="repo" />
      </Card>
    </template>
  </div>
</template>

<style scoped>
.ca {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--sp-4) 16px var(--sp-6);
  min-width: 0;
}
.ca__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ca__h1 {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
  min-width: 0;
}
.ca__gate {
  max-width: 440px;
  align-self: center;
}
.ca__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-bottom: var(--sp-3);
  min-width: 0;
}
.ca__entry {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.ca__code {
  margin: 0;
  max-height: 480px;
  overflow: auto;
  padding: var(--sp-2);
  border-radius: var(--radius-control, 6px);
  background: var(--layer-raised-bg);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-primary);
  min-width: 0;
  white-space: pre;
}
.ca__answer {
  white-space: pre-wrap;
}
.ca__task {
  align-items: flex-start;
}
</style>

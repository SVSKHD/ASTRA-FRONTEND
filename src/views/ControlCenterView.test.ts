// The control center (/dev): the admin gate and every module, against a fetch
// stub that routes by path (the TradingView.test.ts pattern). No network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const NOW = new Date().toISOString()
const LATER = new Date(Date.now() + 20 * 60_000).toISOString()
const R = '/api/v1/github/repositories/svskhd/astra'

let role = 'admin'
let signedIn = true
const calls: string[] = []
const writes: { method: string; path: string; body: unknown }[] = []
/** Per-test overrides: `METHOD /path` → [status, body]. */
let overrides: Record<string, [number, unknown] | ((body: unknown) => [number, unknown])> = {}

const REPO = {
  id: 1,
  full_name: 'svskhd/astra',
  owner: 'svskhd',
  name: 'astra',
  description: 'the frontend',
  private: true,
  default_branch: 'main',
  archived: false,
  pushed_at: NOW,
  html_url: 'https://github.com/svskhd/astra',
  synced_at: NOW,
}

function route(method: string, path: string): [number, unknown] {
  if (path === '/api/auth/me')
    return signedIn
      ? [200, { id: 'u', email: 'owner@spasta.online', role, last_login_at: null }]
      : [401, { detail: 'not authenticated' }]
  if (path === '/api/v1/github/connection')
    return [
      200,
      {
        configured: true,
        api_url: 'https://api.github.com',
        fingerprint: 'abcd1234abcd1234',
        token_kind: 'fine_grained',
        login: 'svskhd',
        scopes: [],
        ok: true,
        detail: null,
        rate_limit: { limit: 5000, remaining: 4990, used: 10, reset_at: LATER, resource: 'core' },
        last_checked_at: NOW,
        allowed_owners: [],
        allowed_repos: ['svskhd/astra'],
        last_sync: null,
      },
    ]
  if (path === '/api/v1/github/repositories')
    return [200, { items: [REPO], total: 1, limit: 200, offset: 0 }]
  if (path === `${R}/pulls`) return [200, { items: [PULL], page: 1, per_page: 30, has_next: false }]
  if (path === `${R}/issues`)
    return [200, { items: [ISSUE], page: 1, per_page: 30, has_next: false }]
  if (path === `${R}/actions/runs`)
    return [200, { items: [RUN], page: 1, per_page: 5, has_next: false }]
  if (path === `${R}/branches`)
    return [
      200,
      [
        { name: 'main', sha: 'aaaaaaa1', protected: true },
        { name: 'dev01', sha: 'bbbbbbb2', protected: false },
      ],
    ]
  if (path === `${R}/tree`)
    return [
      200,
      {
        ref: 'main',
        path: '',
        sha: 'aaaaaaa1',
        recursive: false,
        truncated: false,
        entries: [
          { path: 'README.md', type: 'blob', mode: '100644', sha: 'r1', size: 12 },
          { path: 'src', type: 'tree', mode: '040000', sha: 't1', size: null },
        ],
      },
    ]
  if (path === `${R}/commits`)
    return [
      200,
      [
        {
          sha: 'c0ffee1234',
          message: 'Initial commit\n\nbody',
          author_login: 'svskhd',
          author_name: 'S',
          authored_at: NOW,
          committed_at: NOW,
          committer_name: 'S',
          html_url: null,
        },
      ],
    ]
  if (path === `${R}/contents/README.md`)
    return [
      200,
      {
        type: 'file',
        path: 'README.md',
        name: 'README.md',
        content_kind: 'text',
        text: '# Astra\nhello',
        size: 12,
        sha: 'r1',
        ref: 'main',
        encoding: 'utf-8',
        entries: null,
        html_url: null,
        target: null,
      },
    ]
  if (path === `${R}/pulls/7`)
    return [
      200,
      {
        ...PULL,
        commits: 2,
        changed_files: 1,
        additions: 3,
        deletions: 1,
        comments: 0,
        review_comments: 0,
        mergeable: true,
        mergeable_state: 'clean',
        rebaseable: true,
      },
    ]
  if (path === `${R}/pulls/7/issue-comments`)
    return [
      200,
      [
        {
          id: 1,
          body: 'Looks right',
          user: 'svskhd',
          created_at: NOW,
          updated_at: NOW,
          html_url: null,
        },
      ],
    ]
  if (path === `${R}/pulls/7/comments`) return [200, []]
  if (path === `${R}/pulls/7/diff`)
    return [
      200,
      {
        number: 7,
        diff: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n',
        truncated: false,
        too_large_upstream: false,
        bytes_returned: 60,
        max_bytes: 2097152,
      },
    ]
  if (path === `${R}/issues/3`)
    return [
      200,
      {
        ...ISSUE,
        comment_list: [
          {
            id: 5,
            body: 'Seen on an SE',
            user: 'svskhd',
            created_at: NOW,
            updated_at: NOW,
            html_url: null,
          },
        ],
        comments_truncated: false,
        links: LINKS,
      },
    ]
  if (path === '/api/finance/documents/aureon-notes/u')
    return [
      200,
      {
        doc_id: 'u',
        namespace: 'aureon-notes',
        updated_at: NOW,
        data: {
          tasks: [
            { id: 41, title: 'Fix the phone layout', status: 'todo' },
            { id: 42, title: 'Old', status: 'done', archivedAt: 1 },
          ],
        },
      },
    ]
  if (path === '/api/v1/reviews') return [200, { items: [REVIEW], total: 1, limit: 50, offset: 0 }]
  if (path === '/api/trading/order-intents')
    return [200, { items: [], total: 0, limit: 200, offset: 0 }]
  if (path === '/api/v1/approvals/inbox') return [404, { detail: 'Not Found' }]
  if (path === '/api/v1/approvals') return [200, { items: [], total: 0, limit: 200, offset: 0 }]
  void method
  return [200, { items: [], total: 0, limit: 50, offset: 0 }]
}

const PULL = {
  number: 7,
  title: 'Add the control center',
  state: 'open',
  draft: false,
  merged: false,
  locked: false,
  user: 'svskhd',
  body: 'It adds /dev.',
  labels: [],
  requested_reviewers: [],
  head: { ref: 'feat', sha: 'feedface01', label: 'svskhd:feat', repo: 'svskhd/astra' },
  base: { ref: 'dev01', sha: 'base0001', label: 'svskhd:dev01', repo: 'svskhd/astra' },
  html_url: null,
  node_id: null,
  created_at: NOW,
  updated_at: NOW,
  closed_at: null,
  merged_at: null,
  merge_commit_sha: null,
}
const ISSUE = {
  number: 3,
  title: 'Phone layout overflows',
  state: 'open',
  state_reason: null,
  locked: false,
  active_lock_reason: null,
  user: 'svskhd',
  body: 'At 375 px.',
  labels: ['bug'],
  assignees: [],
  milestone: null,
  comments: 1,
  is_pull_request: false,
  html_url: null,
  node_id: 'I_1',
  created_at: NOW,
  updated_at: NOW,
  closed_at: null,
}
let LINKS: unknown[] = []
const REVIEW = {
  id: 'rv1',
  repo: 'svskhd/astra',
  pr_number: 7,
  head_sha: 'feedface01',
  base_sha: 'base0001',
  status: 'done',
  verdict: 'CHANGES_REQUESTED',
  reason: null,
  summary: 'One real problem.',
  findings: [{ file: 'src/x.ts', line: 4, severity: 'major', message: 'Unchecked null' }],
  classification: { outcome: 'REDACT', reasons: ['email'] },
  cli_version: '1',
  duration_ms: 42000,
  forced: false,
  published: false,
  published_at: null,
  published_review_id: null,
  requested_by: 'u',
  created_at: NOW,
  finished_at: NOW,
  advisory: true,
}
const RUN = {
  id: 99,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  workflow_id: 5,
  event: 'push',
  branch: 'dev01',
  head_sha: 'feedface01',
  status: 'completed',
  conclusion: 'failure',
  run_attempt: 1,
  run_number: 12,
  actor: 'svskhd',
  html_url: null,
  created_at: NOW,
  updated_at: NOW,
}

class FakeES {
  static all: FakeES[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners: Record<string, (m: MessageEvent<string>) => void> = {}
  constructor(public url: string) {
    FakeES.all.push(this)
  }
  addEventListener(n: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners[n] = fn
  }
  emit(name: string, data: unknown) {
    this.listeners[name]?.({ data: JSON.stringify(data), lastEventId: '1' } as MessageEvent<string>)
  }
  close() {
    this.readyState = 2
  }
}

beforeEach(() => {
  role = 'admin'
  signedIn = true
  calls.length = 0
  writes.length = 0
  overrides = {}
  LINKS = []
  FakeES.all = []
  try {
    localStorage.clear()
  } catch {
    /* no storage */
  }
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    const key = `${req.method} ${url.pathname}`
    calls.push(key)
    const text = req.method === 'GET' ? '' : await req.text()
    const body = text ? (JSON.parse(text) as unknown) : null
    if (req.method !== 'GET') writes.push({ method: req.method, path: url.pathname, body })
    const o = overrides[key]
    const [status, out] = o
      ? typeof o === 'function'
        ? o(body)
        : o
      : req.method === 'GET' || url.pathname.startsWith('/api/auth')
        ? route(req.method, url.pathname)
        : [404, { detail: 'no stub' }]
    const plain = typeof out === 'string'
    return new Response(plain ? out : JSON.stringify(out), {
      status,
      headers: { 'content-type': plain ? 'text/plain' : 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
afterEach(async () => {
  const { stopApprovals } = await import('@/control/approvals')
  stopApprovals()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 5; i++) await flushPromises()
}
async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 8000, interval: 20 })
}
function button(w: ReturnType<typeof mount>, label: string | RegExp) {
  const b = w
    .findAll('button')
    .find((x) => (typeof label === 'string' ? x.text() === label : label.test(x.text())))
  if (!b) throw new Error(`no button ${label}`)
  return b
}

/** Buttons inside a teleported Modal live on document.body, not in the wrapper. */
async function clickInBody(label: string) {
  await vi.waitFor(
    () => {
      const b = [...document.body.querySelectorAll('button')].find(
        (x) => x.textContent?.trim() === label,
      )
      expect(b, label).toBeTruthy()
      b!.click()
    },
    { timeout: 4000, interval: 20 },
  )
  await settle()
}

async function mountAt(path: string) {
  const View = (await import('./ControlCenterView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dev/:module?', component: View },
      { path: '/trading/:section?', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(View, { global: { plugins: [router] }, attachTo: document.body })
  await settle()
  return { w: wrapper, router }
}

describe('the gate', () => {
  it('asks for an Aureon sign-in when there is no session', async () => {
    signedIn = false
    const { w } = await mountAt('/dev')
    await sees(w, 'Sign in to Aureon')
    expect(calls.some((c) => c.includes('/api/v1/'))).toBe(false)
    w.unmount()
  })

  it('shows a non-admin the gate and never calls an admin endpoint', async () => {
    role = 'user'
    const { w } = await mountAt('/dev/pulls')
    await sees(w, 'Admins only')
    expect(w.text()).toContain('The control center is for admins')
    expect(calls.some((c) => c.includes('/api/v1/'))).toBe(false)
    expect(w.text()).not.toContain('Connection')
    w.unmount()
  })
})

describe('GitHub dashboard', () => {
  it('shows connection health, the rate limit, repos and open work', async () => {
    const { w } = await mountAt('/dev')
    await sees(w, 'Healthy')
    expect(w.text()).toContain('4990 of 5000 left')
    await sees(w, '1 open pull requests')
    expect(w.text()).toContain('1 open issues')
    expect(w.text()).toContain('svskhd/astra')
    await sees(w, 'failure')
    // Reads only.
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true)
    w.unmount()
  })

  it('says when GitHub is not configured on the server', async () => {
    overrides['GET /api/v1/github/connection'] = [
      200,
      {
        configured: false,
        api_url: 'https://api.github.com',
        scopes: [],
        allowed_owners: [],
        allowed_repos: [],
      },
    ]
    const { w } = await mountAt('/dev')
    await sees(w, 'GitHub is not configured on the server')
    w.unmount()
  })
})

describe('repository explorer', () => {
  it('lists branches, the tree and commits, and opens a text file', async () => {
    const { w } = await mountAt('/dev/repo')
    await sees(w, 'README.md')
    await sees(w, 'Initial commit')
    expect(w.text()).toContain('src/')
    await button(w, 'View').trigger('click')
    await sees(w, '# Astra')
    expect(calls).toContain(`GET ${R}/contents/README.md`)
    w.unmount()
  })
})

describe('pull requests', () => {
  it('lists open pull requests and opens one with its conversation', async () => {
    const { w } = await mountAt('/dev/pulls')
    await sees(w, '#7 Add the control center')
    // The last "Open" is the row's; the first is the state filter.
    await w
      .findAll('button')
      .filter((b) => b.text() === 'Open')
      .at(-1)!
      .trigger('click')
    await sees(w, 'head feedfac')
    await sees(w, 'Looks right')
    expect(w.text()).toContain('Merging needs an approval with your password')
    w.unmount()
  })

  it('files a gated merge, shows Approval required, and makes no direct merge call', async () => {
    overrides[`POST ${R}/pulls/7/merge`] = (body) => [
      202,
      {
        approval_id: 'ap-1',
        status: 'pending',
        kind: 'github.pr.merge',
        target: 'svskhd/astra#7',
        artifact_sha256: 'abc123def456',
        expires_at: LATER,
        operation_id: 3,
        artifact: { head_sha: (body as { expected_head_sha: string }).expected_head_sha },
      },
    ]
    const { w, router } = await mountAt('/dev/pulls?n=7')
    await sees(w, 'Request merge')
    await button(w, 'Request merge').trigger('click')
    await clickInBody('Request approval')
    await sees(w, 'Approval required')
    expect(w.text()).toContain('github.pr.merge on svskhd/astra#7 waits for an admin')
    // Exactly one write: the gated request, with the head the approver will see.
    expect(writes).toEqual([
      {
        method: 'POST',
        path: `${R}/pulls/7/merge`,
        body: { merge_method: 'squash', expected_head_sha: 'feedface01' },
      },
    ])
    expect(calls.some((c) => c.includes('/approve'))).toBe(false)
    expect(calls.some((c) => c.startsWith('PUT '))).toBe(false)
    await button(w, 'Open in the approval inbox').trigger('click')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/dev/inbox?id=ap-1')
    w.unmount()
  })

  it('shows the unified diff', async () => {
    const { w } = await mountAt('/dev/pulls?n=7')
    await sees(w, 'Request merge')
    await button(w, 'Diff').trigger('click')
    await sees(w, '+new')
    expect(w.find('[aria-label="Pull request diff"]').exists()).toBe(true)
    w.unmount()
  })
})

describe('issues', () => {
  it('shows an issue with comments and links it to a workspace task', async () => {
    overrides[`POST ${R}/issues/3/links`] = (body) => {
      LINKS = [
        {
          id: 1,
          repo_full_name: 'svskhd/astra',
          issue_number: 3,
          issue_node_id: 'I_1',
          task_ref: (body as { task_ref: string }).task_ref,
          task_kind: 'spasta_task',
          created_by: 'u',
          created_at: NOW,
        },
      ]
      return [201, LINKS[0]]
    }
    const { w } = await mountAt('/dev/issues?n=3')
    await sees(w, '#3 Phone layout overflows')
    await sees(w, 'Seen on an SE')
    expect(w.text()).toContain('This issue is not linked to a task yet.')
    await w.find('input[placeholder="Find a task by title"]').setValue('Fix')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Fix the phone layout'))
    expect(document.body.textContent).not.toContain('Old')
    const opt = [...document.body.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent?.includes('Fix the phone layout'),
    ) as HTMLElement
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    opt.click()
    await settle()
    await button(w, 'Link task').trigger('click')
    await sees(w, 'task 41')
    expect(writes).toEqual([
      {
        method: 'POST',
        path: `${R}/issues/3/links`,
        body: { task_ref: '41', task_kind: 'spasta_task' },
      },
    ])
    w.unmount()
  })
})

describe('reviews', () => {
  it('shows the verdict, findings and classification, and labels publish as advisory', async () => {
    const { w } = await mountAt('/dev/reviews?pr=7')
    await sees(w, 'CHANGES_REQUESTED')
    expect(w.text()).toContain('Unchecked null')
    expect(w.text()).toContain('src/x.ts:4')
    expect(w.text()).toContain('Classification: REDACT: email')
    expect(w.text()).toContain('Publish as comment (advisory)')
    expect(w.text()).toContain('Request review of #7')
    w.unmount()
  })
})

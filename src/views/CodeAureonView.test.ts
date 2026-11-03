// Code (Aureon): the repository browser and code tasks against a stubbed API.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const NOW = new Date().toISOString()
let role = 'admin'
const posts: { path: string; body: unknown }[] = []

const TASK = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'change',
  repo: 'astra',
  title: 'Rename the helper',
  instruction: 'x',
  paths: [],
  status: 'ready',
  base_ref: 'main',
  base_sha: 'abc',
  branch: 'agent/1',
  commit_sha: 'def',
  model: null,
  result: {},
  tests: [{ ok: true, cmd: 'npm test' }],
  error: null,
  created_at: NOW,
  started_at: null,
  finished_at: null,
  decided_at: null,
}

const GIT_OP = {
  id: 'op-1',
  op: 'task',
  repo: 'demo',
  task_id: 't-1',
  branch: 'feature/b',
  title: 'aureon: b',
  status: 'done',
  head_sha: null,
  pr_number: null,
  pr_url: null,
  result: { pushed: false },
  error: null,
  created_at: '2026-11-03T10:00:00Z',
  started_at: null,
  finished_at: null,
}

function route(method: string, path: string, query: URLSearchParams): [number, unknown] {
  if (path === '/api/auth/me')
    return [200, { id: 'u', email: 'owner@spasta.online', role, last_login_at: null }]
  if (path === '/api/repos')
    return [200, [{ name: 'astra', base: 'main', available: true, tests: [], head: 'abc' }]]
  if (path === '/api/repos/astra/branches') return [200, ['main', 'dev']]
  if (path === '/api/repos/astra/tree')
    return query.get('path')
      ? [200, [{ name: 'a.ts', path: 'src/a.ts', type: 'blob', mode: '100644', size: '12' }]]
      : [
          200,
          [
            { name: 'README.md', path: 'README.md', type: 'blob', mode: '100644', size: '40' },
            { name: 'src', path: 'src', type: 'tree', mode: '040000', size: '-' },
          ],
        ]
  if (path === '/api/repos/astra/file')
    return [
      200,
      {
        path: 'src/a.ts',
        ref: 'main',
        size: 12,
        binary: false,
        truncated: false,
        content: 'export {}',
      },
    ]
  if (path === '/api/repos/astra/commits')
    return [200, [{ sha: 'abcdef1234', author: 'H', date: NOW, subject: 'First commit' }]]
  if (path === '/api/code/tasks' && method === 'GET')
    return [200, { items: [TASK], total: 1, limit: 50, offset: 0 }]
  if (path.endsWith('/diff'))
    return [200, { task_id: TASK.id, files: ['src/a.ts'], diff: '+export const b = 1' }]
  if (path.endsWith('/approve'))
    return [
      200,
      {
        ...TASK,
        status: 'approved',
        result: { feature_branch: 'feature/b' },
        git_op: { ...GIT_OP, status: 'queued' },
      },
    ]
  if (path === `/api/code/git/ops/${GIT_OP.id}`) return [200, GIT_OP]
  if (path === '/api/code/analyze') return [202, { ...TASK, kind: 'analyze', status: 'queued' }]
  return [404, { detail: 'not found' }]
}

beforeEach(() => {
  role = 'admin'
  posts.length = 0
  vi.resetModules()
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    if (req.method === 'POST') {
      const text = await req.text()
      posts.push({ path: url.pathname, body: text ? JSON.parse(text) : null })
    }
    const [status, body] = route(req.method, url.pathname, url.searchParams)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
afterEach(() => vi.unstubAllGlobals())

async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 3000, interval: 20 })
}

async function mountView() {
  const View = (await import('./CodeAureonView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/code-aureon', component: View },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  await router.push('/code-aureon')
  const w = mount(View, { global: { plugins: [router] }, attachTo: document.body })
  for (let i = 0; i < 5; i++) await flushPromises()
  return w
}

describe('CodeAureonView', () => {
  it('tells a non-admin the page is for admins', async () => {
    role = 'user'
    const w = await mountView()
    await sees(w, 'for admins')
    w.unmount()
  })

  it('browses a repository, opens a file, and approves a ready change', async () => {
    const w = await mountView()
    await sees(w, 'Choose a repository')
    const Select = (await import('@/components/ui/Select.vue')).default
    w.findComponent(Select).vm.$emit('update:modelValue', 'astra')
    await sees(w, 'README.md')
    await sees(w, 'First commit')
    await sees(w, 'Rename the helper')
    expect(w.text()).toContain('Test passed: npm test')

    await w
      .findAll('button')
      .find((b) => b.text() === 'src/')!
      .trigger('click')
    await sees(w, 'a.ts')
    await w
      .findAll('button')
      .find((b) => b.text() === 'a.ts')!
      .trigger('click')
    await sees(w, 'export {}')

    await w
      .findAll('button')
      .find((b) => b.text() === 'Diff')!
      .trigger('click')
    await sees(w, '+export const b = 1')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Approve')!
      .trigger('click')
    await sees(w, 'The coding worker is about to keep feature/b')
    // the queued git op is polled (first after 1.5 s) until it ends
    await vi.waitFor(
      () =>
        expect(w.text()).toContain('Approved on the local branch feature/b. Nothing was pushed.'),
      { timeout: 5000, interval: 50 },
    )
    expect(posts.map((p) => p.path)).toEqual([`/api/code/tasks/${TASK.id}/approve`])
    w.unmount()
  }, 20_000)
})

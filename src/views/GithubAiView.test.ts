// The GitHub AI workspace end to end with the server mocked: browse a repository, open a
// file, explain it (streamed, with thinking steps), and request a change that lands only
// after its diff is approved.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const gh = vi.hoisted(() => ({
  repositories: vi.fn(),
  branches: vi.fn(),
  tree: vi.fn(),
  contents: vi.fn(),
  pulls: vi.fn(),
  commits: vi.fn(),
  pullFiles: vi.fn(),
  pull: vi.fn(),
}))
vi.mock('@/github/aureon', () => ({ ghApi: gh }))

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (_: unknown, f: string) => f,
  onUnauthorized: () => () => {},
}))

const chat = vi.hoisted(() => ({
  calls: [] as { message: string; agent?: string; chatKey: string | null }[],
}))
vi.mock('@/ai/aureonChat', async (orig) => {
  const real = await orig<typeof import('@/ai/aureonChat')>()
  return {
    ...real,
    async *streamChat(opts: { message: string; agent?: string; chatKey: string | null }) {
      chat.calls.push(opts)
      yield { meta: { conversationId: 'c-gh', agent: 'general' } }
      yield { text: 'It **exports** one constant.' }
      yield {
        done: {
          conversationId: 'c-gh',
          messageId: 1,
          costUsd: '0.0020',
          steps: 1,
          stopReason: 'end_turn',
          approvals: [],
        },
      }
    },
  }
})

import GithubAiView from './GithubAiView.vue'
import { tradingSession } from '@/trading/session'
import { aureonAi } from '@/ai/aureonChat'
import { SYSTEM } from '@/github/workspace'

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: status < 400, status, headers: new Headers() },
})
const TASK = {
  id: 't1',
  title: 'Rename a',
  kind: 'change',
  status: 'ready',
  repo: 'astra',
  branch: 'aureon/task-t1',
  paths: ['src/a.ts'],
  tests: [{ ok: true, cmd: 'pnpm test' }],
  result: {},
  created_at: '2026-11-04T10:00:00Z',
  error: null,
}

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/github-ai', component: GithubAiView },
      { path: '/dev/reviews', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const w = mount(GithubAiView, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return { w, router }
}

describe('<GithubAiView />', () => {
  beforeEach(() => {
    Object.values(gh).forEach((f) => f.mockReset())
    Object.values(api).forEach((f) => f.mockReset())
    chat.calls = []
    aureonAi.conversations = {}
    Object.assign(tradingSession, {
      checked: true,
      user: { uid: 'u1', name: 'o', email: 'o@x', provider: 'aureon', initial: 'O', color: '#000' },
      role: 'admin',
      error: '',
    })
    gh.repositories.mockResolvedValue({
      items: [
        {
          id: 1,
          owner: 'svskhd',
          name: 'astra',
          full_name: 'svskhd/astra',
          default_branch: 'dev01',
          archived: false,
        },
      ],
      total: 1,
    })
    gh.branches.mockResolvedValue([{ name: 'dev01', protected: true, sha: 'a' }])
    gh.tree.mockResolvedValue({
      entries: [
        { path: 'src', type: 'tree' },
        { path: 'src/a.ts', type: 'blob' },
        { path: 'README.md', type: 'blob' },
      ],
      truncated: false,
    })
    gh.contents.mockResolvedValue({
      type: 'file',
      path: 'src/a.ts',
      content_kind: 'text',
      text: 'export const a = 1 // TODO: rename',
    })
    gh.pulls.mockResolvedValue({ items: [], has_next: false })
    api.GET.mockImplementation(async (path: string) => {
      if (path === '/api/code/git/repos')
        return ok([
          {
            repo: 'svskhd/astra',
            coding_repo: 'astra',
            cloned: true,
            default_branch: 'dev01',
            push_prefixes: [],
          },
        ])
      if (path === '/api/code/tasks') return ok({ items: [TASK], total: 1, limit: 20, offset: 0 })
      return ok(undefined, 404)
    })
  })

  it('browses, opens a file with its TODOs, and explains it with thinking steps', async () => {
    const { w } = await mountAt('/github-ai')
    expect(gh.tree).toHaveBeenCalledWith(
      'svskhd',
      'astra',
      { ref: 'dev01', recursive: true },
      expect.anything(),
    )
    const files = () => w.findAll('[data-testid="file-list"] button').map((b) => b.text())
    expect(files()).toEqual(['src/', 'README.md'])
    await w.findAll('[data-testid="file-list"] button')[0].trigger('click')
    expect(files()).toEqual(['a.ts'])
    await w.findAll('[data-testid="file-list"] button')[0].trigger('click')
    await flushPromises()
    expect(gh.contents).toHaveBeenCalledWith(
      'svskhd',
      'astra',
      'src/a.ts',
      'dev01',
      expect.anything(),
    )
    expect(w.get('[data-testid="file-view"]').text()).toContain('line 1: rename')

    await w.get('[data-testid="act-explain"]').trigger('click')
    await flushPromises()
    expect(chat.calls[0].chatKey).toBe('gh:svskhd/astra')
    expect(chat.calls[0].agent).toBe('general')
    // A new repository conversation carries the review instructions, then the ask.
    expect(chat.calls[0].message).toContain(SYSTEM.slice(0, 40))
    expect(chat.calls[0].message).toContain('`src/a.ts` in svskhd/astra@dev01')
    const answer = w.get('[data-testid="ai-answer"]')
    expect(answer.html()).toContain('<strong>exports</strong>')
    expect(answer.text()).toContain('Claude · General agent')
  })

  it('requests a change on the server clone and approves its diff', async () => {
    api.POST.mockImplementation(async (path: string) => {
      if (path === '/api/code/tasks') return ok({ ...TASK, id: 't2', status: 'queued' }, 202)
      if (path === '/api/code/tasks/{task_id}/approve')
        return ok({
          ...TASK,
          status: 'approved',
          git_op: { id: 'op1', status: 'done', branch: 'aureon/task-t1', pr_url: null },
        })
      return ok(undefined, 404)
    })
    const { w } = await mountAt('/github-ai?path=src/a.ts&do=change')
    await flushPromises()
    expect(w.text()).toContain('Runs in astra on its own branch')
    const inputs = w.findAll('input')
    await inputs.find((i) => i.attributes('aria-label') === 'Title')!.setValue('Rename a')
    await w.get('.gw__form textarea').setValue('Call it answer')
    await w.get('.gw__form').trigger('submit')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/code/tasks', {
      body: {
        repo: 'astra',
        title: 'Rename a',
        instruction: 'Call it answer',
        paths: ['src/a.ts'],
      },
    })
    await w.get('[data-testid="approve-t1"]').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/code/tasks/{task_id}/approve', {
      params: { path: { task_id: 't1' } },
      body: null,
    })
    expect(w.text()).toContain('Approved on the local branch aureon/task-t1. Nothing was pushed.')
  })

  it('says when a repository has no clone on the server', async () => {
    api.GET.mockImplementation(async (path: string) =>
      path === '/api/code/git/repos' ? ok([]) : ok(undefined, 404),
    )
    const { w } = await mountAt('/github-ai?tab=changes')
    expect(w.text()).toContain('No clone of svskhd/astra on the server')
    expect(w.find('[data-testid="send-change"]').exists()).toBe(false)
  })
})

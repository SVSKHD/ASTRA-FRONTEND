import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useSyncGuard } from '@/composables/useSyncGuard'
import type { GithubIssue, LinkedRepo, Task } from '@/types'

function makeTask(id: number, over: Partial<Task> = {}): Task {
  return {
    id,
    title: 'task ' + id,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: 0,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    github: null,
    ...over,
  }
}

function makeRepo(over: Partial<LinkedRepo> = {}): LinkedRepo {
  return {
    id: 'octo__demo',
    owner: 'octo',
    name: 'demo',
    fullName: 'octo/demo',
    defaultBranch: 'main',
    private: false,
    htmlUrl: 'https://github.com/octo/demo',
    stars: 0,
    openIssuesCount: 1,
    language: 'TypeScript',
    pushedAt: 0,
    linkedAt: 0,
    syncEnabled: true,
    labelFilter: [],
    lastSyncAt: 0,
    etag: '',
    ...over,
  }
}

function makeIssue(over: Partial<GithubIssue> = {}): GithubIssue {
  return {
    id: 'octo__demo__12',
    repoId: 'octo__demo',
    number: 12,
    title: 'Fix the thing',
    body: '',
    state: 'open',
    labels: [],
    assignees: [],
    author: 'octo',
    htmlUrl: 'https://github.com/octo/demo/issues/12',
    createdAt: 0,
    updatedAt: 1000,
    closedAt: null,
    commentsCount: 0,
    linkedTaskId: 1,
    etag: '',
    ...over,
  }
}

const link = {
  repoId: 'octo__demo',
  issueNumber: 12,
  issueUrl: 'https://github.com/octo/demo/issues/12',
  state: 'open' as const,
  syncedAt: 0,
}

describe('repo linking', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('links a repo once and refreshes it on a second link', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.linkRepo(makeRepo({ stars: 42 }))
    expect(app.repos).toHaveLength(1)
    expect(app.repos[0].stars).toBe(42)
  })

  it('keeps the local sync toggle and label filter across a metadata refresh', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.setRepoSync('octo__demo', false)
    app.setRepoLabelFilter('octo__demo', [' bug ', ''])
    app.linkRepo(makeRepo({ stars: 7 }))
    expect(app.repos[0].syncEnabled).toBe(false)
    expect(app.repos[0].labelFilter).toEqual(['bug'])
  })

  it('unlinking drops the repo and its mirrored issues but leaves the task link', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1, { github: link })]
    app.ingestGithubIssues([makeIssue()])
    app.unlinkRepo('octo__demo')
    expect(app.repos).toEqual([])
    expect(app.ghIssues).toEqual([])
    expect(app.tasks[0].github).not.toBeNull()
  })

  it('toggleRepoLink flips both ways', () => {
    const app = useAppStore()
    app.toggleRepoLink(makeRepo())
    expect(app.repos).toHaveLength(1)
    app.toggleRepoLink(makeRepo())
    expect(app.repos).toHaveLength(0)
  })
})

describe('webhook ingestion', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('marks the linked task done when the issue closes (acceptance 56)', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1, { status: 'progress', github: link })]
    app.ingestGithubDeliveries([
      {
        event: 'issues',
        action: 'closed',
        repoId: 'octo__demo',
        deliveryId: 'd1',
        receivedAt: 1,
        issue: {
          number: 12,
          title: 'Fix the thing',
          state: 'closed',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    ])
    expect(app.tasks[0].status).toBe('done')
    expect(app.tasks[0].done).toBe(true)
    expect(app.tasks[0].github?.state).toBe('closed')
  })

  it('moves the task back to in-progress when the issue reopens', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1, { status: 'done', done: true, github: { ...link, state: 'closed' } })]
    app.ingestGithubIssues([makeIssue({ state: 'open', updatedAt: 5000 })])
    expect(app.tasks[0].status).toBe('progress')
  })

  it('ignores a delivery for a repo this workspace has not linked', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1, { github: link })]
    const applied = app.ingestGithubDeliveries([
      {
        event: 'issues',
        action: 'closed',
        repoId: 'octo__demo',
        deliveryId: 'd1',
        receivedAt: 1,
        issue: { number: 12, state: 'closed' },
      },
    ])
    expect(applied).toBe(0)
    expect(app.tasks[0].status).toBe('pending')
  })

  it('applies a push event to the repo record', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.ingestGithubDeliveries([
      {
        event: 'push',
        action: '',
        repoId: 'octo__demo',
        deliveryId: 'd2',
        receivedAt: 9,
        repository: { pushed_at: '2024-05-05T00:00:00Z', open_issues_count: 6 },
      },
    ])
    expect(app.repos[0].pushedAt).toBe(Date.parse('2024-05-05T00:00:00Z'))
    expect(app.repos[0].openIssuesCount).toBe(6)
  })

  it('mirrors an issue with no linked task without inventing one', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.ingestGithubIssues([makeIssue({ linkedTaskId: null })])
    expect(app.ghIssues).toHaveLength(1)
    expect(app.tasks).toEqual([])
  })
})

describe('the sync guard holds webhooks off an open dialog', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defers the effect while the task dialog is open, then replays it on close (acceptance 57)', () => {
    const app = useAppStore()
    const guard = useSyncGuard()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1, { status: 'progress', github: link })]

    // The user opens the task and renames it.
    app.openEdit('task', 1)
    app.updateTask(1, 'title', 'My edit')

    // A webhook lands mid-edit saying the issue closed.
    app.ingestGithubIssues([makeIssue({ state: 'closed', updatedAt: 5000 })])
    expect(app.tasks[0].status).toBe('progress')
    expect(app.tasks[0].title).toBe('My edit')

    // Closing the dialog writes the edit first, then replays the webhook.
    app.closeItemDialog()
    expect(guard.isEditing(1)).toBe(false)
    expect(app.tasks[0].title).toBe('My edit')
    expect(app.tasks[0].status).toBe('done')
  })
})

describe('task ↔ issue linking (13c)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('links an existing issue on both sides and adopts its state', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1)]
    app.ingestGithubIssues([makeIssue({ linkedTaskId: null, state: 'closed' })])
    expect(app.linkIssueToTask(1, 'octo__demo__12')).toBe(true)
    expect(app.tasks[0].github).toMatchObject({ repoId: 'octo__demo', issueNumber: 12 })
    expect(app.ghIssues[0].linkedTaskId).toBe(1)
    expect(app.tasks[0].status).toBe('done')
  })

  it('unlinking clears the task side and leaves the issue itself alone', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1)]
    app.ingestGithubIssues([makeIssue({ linkedTaskId: null })])
    app.linkIssueToTask(1, 'octo__demo__12')
    app.unlinkIssueFromTask(1)
    expect(app.tasks[0].github).toBeNull()
    expect(app.ghIssues).toHaveLength(1)
    expect(app.ghIssues[0].linkedTaskId).toBeNull()
  })

  it('offers only unclaimed issues in linked repos as link candidates', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.tasks = [makeTask(1, { github: link })]
    app.ingestGithubIssues([
      makeIssue(),
      makeIssue({ id: 'octo__demo__13', number: 13, title: 'Another', linkedTaskId: null }),
      makeIssue({ id: 'other__repo__1', repoId: 'other__repo', number: 1, linkedTaskId: null }),
    ])
    expect(app.linkableIssues('').map((i) => i.id)).toEqual(['octo__demo__13'])
    expect(app.linkableIssues('13').map((i) => i.id)).toEqual(['octo__demo__13'])
    expect(app.linkableIssues('another').map((i) => i.id)).toEqual(['octo__demo__13'])
    expect(app.linkableIssues('nothing')).toEqual([])
  })

  it('pulls an issue in as a task, stripping our own footer from the body', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.ingestGithubIssues([
      makeIssue({
        linkedTaskId: null,
        body: 'Real description\n\n---\n[Open in Spasta](https://x/tasks/4/view)\n<!-- spasta:taskId:4 -->',
      }),
    ])
    const newId = app.createTaskFromIssue('octo__demo__12') as number
    const task = app.tasks.find((t) => t.id === newId) as Task
    expect(task.notes).toBe('Real description')
    expect(task.github?.issueNumber).toBe(12)
    expect(app.ghIssues[0].linkedTaskId).toBe(newId)
  })

  it('bulk creation skips already-linked issues, so a re-run cannot duplicate (acceptance 58)', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.ingestGithubIssues([
      makeIssue({ linkedTaskId: null }),
      makeIssue({ id: 'octo__demo__13', number: 13, linkedTaskId: null }),
    ])
    expect(app.createTasksFromIssues(['octo__demo__12', 'octo__demo__13'])).toBe(2)
    expect(app.createTasksFromIssues(['octo__demo__12', 'octo__demo__13'])).toBe(0)
    expect(app.tasks).toHaveLength(2)
  })

  it('carries a closed issue in as a done task', () => {
    const app = useAppStore()
    app.linkRepo(makeRepo())
    app.ingestGithubIssues([makeIssue({ linkedTaskId: null, state: 'closed', closedAt: 77 })])
    const newId = app.createTaskFromIssue('octo__demo__12') as number
    const task = app.tasks.find((t) => t.id === newId) as Task
    expect(task.status).toBe('done')
    expect(task.done).toBe(true)
  })
})

// The Deploys and CI monitor with live deploy progress: the running deploy is selected
// automatically and shown stage by stage from the server's answers, a previous deploy can be
// selected, polling is fast only while something deploys, a finished deploy is announced,
// "Deployed" appears only when the server recorded it, and narrow screens use a drawer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import CcActionsMonitor from './CcActionsMonitor.vue'

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const NOW = new Date().toISOString()
const deploy = (id: number, status: string, over: Record<string, unknown> = {}) => ({
  kind: 'deploy',
  id: `deploy:${id}`,
  name: 'deploy:backend',
  repo: 'SVSKHD/Aureon_agents_Assembler',
  branch: 'main',
  sha: 'c'.repeat(40),
  status,
  started_at: NOW,
  ...over,
})
const ci = { kind: 'ci', id: 'ci:77', name: 'CI', status: 'running', started_at: NOW }

const STAGES = ['queued', 'pulling', 'validating', 'building', 'migrating', 'restarting',
  'health_checking', 'verifying'] // prettier-ignore
function progress(
  run: number,
  done: number,
  outcome = 'running',
  over: Record<string, unknown> = {},
) {
  return {
    run_id: run,
    deployment_id: run,
    target: 'backend',
    repo: 'SVSKHD/Aureon_agents_Assembler',
    branch: 'main',
    environment: 'production',
    expected_sha: 'c'.repeat(40),
    deployed_sha: done > 1 ? 'c'.repeat(40) : null,
    previous_sha: 'd'.repeat(40),
    commit_verified: done === 8 ? true : null,
    pr_number: 46,
    outcome,
    health_verified_at: outcome === 'completed' ? NOW : null,
    rolled_back: outcome === 'rolled_back',
    failure_reason: null,
    started_at: NOW,
    finished_at: null,
    updated_at: NOW,
    stale: false,
    current_stage: done < 8 && outcome === 'running' ? STAGES[done] : null,
    stages_completed: done,
    stages_total: 8,
    stages: STAGES.map((name, i) => ({
      name,
      label: name,
      status: i < done ? 'succeeded' : i === done && outcome === 'running' ? 'running' : 'pending',
      started_at: i <= done ? NOW : null,
      finished_at: i < done ? NOW : null,
      duration_ms: i <= done ? 1200 : null,
      error: null,
    })),
    log_available: true,
    ...over,
  }
}

let monitorItems: unknown[] = []
let progressFor: Record<number, unknown> = {}
const calls = () => api.GET.mock.calls.map(([p]) => p as string)

function serve() {
  api.GET.mockImplementation(async (path: string, opts: { params?: { path?: { run_id?: number } } }) => {
    if (path === '/api/v1/github/actions/monitor') return res({ items: monitorItems, latest_at: NOW })
    const run = opts?.params?.path?.run_id ?? 0
    if (path.endsWith('/progress')) return progressFor[run] ? res(progressFor[run]) : res({ detail: 'no' }, 404)
    if (path.endsWith('/logs')) return res({ run_id: run, text: `building image for run ${run}\nstep 2/9`, truncated: false, updated_at: NOW, running: true })
    return res({}, 404)
  }) // prettier-ignore
}

function setWidth(wide: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: wide,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  // The component reads window.matchMedia.
  ;(window as unknown as { matchMedia: unknown }).matchMedia = globalThis.matchMedia
}

const stubs = { teleport: true }
const statusOf = (w: ReturnType<typeof mount>, name: string) =>
  w.get(`[data-stage="${name}"]`).attributes('data-status')

describe('<CcActionsMonitor /> live deploy progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.GET.mockReset()
    monitorItems = [ci, deploy(12, 'running', { stage: 'building', stages_completed: 3, stages_total: 8 }), deploy(11, 'success')]
    progressFor = { 12: progress(12, 3), 11: progress(11, 8, 'completed') }
    serve()
    setWidth(true)
  }) // prettier-ignore
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('selects the running deploy and shows its stages, progress and log from the server', async () => {
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    const panel = w.get('[data-testid="deploy-progress"]')
    expect(statusOf(w, 'pulling')).toBe('succeeded')
    expect(statusOf(w, 'building')).toBe('running')
    expect(statusOf(w, 'verifying')).toBe('pending')
    expect(w.get('[data-testid="deploy-percent"]').text()).toContain('3 / 8 stages · 38%')
    expect(w.get('[data-testid="deploy-outcome"]').text()).toContain('Deploying')
    expect(panel.text()).toContain('building image for run 12')
    expect(panel.text()).toContain('PR #46')
    expect(w.get('[data-id="deploy:12"]').classes()).toContain('is-selected')
    expect(w.get('[data-id="deploy:12"]').text()).toContain('running · building')
    // CI rows are not selectable.
    expect(w.get('[data-id="ci:77"]').find('button').exists()).toBe(false)
  })

  it('lets the admin select a previous deploy and keeps that choice', async () => {
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    await w.get('[data-id="deploy:11"] button').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="deploy-outcome"]').text()).toContain('Deployed · health verified')
    expect(w.get('[data-testid="deploy-commit"]').text()).toContain('the expected commit')
    await vi.advanceTimersByTimeAsync(4_000)
    await flushPromises()
    expect(w.get('[data-id="deploy:11"]').classes()).toContain('is-selected')
  })

  it('never says deployed until the server recorded the outcome', async () => {
    // Every stage reported done, but the deploy is not recorded as finished yet.
    progressFor[12] = progress(12, 8, 'running')
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    expect(w.get('[data-testid="deploy-outcome"]').text()).toContain('Deploying')
    expect(w.text()).not.toContain('Deployed')
  })

  it('polls every 4 s while a deploy runs, every 30 s when idle', async () => {
    mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    const monitorCalls = () => calls().filter((c) => c === '/api/v1/github/actions/monitor').length
    const n = monitorCalls()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(monitorCalls()).toBe(n + 1)
    // The deploy finishes: polling slows down.
    monitorItems = [deploy(12, 'success'), deploy(11, 'success')]
    progressFor[12] = progress(12, 8, 'completed')
    await vi.advanceTimersByTimeAsync(4_000)
    const after = monitorCalls()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(monitorCalls()).toBe(after)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(monitorCalls()).toBe(after + 1)
  })

  it('announces a deploy that finished: success, failure, rollback', async () => {
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    expect(w.findAll('[data-testid="deploy-notice"]')).toHaveLength(0) // quiet on open
    monitorItems = [deploy(12, 'failure', { rolled_back: true }), deploy(11, 'success')]
    progressFor[12] = progress(12, 5, 'rolled_back')
    await vi.advanceTimersByTimeAsync(4_000)
    await flushPromises()
    const notes = w.findAll('[data-testid="deploy-notice"]')
    expect(notes).toHaveLength(1)
    expect(notes[0].text()).toContain('failed and was rolled back')
    expect(w.get('[data-testid="deploy-outcome"]').text()).toContain('Failed · rolled back')
  })

  it('flags stale progress instead of guessing', async () => {
    progressFor[12] = progress(12, 3, 'running', { stale: true })
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="deploy-stale"]').exists()).toBe(true)
    expect(w.get('[data-testid="deploy-outcome"]').text()).toContain('Deploying')
  })

  it('explains a deploy that has no recorded progress', async () => {
    monitorItems = [deploy(5, 'success')]
    progressFor = {}
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    await w.get('[data-id="deploy:5"] button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('No stage-by-stage progress was recorded for this deploy')
  })

  it('keeps the Deploys / CI filter', async () => {
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    const buttons = w.findAll('[role="radio"], button').filter((b) => b.text() === 'CI')
    await buttons[0].trigger('click')
    await flushPromises()
    const last = api.GET.mock.calls.filter(([p]) => p === '/api/v1/github/actions/monitor').at(-1)
    expect(last?.[1]).toEqual({ params: { query: { limit: 40, kind: 'ci' } } })
  })

  it('uses a drawer on phones and tablets', async () => {
    setWidth(false)
    const w = mount(CcActionsMonitor, { global: { stubs } })
    await flushPromises()
    expect(w.find('aside').exists()).toBe(false)
    const peek = w.get('[data-testid="deploy-peek"]')
    expect(peek.text()).toContain('3/8')
    await peek.get('button').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="deploy-progress"]').exists()).toBe(true)
    expect(statusOf(w, 'building')).toBe('running')
  })
})

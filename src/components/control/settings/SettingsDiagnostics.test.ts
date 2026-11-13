// The Diagnose panel: every layer of a setting as a code block (full for non-secrets,
// a secret after Reveal + password), the problems named with a fix, what each worker
// loaded, connection tests, editing in place, and "Reload settings".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import SettingsDiagnostics from '@/components/control/settings/SettingsDiagnostics.vue'
import {
  checks,
  filterKeys,
  headline,
  layersOf,
  pretty,
  problemKeys,
  staleIn,
  watchesText,
  type Diagnostics,
  type KeyDiagnosis,
  type ProcessReport,
} from '@/control/settingsDiagnostics'
import type { SettingRow } from '@/control/settings'
import { REVEAL_MS, useSettingWriter } from '@/control/useSettingWriter'

const KEY = 'sk-ant-api03-FULLSECRETVALUEwwAA'

const key = (k: string, over: Partial<KeyDiagnosis> = {}): KeyDiagnosis => ({
  key: k,
  category: 'ai',
  is_secret: false,
  kind: 'str',
  requires_reauth: false,
  env_masked: null,
  env_value: null,
  env_source: 'unset',
  db_present: false,
  db_masked: null,
  db_value: null,
  db_version: null,
  db_updated_at: null,
  expected_masked: null,
  expected_value: null,
  expected_source: 'unset',
  live_masked: null,
  live_value: null,
  issues: [],
  ...over,
})

const proc = (process: string, over: Partial<ProcessReport> = {}): ProcessReport => ({
  process,
  host: 'c0ffee',
  pid: 7,
  started_at: '2026-11-12T08:00:00Z',
  applied_at: '2026-11-12T08:00:01Z',
  watches: [''],
  stale: [],
  unwatched_stale: [],
  this: false,
  ...over,
})

const anthropic = (over: Partial<KeyDiagnosis> = {}) =>
  key('ANTHROPIC_API_KEY', {
    is_secret: true,
    kind: 'secret',
    requires_reauth: true,
    db_present: true,
    db_masked: '••••wwAA',
    db_version: 2,
    db_updated_at: '2026-11-12T08:00:00Z',
    expected_masked: '••••wwAA',
    expected_source: 'db',
    live_masked: '••••wwAA',
    ...over,
  })

const report = (over: Partial<Diagnostics> = {}): Diagnostics => ({
  checked_at: '2026-11-12T09:00:00Z',
  server: {
    host: 'c0ffee',
    pid: 7,
    environment: 'production',
    started_at: '2026-11-12T08:00:00Z',
    settings_applied_at: '2026-11-12T08:00:01Z',
  },
  encryption_ready: true,
  encryption_problem: null,
  master_keys: 1,
  database_ok: true,
  database_error: null,
  rows: 2,
  unknown_rows: [],
  undecryptable: [],
  rejected: [],
  overlay_ok: true,
  overlay_fields: [],
  stale: [],
  redis: { ok: true, error: null, listeners: 5 },
  processes: [proc('api', { this: true }), proc('research', { watches: ['ANTHROPIC_', 'AI_'] })],
  ai: {
    configured: true,
    key_masked: '••••wwAA',
    matches_settings: true,
    model_main: 'claude-opus-5-5',
    model_router: 'claude-haiku-5-5',
  },
  tests: {
    ai: { category: 'ai', ok: true, detail: 'Anthropic key OK', tested_at: '2026-11-12T08:30:00Z' },
  },
  keys: [
    anthropic(),
    key('AI_EFFORT', {
      env_source: 'default',
      env_masked: '••••dium',
      env_value: 'medium',
      expected_masked: '••••dium',
      expected_value: 'medium',
      expected_source: 'default',
      live_masked: '••••dium',
      live_value: 'medium',
    }),
    key('AI_AGENT_BUDGETS_USD', {
      kind: 'json_object',
      env_source: 'default',
      env_value: '{"business": "30", "chat": "20", "investments": "40", "reserve": "10"}',
      live_value: '{"business": "30", "chat": "20", "investments": "40", "reserve": "10"}',
      expected_value: '{"business": "30", "chat": "20", "investments": "40", "reserve": "10"}',
    }),
    key('GITHUB_TOKEN', { category: 'github', is_secret: true, kind: 'secret' }),
  ],
  ...over,
})

const broken = (): Diagnostics =>
  report({
    undecryptable: ['ANTHROPIC_API_KEY'],
    stale: ['ANTHROPIC_API_KEY'],
    ai: { ...report().ai, configured: false, key_masked: null },
    processes: [
      proc('api', { this: true, stale: ['ANTHROPIC_API_KEY'] }),
      proc('research', { watches: ['ANTHROPIC_', 'AI_'], stale: ['ANTHROPIC_API_KEY'] }),
      proc('dhan_feed', { watches: ['DHAN_'], unwatched_stale: ['ANTHROPIC_API_KEY'] }),
    ],
    keys: [
      anthropic({
        db_masked: null,
        db_version: 3,
        expected_masked: null,
        expected_source: 'unset',
        live_masked: '••••OLD1',
        issues: ['db_undecryptable', 'stale'],
      }),
      key('AI_EFFORT', { live_value: 'medium', env_value: 'medium', expected_value: 'medium' }),
    ],
  })

// --- the pure half -----------------------------------------------------------------------

describe('settingsDiagnostics', () => {
  it('a healthy report: every check passes and no problems', () => {
    const d = report()
    expect(headline(d)).toEqual({ tone: 'success', text: 'Every layer agrees' })
    expect(checks(d).every((c) => c.tone === 'success' || c.tone === 'neutral')).toBe(true)
    expect(problemKeys(d)).toEqual([])
    expect(filterKeys(d, 'category', 'github').map((k) => k.key)).toEqual(['GITHUB_TOKEN'])
    expect(filterKeys(d, 'all')).toHaveLength(4)
  })

  it('an unreadable key: database, Claude, running and workers checks all say so', () => {
    const d = broken()
    const byId = Object.fromEntries(checks(d).map((c) => [c.id, c]))
    expect(byId.database).toMatchObject({ tone: 'danger', detail: '1 unreadable' })
    expect(byId.claude).toMatchObject({ tone: 'danger', value: 'No key' })
    expect(byId.live).toMatchObject({ tone: 'warning', value: '1 not applied' })
    expect(byId.processes).toMatchObject({ tone: 'warning', detail: 'api, research' })
    expect(headline(d).tone).toBe('danger')
    expect(problemKeys(d).map((k) => k.key)).toEqual(['ANTHROPIC_API_KEY'])
    expect(staleIn(d, 'ANTHROPIC_API_KEY').map((p) => p.process)).toEqual(['api', 'research'])
  })

  it('redis down, no listeners and no worker reports are named', () => {
    const down = Object.fromEntries(
      checks(report({ redis: { ok: false, error: 'ConnectionError', listeners: null } })).map(
        (c) => [c.id, c],
      ),
    )
    expect(down.redis).toMatchObject({ tone: 'danger', value: 'Redis down' })
    const quiet = Object.fromEntries(
      checks(report({ redis: { ok: true, error: null, listeners: 0 }, processes: [] })).map((c) => [
        c.id,
        c,
      ]),
    )
    expect(quiet.redis.tone).toBe('warning')
    expect(quiet.processes).toMatchObject({ tone: 'warning', value: 'No reports' })
  })

  it('shadows_env alone is not a problem; a stale gateway key is a warning', () => {
    const d = report({
      ai: { ...report().ai, matches_settings: false },
      keys: [key('X', { issues: ['shadows_env'] })],
    })
    expect(problemKeys(d)).toEqual([])
    expect(checks(d).find((c) => c.id === 'claude')!.tone).toBe('warning')
    expect(headline(d).tone).toBe('warning')
  })

  it('encryption off and every DB value ignored are named', () => {
    const d = report({
      encryption_ready: false,
      encryption_problem: 'SETTINGS_MASTER_KEY is not set',
      master_keys: 0,
      overlay_ok: false,
      overlay_fields: ['AI_MAX_STEPS'],
    })
    const byId = Object.fromEntries(checks(d).map((c) => [c.id, c]))
    expect(byId.encryption).toMatchObject({ tone: 'danger', value: 'Off' })
    expect(byId.overlay).toMatchObject({ tone: 'danger', detail: 'invalid: AI_MAX_STEPS' })
  })

  it('layers: full values for a non-secret, masks for a secret until revealed', () => {
    const effort = layersOf(report().keys[1])
    expect(effort.map((l) => [l.id, l.value])).toEqual([
      ['env', 'medium'],
      ['db', null],
      ['expected', 'medium'],
      ['live', 'medium'],
    ])
    const secret = layersOf(anthropic())
    expect(secret.every((l) => l.value === null)).toBe(true)
    expect(secret.find((l) => l.id === 'live')!.masked).toBe('••••wwAA')
    const shown = layersOf(anthropic(), {
      env: null,
      db: KEY,
      db_present: true,
      expected: KEY,
      live: KEY,
    })
    expect(shown.map((l) => l.value)).toEqual([null, KEY, KEY, KEY])
    const bad = layersOf(broken().keys[0])
    expect(bad.find((l) => l.id === 'db')).toMatchObject({ tone: 'danger', value: null })
    expect(bad.find((l) => l.id === 'live')!.tone).toBe('warning')
  })

  it('pretty-prints JSON, leaves other values exactly as they are', () => {
    expect(pretty('{"a":1}', 'json_object')).toBe('{\n  "a": 1\n}')
    expect(pretty('not json', 'json_object')).toBe('not json')
    expect(pretty(' 30 8 * * * ', 'str')).toBe(' 30 8 * * * ')
    expect(watchesText(proc('api'))).toBe('every setting')
    expect(watchesText(proc('research', { watches: ['ANTHROPIC_', 'AI_'] }))).toBe(
      'ANTHROPIC_*, AI_*',
    )
  })
})

// --- the panel ---------------------------------------------------------------------------

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const settingRow = (k: string, over: Partial<SettingRow> = {}): SettingRow => ({
  key: k,
  category: 'ai',
  description: `${k} description`,
  kind: 'str',
  is_secret: false,
  requires_reauth: false,
  managed: false,
  is_set: true,
  masked: null,
  value: null,
  source: 'default',
  ...over,
})

const ROWS: SettingRow[] = [
  settingRow('ANTHROPIC_API_KEY', {
    kind: 'secret',
    is_secret: true,
    requires_reauth: true,
    masked: '••••wwAA',
    source: 'db',
  }),
  settingRow('AI_EFFORT', { value: 'medium', masked: '••••dium' }),
  settingRow('GITHUB_TOKEN', {
    category: 'github',
    kind: 'secret',
    is_secret: true,
    is_set: false,
  }),
]

describe('<SettingsDiagnostics />', () => {
  let w: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const f of Object.values(api)) f.mockReset()
  })
  afterEach(() => {
    w?.unmount()
    w = null
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  function mountPanel(data: Diagnostics) {
    api.GET.mockResolvedValue(res(data))
    const writer = useSettingWriter(() => undefined)
    w = mount(SettingsDiagnostics, {
      props: { category: 'ai', categoryLabel: 'AI', rows: ROWS, writer, encryptionReady: true },
      attachTo: document.body,
    })
    return { w, writer }
  }

  it('shows the problems with a fix, each layer as a code block, and every process', async () => {
    const { w } = mountPanel(broken())
    await flushPromises()
    expect(api.GET).toHaveBeenCalledWith('/api/v1/settings/diagnostics')
    expect(w.get('[data-testid="diag-headline"]').text()).toContain('problem')
    const row = w.get('[data-key="ANTHROPIC_API_KEY"]')
    expect(row.text()).toContain('Unreadable (another SETTINGS_MASTER_KEY)')
    expect(row.text()).toContain('different SETTINGS_MASTER_KEY')
    expect(row.text()).toContain('••••OLD1')
    expect(row.text()).toContain('Old in research')
    expect(w.find('[data-key="AI_EFFORT"]').exists()).toBe(false) // problems filter
    const procs = w.findAll('[data-process]').map((p) => p.attributes('data-process'))
    expect(procs).toEqual(['api', 'research', 'dhan_feed'])
    expect(w.get('[data-process="research"]').text()).toContain('ANTHROPIC_API_KEY')
    expect(w.get('[data-process="dhan_feed"]').text()).toContain('does not use live')
  })

  it('non-secret values are shown in full as code; JSON is pretty-printed', async () => {
    const { w } = mountPanel(report())
    await flushPromises()
    await w
      .findAll('[role="radio"], [role="tab"], button')
      .find((b) => b.text().startsWith('All'))!
      .trigger('click')
    await flushPromises()
    const effort = w.get('[data-key="AI_EFFORT"]')
    expect(effort.get('[data-layer="live"] [data-testid="value-code"]').text()).toBe('medium')
    expect(effort.get('[data-layer="db"]').text()).toContain('Nothing saved')
    const budgets = w.get('[data-key="AI_AGENT_BUDGETS_USD"] [data-layer="live"] code').text()
    expect(budgets).toContain('"investments": "40"')
    expect(budgets.split('\n').length).toBeGreaterThan(3)
    // A secret: masks only, never a value.
    const secret = w.get('[data-key="ANTHROPIC_API_KEY"]')
    expect(secret.find('[data-testid="value-code"]').exists()).toBe(false)
    expect(secret.get('[data-layer="live"]').text()).toContain('••••wwAA')
  })

  it('Reveal asks for the password, shows every layer in full, then hides itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { w, writer } = mountPanel(report())
    await flushPromises()
    await w
      .findAll('button')
      .find((b) => b.text().startsWith('All'))!
      .trigger('click')
    await w.get('[data-key="ANTHROPIC_API_KEY"] [data-testid="diag-reveal"]').trigger('click')
    expect(writer.pending.value?.action).toBe('reveal')
    expect(api.POST).not.toHaveBeenCalled()
    api.POST.mockResolvedValue(
      res({
        key: 'ANTHROPIC_API_KEY',
        env: null,
        db: KEY,
        db_present: true,
        expected: KEY,
        live: KEY,
      }),
    )
    writer.password.value = 'pw'
    writer.confirmReauth()
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/{key}/reveal', {
      params: { path: { key: 'ANTHROPIC_API_KEY' } },
      body: { password: 'pw' },
    })
    expect(writer.password.value).toBe('')
    const row = w.get('[data-key="ANTHROPIC_API_KEY"]')
    expect(row.get('[data-layer="live"] code').text()).toBe(KEY)
    expect(row.get('[data-layer="db"] code').text()).toBe(KEY)
    vi.advanceTimersByTime(REVEAL_MS + 10)
    await flushPromises()
    expect(w.text()).not.toContain(KEY)
    expect(sessionStorage.length + localStorage.length).toBe(0)
  })

  it('a wrong password keeps the dialog open and shows nothing', async () => {
    const { w, writer } = mountPanel(report())
    await flushPromises()
    void writer.reveal({ key: 'ANTHROPIC_API_KEY', kind: 'secret', requires_reauth: true })
    api.POST.mockResolvedValue(
      res({ detail: { code: 'reauth_failed', detail: 'password re-authentication failed' } }, 403),
    )
    writer.password.value = 'nope'
    writer.confirmReauth()
    await flushPromises()
    expect(writer.pending.value).not.toBeNull()
    expect(writer.reauthError.value).not.toBe('')
    expect(writer.revealed.ANTHROPIC_API_KEY).toBeUndefined()
    expect(w.text()).not.toContain(KEY)
  })

  it('Edit opens the same editor as the Settings page, prefilled with the value in use', async () => {
    const { w } = mountPanel(report())
    await flushPromises()
    await w
      .findAll('button')
      .find((b) => b.text().startsWith('All'))!
      .trigger('click')
    await w.get('[data-key="AI_EFFORT"] [data-testid="diag-edit"]').trigger('click')
    const editor = w.get('[data-key="AI_EFFORT"] .sd__editor')
    // Prefilled: the effort in use is the one picked in the editor.
    expect(editor.findComponent({ name: 'SegmentedControl' }).props('modelValue')).toBe('medium')
    // A pick applies at once through the shared writer.
    api.PUT.mockResolvedValue(res({ ok: true }))
    const high = editor.findAll('button').find((b) => b.text() === 'high')!
    await high.trigger('click')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_EFFORT' } },
      body: { value: 'high' },
    })
  })

  it('connection tests run from here', async () => {
    const { w } = mountPanel(report())
    await flushPromises()
    expect(w.get('[data-test="ai"]').text()).toContain('Anthropic key OK')
    api.POST.mockResolvedValue(res({ category: 'ai', ok: true, detail: 'Anthropic key OK' }))
    await w.get('[data-test="ai"] button').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/{key}/test', {
      params: { path: { key: 'ANTHROPIC_API_KEY' } },
    })
  })

  it('reloads the server and refreshes', async () => {
    const { w } = mountPanel(broken())
    await flushPromises()
    api.GET.mockResolvedValue(res(report()))
    api.POST.mockResolvedValue(res({ changed: ['ANTHROPIC_API_KEY'] }))
    await w.get('[data-testid="reload-settings"]').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/reload')
    expect(w.text()).toContain('Applied:')
    expect(w.emitted('reloaded')).toHaveLength(1)
    expect(w.get('[data-testid="diag-headline"]').text()).toBe('Every layer agrees')
  })

  it('a load failure is an alert, not a blank panel', async () => {
    api.GET.mockResolvedValue(res({ detail: { code: 'x', detail: 'boom' } }, 500))
    const writer = useSettingWriter(() => undefined)
    w = mount(SettingsDiagnostics, { props: { writer, encryptionReady: true } })
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('Diagnostics could not be loaded')
  })
})

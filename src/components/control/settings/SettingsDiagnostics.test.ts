// The Diagnose panel: every layer of a setting as masks, the problems named with a
// fix, and "Reload settings" re-applying .env + the DB on the server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import SettingsDiagnostics from '@/components/control/settings/SettingsDiagnostics.vue'
import { checks, filterKeys, headline, problemKeys } from '@/control/settingsDiagnostics'
import type { Diagnostics, KeyDiagnosis } from '@/control/settingsDiagnostics'

const key = (k: string, over: Partial<KeyDiagnosis> = {}): KeyDiagnosis => ({
  key: k,
  category: 'ai',
  is_secret: false,
  env_masked: null,
  env_source: 'unset',
  db_present: false,
  db_masked: null,
  db_version: null,
  db_updated_at: null,
  expected_masked: null,
  expected_source: 'unset',
  live_masked: null,
  issues: [],
  ...over,
})

const report = (over: Partial<Diagnostics> = {}): Diagnostics => ({
  checked_at: '2026-11-12T09:00:00Z',
  server: { host: 'api-1', pid: 7, environment: 'production' },
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
  ai: {
    configured: true,
    key_masked: '••••wwAA',
    matches_settings: true,
    model_main: 'claude-opus-5-5',
    model_router: 'claude-haiku-5-5',
  },
  keys: [
    key('ANTHROPIC_API_KEY', {
      is_secret: true,
      db_present: true,
      db_masked: '••••wwAA',
      db_version: 2,
      db_updated_at: '2026-11-12T08:00:00Z',
      expected_masked: '••••wwAA',
      expected_source: 'db',
      live_masked: '••••wwAA',
    }),
    key('AI_EFFORT', { env_source: 'default', env_masked: 'medium', live_masked: 'medium' }),
    key('GITHUB_TOKEN', { category: 'github' }),
  ],
  ...over,
})

const broken = (): Diagnostics =>
  report({
    undecryptable: ['ANTHROPIC_API_KEY'],
    stale: ['ANTHROPIC_API_KEY'],
    ai: { ...report().ai, configured: false, key_masked: null, matches_settings: true },
    keys: [
      key('ANTHROPIC_API_KEY', {
        is_secret: true,
        db_present: true,
        db_version: 3,
        live_masked: '••••OLD1',
        issues: ['db_undecryptable', 'stale'],
      }),
      key('AI_EFFORT'),
    ],
  })

describe('settingsDiagnostics', () => {
  it('a healthy report: every check passes and no problems', () => {
    const d = report()
    expect(headline(d)).toEqual({ tone: 'success', text: 'Every layer agrees' })
    expect(checks(d).every((c) => c.tone === 'success' || c.tone === 'neutral')).toBe(true)
    expect(problemKeys(d)).toEqual([])
    expect(filterKeys(d, 'category', 'github').map((k) => k.key)).toEqual(['GITHUB_TOKEN'])
    expect(filterKeys(d, 'all')).toHaveLength(3)
  })

  it('an unreadable key: database and Claude checks fail, the key is a problem', () => {
    const d = broken()
    const byId = Object.fromEntries(checks(d).map((c) => [c.id, c]))
    expect(byId.database).toMatchObject({ tone: 'danger', detail: '1 unreadable' })
    expect(byId.claude).toMatchObject({ tone: 'danger', value: 'No key' })
    expect(byId.live).toMatchObject({ tone: 'warning', value: '1 not applied' })
    expect(headline(d).tone).toBe('danger')
    expect(problemKeys(d).map((k) => k.key)).toEqual(['ANTHROPIC_API_KEY'])
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
})

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

describe('<SettingsDiagnostics />', () => {
  let w: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    api.GET.mockReset()
    api.POST.mockReset()
  })
  afterEach(() => {
    w?.unmount()
    w = null
  })

  it('shows the problems with a fix, then reloads the server and refreshes', async () => {
    api.GET.mockResolvedValueOnce(res(broken())).mockResolvedValueOnce(res(report()))
    api.POST.mockResolvedValue(res({ changed: ['ANTHROPIC_API_KEY'] }))
    w = mount(SettingsDiagnostics, { props: { category: 'ai', categoryLabel: 'AI' } })
    await flushPromises()
    expect(api.GET).toHaveBeenCalledWith('/api/v1/settings/diagnostics')
    expect(w.get('[data-testid="diag-headline"]').text()).toContain('problem')
    const row = w.get('[data-key="ANTHROPIC_API_KEY"]')
    expect(row.text()).toContain('unreadable')
    expect(row.text()).toContain('different SETTINGS_MASTER_KEY')
    expect(row.text()).toContain('••••OLD1')
    expect(w.find('[data-key="AI_EFFORT"]').exists()).toBe(false) // problems filter

    await w.get('[data-testid="reload-settings"]').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/reload')
    expect(w.text()).toContain('Applied:')
    expect(w.emitted('reloaded')).toHaveLength(1)
    expect(w.get('[data-testid="diag-headline"]').text()).toBe('Every layer agrees')
  })

  it('a load failure is an alert, not a blank panel', async () => {
    api.GET.mockResolvedValue(res({ detail: { code: 'x', detail: 'boom' } }, 500))
    w = mount(SettingsDiagnostics)
    await flushPromises()
    expect(w.text()).toContain('Diagnostics could not be loaded')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({
  aureon: { GET: get },
  errorMessage: (_: unknown, f: string) => f,
  onApiSchema: () => () => {},
  onUnauthorized: () => () => {},
}))

import {
  isNew,
  loadManifest,
  markSeen,
  moduleState,
  onSchemaFingerprint,
  resetModules,
  usable,
  type Manifest,
} from './manifest'
import { moduleTarget, OVERRIDES } from './overrides'
import { tradingSession } from '@/trading/session'

const view = (over: Record<string, unknown> = {}) => ({
  kind: 'list',
  id: 'v',
  title: 'V',
  method: 'GET',
  path: '/api/x',
  danger: 'none',
  path_params: [],
  ...over,
})
const SAMPLE: Manifest = {
  version: 1,
  schema_hash: 'aaaa',
  modules: [
    {
      key: 'notes',
      title: 'Notes',
      views: [view({ id: 'list' }), view({ id: 'del', kind: 'action', danger: 'hidden' })],
    },
    { key: 'ops', title: 'Ops', roles: ['admin'], views: [view()] },
    { key: 'half', title: 'Half', views: [view({ roles: ['admin'] })] },
    { key: 'agents', title: 'Agents', views: [view()] },
  ],
} as Manifest

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: status < 400, status, headers: new Headers() },
})

describe('manifest → nav', () => {
  beforeEach(() => {
    localStorage.clear()
    resetModules()
    get.mockReset()
    Object.assign(tradingSession, { user: { uid: 'u' }, role: 'user', checked: true })
  })

  it('keeps only what the role may see, and never a hidden operation', () => {
    const user = usable(SAMPLE, 'user')
    expect(user.map((m) => m.key)).toEqual(['notes', 'agents'])
    expect(user[0].views.map((v) => v.id)).toEqual(['list'])
    expect(usable(SAMPLE, 'admin').map((m) => m.key)).toEqual(['notes', 'ops', 'half', 'agents'])
  })

  it('loads the manifest; the first one is the baseline for "New"', async () => {
    get.mockResolvedValueOnce(ok(SAMPLE))
    await loadManifest()
    expect(get).toHaveBeenCalledWith('/api/v1/ui/manifest', {})
    expect(moduleState.manifest?.modules).toHaveLength(4)
    expect(isNew('notes')).toBe(false)

    // A deploy adds a module: it is new until opened.
    get.mockResolvedValueOnce(
      ok({
        ...SAMPLE,
        schema_hash: 'bbbb',
        modules: [...SAMPLE.modules, { key: 'demo', title: 'Demo', views: [view()] }],
      }),
    )
    onSchemaFingerprint('bbbb')
    await vi.waitFor(() => expect(moduleState.manifest?.schema_hash).toBe('bbbb'))
    expect(isNew('demo')).toBe(true)
    markSeen('demo')
    expect(isNew('demo')).toBe(false)
  })

  it('re-reads only when the fingerprint differs from the one held', async () => {
    get.mockResolvedValue(ok(SAMPLE))
    await loadManifest()
    get.mockClear()
    onSchemaFingerprint('aaaa')
    expect(get).not.toHaveBeenCalled()
    onSchemaFingerprint('cccc')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the server has no manifest', async () => {
    get.mockResolvedValueOnce(ok(undefined, 404))
    await loadManifest()
    expect(moduleState.available).toBe(false)
    expect(moduleState.error).toBe('')
  })
})

describe('override registry', () => {
  it('a custom page wins over the generic view', () => {
    expect(moduleTarget('agents')).toEqual({ to: OVERRIDES.agents, custom: true })
    expect(moduleTarget('demo-notes')).toEqual({ to: '/modules/demo-notes', custom: false })
  })
  it('falls back to generic when the custom page is missing', () => {
    expect(moduleTarget('agents', () => false)).toEqual({ to: '/modules/agents', custom: false })
  })
})

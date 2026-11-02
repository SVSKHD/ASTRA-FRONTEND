// Stage 6 on Aureon, against a stubbed API: receipts, Security → Devices,
// public shares and the forex feed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = '2026-11-01T10:00:00+00:00'
const sent: { method: string; path: string; search: string; csrf: string | null }[] = []
let routes: Record<string, [number, unknown]> = {}

function respond(method: string, path: string): [number, unknown] {
  return routes[`${method} ${path}`] ?? [404, { detail: 'not found' }]
}

beforeEach(() => {
  sent.length = 0
  routes = {}
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_PROVIDER', 'aureon')
  document.cookie = 'aureon_csrf=tok'
  vi.stubGlobal('fetch', async (input: Request | string, init?: RequestInit) => {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input
    const url = new URL(req.url)
    sent.push({
      method: req.method,
      path: url.pathname,
      search: url.search,
      csrf: req.headers.get('x-csrf-token'),
    })
    const [status, body] = respond(req.method, url.pathname)
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

const ATT = {
  id: 'a1',
  kind: 'expenses',
  ref: 'e1',
  filename: 'receipt.pdf',
  content_type: 'application/pdf',
  size_bytes: 2048,
  sha256: 'x',
  created_at: NOW,
}

describe('receipts on Aureon', () => {
  it('uploads multipart with kind, ref and CSRF, lists, and deletes', async () => {
    routes['POST /api/finance/attachments'] = [201, ATT]
    routes['GET /api/finance/attachments'] = [200, [ATT]]
    routes['DELETE /api/finance/attachments/a1'] = [204, null]
    const svc = await import('./attachments')
    expect(svc.attachmentsOnAureon()).toBe(true)
    const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' })
    const up = await svc.uploadFinanceAttachment('expenses', 'e1', file)
    expect(up.error).toBeNull()
    expect(up.attachment).toMatchObject({
      id: 'a1',
      name: 'receipt.pdf',
      url: '/api/finance/attachments/a1/file',
    })
    expect(sent[0]).toMatchObject({ method: 'POST', csrf: 'tok' })
    const list = await svc.listFinanceAttachments('expenses', 'e1')
    expect(list.map((a) => a.id)).toEqual(['a1'])
    expect(sent[1].search).toBe('?kind=expenses&ref=e1')
    await svc.deleteFinanceAttachment('a1')
    expect(sent[2]).toMatchObject({ method: 'DELETE', csrf: 'tok' })
  })

  it('says what a refusal means', async () => {
    routes['POST /api/finance/attachments'] = [415, { detail: 'unsupported' }]
    const svc = await import('./attachments')
    const up = await svc.uploadFinanceAttachment('expenses', 'e1', new File(['x'], 'a.txt'))
    expect(up.error).toContain('not an image or a PDF')
    // A workspace transaction has no server row to attach to.
    expect((await svc.uploadAttachment(7, new File(['x'], 'a.png'))).error).toContain('Expenses')
  })
})

describe('Security → Devices on Aureon', () => {
  const SESSIONS = [
    {
      id: 's-old',
      created_at: '2026-10-30T10:00:00+00:00',
      expires_at: NOW,
      ip: '10.0.0.2',
      user_agent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1',
      current: false,
    },
    {
      id: 's-me',
      created_at: NOW,
      expires_at: NOW,
      ip: '10.0.0.1',
      user_agent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      current: true,
    },
  ]

  it('lists sessions current first, signs out the others one by one, and revokes all', async () => {
    routes['GET /api/auth/sessions'] = [200, SESSIONS]
    routes['DELETE /api/auth/sessions/s-old'] = [204, null]
    routes['POST /api/auth/sessions/revoke-all'] = [200, { revoked: 2 }]
    const svc = await import('./deviceSessions')
    const list = await svc.fetchSessions()
    expect(list.map((s) => [s.id, s.current])).toEqual([
      ['s-me', true],
      ['s-old', false],
    ])
    expect(list[1].deviceType).toBe('mobile')
    expect(await svc.fetchActivity()).toEqual([])
    expect(await svc.revokeOtherSessions()).toEqual({ revoked: 1 })
    expect(sent.filter((s) => s.method === 'DELETE').map((s) => s.path)).toEqual([
      '/api/auth/sessions/s-old',
    ])
    expect(await svc.revokeAllSessions()).toBe(2)
  })
})

describe('public shares on Aureon', () => {
  it('reads a public share without a session, and a private one as its owner', async () => {
    routes['GET /api/public/shares/pub'] = [
      200,
      {
        doc_id: 'pub',
        data: { type: 'todo', item: { title: 'x' }, isPublic: true },
        updated_at: NOW,
      },
    ]
    routes['GET /api/finance/documents/aureon-shares/mine'] = [
      200,
      {
        namespace: 'aureon-shares',
        doc_id: 'mine',
        data: { type: 'note', item: {}, isPublic: false, ownerId: 'u' },
        updated_at: NOW,
      },
    ]
    routes['GET /api/finance/documents/aureon-shares/locked'] = [401, { detail: 'no' }]
    const { fetchShare, mintShareId } = await import('@/utils/shares')
    expect(await fetchShare('pub')).toMatchObject({ status: 'ready', share: { type: 'todo' } })
    expect(await fetchShare('mine')).toMatchObject({ status: 'ready', share: { type: 'note' } })
    expect(await fetchShare('locked')).toEqual({ status: 'needs-auth' })
    expect(await fetchShare('gone')).toEqual({ status: 'not-found' })
    expect(mintShareId(() => 'short')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('the forex feed on Aureon', () => {
  it('maps the public feed to news items', async () => {
    const { readAureonNews, newsOnAureon } = await import('@/composables/useNews')
    expect(newsOnAureon()).toBe(true)
    expect(
      readAureonNews('h', {
        title: 'Gold rises',
        link: 'https://x.test/a',
        published: '2026-11-01T09:00:00Z',
        source: 'x.test',
      }),
    ).toMatchObject({
      id: 'h',
      title: 'Gold rises',
      category: 'forex',
      publishedAt: Date.parse('2026-11-01T09:00:00Z'),
    })
  })
})

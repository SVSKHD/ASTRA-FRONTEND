import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({
  aureon: { POST: vi.fn() },
  errorMessage: (_: unknown, f: string) => f,
}))

import { micHelp, platform, resolveCommand, safeRoute, screenFor, wouldAct } from './assistant'

const server = (route: string | null, intent = 'open_approval') =>
  vi.fn(async () => ({ intent, route, source: 'grammar' as const, note: null }))

describe('resolveCommand', () => {
  it('opens the app’s own screens without asking the server', async () => {
    const ask = server('/dev/agents')
    const r = await resolveCommand('open the news', { admin: true, ask })
    expect(r).toMatchObject({ intent: 'open_news', route: '/news', source: 'app', readOnly: false })
    expect(ask).not.toHaveBeenCalled()
    expect((await resolveCommand('show me images', { admin: false })).route).toBe('/images')
    expect((await resolveCommand('go to MT5', { admin: false })).route).toBe('/trading/mt5')
  })

  it('turns a request to act into navigation and says so', async () => {
    const ask = server('/dev/approvals/12')
    const r = await resolveCommand('approve request 12', { admin: true, ask })
    expect(r.readOnly).toBe(true)
    expect(r.intent).toBe('needs_approval')
    expect(r.route).toBe('/dev/approvals/12')
    expect(r.reply).toMatch(/open it in Spasta/)
    // A trade with no server route goes to Trading — never anywhere that acts.
    const t = await resolveCommand('buy 2 lots of gold', { admin: false })
    expect(t).toMatchObject({ readOnly: true, route: '/trading' })
  })

  it('asks the server for approvals and PRs, admin only', async () => {
    const ask = server('/dev/prs/42', 'open_pr')
    expect((await resolveCommand('open PR 42', { admin: true, ask })).route).toBe('/dev/prs/42')
    const r = await resolveCommand('open PR 42', { admin: false, ask })
    expect(r.intent).toBe('unknown')
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('never follows a route the server should not send', async () => {
    const ask = server('/dev/settings')
    const r = await resolveCommand('something odd', { admin: true, ask })
    expect(r.route).toBeNull()
    expect(safeRoute('https://evil.test')).toBeNull()
    expect(safeRoute('/dev/approvals/12')).toBe('/dev/approvals/12')
  })

  it('reports an unavailable server in words', async () => {
    const ask = vi.fn(async () => ({ error: 'Aureon is unreachable.' }))
    const r = await resolveCommand('open approvals', { admin: true, ask })
    expect(r).toMatchObject({ intent: 'unavailable', reply: 'Aureon is unreachable.' })
  })
})

describe('words', () => {
  it('tells navigation from action', () => {
    expect(wouldAct('open approval 12')).toBe(false)
    expect(wouldAct('show my orders')).toBe(false)
    expect(wouldAct('approve 12')).toBe(true)
    expect(wouldAct('place an order')).toBe(true)
    expect(screenFor('open the trade log')?.route).toBe('/trades')
  })
})

describe('mic help', () => {
  it('knows iPhone and Android', () => {
    expect(platform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(platform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android')
    expect(micHelp('ios').join(' ')).toMatch(/Website Settings → Microphone/)
    expect(micHelp('android').join(' ')).toMatch(/Permissions → Microphone/)
  })
})

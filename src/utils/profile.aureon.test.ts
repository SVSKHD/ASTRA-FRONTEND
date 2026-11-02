// The portfolio profile on Aureon: /api/finance/portfolio-profiles/hithesh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sent: { method: string; path: string; body: unknown }[] = []
let status = 200

beforeEach(() => {
  sent.length = 0
  status = 200
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_PROVIDER', 'aureon')
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    const text = req.method === 'PUT' ? await req.text() : ''
    sent.push({ method: req.method, path: url.pathname, body: text ? JSON.parse(text) : null })
    const { defaultProfile } = await import('./profile')
    const body =
      status === 200
        ? { id: 'hithesh', content: defaultProfile(), updated_at: new Date().toISOString() }
        : { detail: 'nope' }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('profile on Aureon', () => {
  it('reads the profile, and treats a missing one as the bundled default', async () => {
    const { fetchProfile } = await import('./profile')
    expect((await fetchProfile())?.hero.name).toBeTruthy()
    expect(sent[0]).toMatchObject({
      method: 'GET',
      path: '/api/finance/portfolio-profiles/hithesh',
    })
    status = 404
    expect(await fetchProfile()).toBeNull()
  })

  it('saves through PUT and says plainly when only an admin may', async () => {
    const { defaultProfile, saveProfile } = await import('./profile')
    await saveProfile(defaultProfile())
    expect(sent.at(-1)).toMatchObject({
      method: 'PUT',
      path: '/api/finance/portfolio-profiles/hithesh',
    })
    expect((sent.at(-1)!.body as { content: unknown }).content).toEqual(defaultProfile())
    status = 403
    await expect(saveProfile(defaultProfile())).rejects.toThrow('Only an admin')
  })
})

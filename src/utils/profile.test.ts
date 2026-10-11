import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn(), from: vi.fn() }))
vi.mock('@/supabase', () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }))
import { defaultProfile, profileSchema, saveProfile } from './profile'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockReturnValue({ upsert: mocks.upsert })
  mocks.upsert.mockResolvedValue({ error: null })
})
describe('profile publishing', () => {
  it('rejects unsafe links and empty rotating roles', () => {
    const profile = defaultProfile()
    profile.hero.links = [{ label: 'Website', value: 'Site', href: 'javascript:alert(1)' }]
    expect(profileSchema.safeParse(profile).success).toBe(false)
    profile.hero.links = []
    profile.hero.roles = []
    expect(profileSchema.safeParse(profile).success).toBe(false)
  })
  it('requires an authenticated session before writing', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await expect(saveProfile(defaultProfile())).rejects.toThrow('Sign in')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('publishes valid content and surfaces database denial', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
    await saveProfile(defaultProfile())
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hithesh', content: defaultProfile() }),
    )
    mocks.upsert.mockResolvedValue({ error: new Error('Access denied') })
    await expect(saveProfile(defaultProfile())).rejects.toThrow('Access denied')
  })
})

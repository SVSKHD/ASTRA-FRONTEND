import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore is mocked at the module boundary: these tests are about the
// service's own mapping logic (denied -> needs-auth, missing -> not-found,
// snapshot freezing), not about Firestore itself.
const getDoc = vi.fn()
const setDoc = vi.fn()
const docFn = vi.fn(() => ({ id: 'generated-id' }))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docFn(...(args as [])),
  collection: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => getDoc(...(args as [])),
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}))

vi.mock('@/firebase', () => ({ db: {} }))

const { createShare, fetchShare } = await import('@/utils/shares')

beforeEach(() => {
  getDoc.mockReset()
  setDoc.mockReset()
  setDoc.mockResolvedValue(undefined)
})

describe('createShare', () => {
  it('writes ownerId, type, isPublic and a frozen item, and returns the id', async () => {
    const id = await createShare('uid-1', 'todo', { id: 3, text: 'Buy milk', done: false }, true)
    expect(id).toBe('generated-id')
    const written = setDoc.mock.calls[0][1] as Record<string, unknown>
    expect(written.ownerId).toBe('uid-1')
    expect(written.type).toBe('todo')
    expect(written.isPublic).toBe(true)
    expect(written.item).toEqual({ id: 3, text: 'Buy milk', done: false })
  })

  it('defaults to a private share when isPublic is false', async () => {
    await createShare('uid-1', 'note', { id: 1, text: 'hi' }, false)
    expect((setDoc.mock.calls[0][1] as Record<string, unknown>).isPublic).toBe(false)
  })

  it('strips undefined fields, which Firestore rejects', async () => {
    await createShare('uid-1', 'task', { id: 1, title: 'T', tag: undefined }, false)
    const item = (setDoc.mock.calls[0][1] as { item: Record<string, unknown> }).item
    expect('tag' in item).toBe(false)
    expect(item).toEqual({ id: 1, title: 'T' })
  })

  it('snapshots by value, so later edits to the source do not leak', async () => {
    const source = { id: 1, text: 'original' }
    await createShare('uid-1', 'todo', source, true)
    source.text = 'edited afterwards'
    const item = (setDoc.mock.calls[0][1] as { item: Record<string, unknown> }).item
    expect(item.text).toBe('original')
  })
})

describe('fetchShare', () => {
  it('returns the share when it exists', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      id: 'sid',
      data: () => ({ ownerId: 'uid-1', type: 'todo', item: { text: 'x' }, isPublic: true }),
    })
    const result = await fetchShare('sid')
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.share.id).toBe('sid')
      expect(result.share.isPublic).toBe(true)
      expect(result.share.type).toBe('todo')
    }
  })

  it('treats a missing document as not-found', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    expect((await fetchShare('sid')).status).toBe('not-found')
  })

  it('maps permission-denied to needs-auth, not not-found', async () => {
    // A private share denied by rules is indistinguishable from a missing doc
    // at the client. Reporting needs-auth is what makes the page prompt a
    // sign-in instead of lying that the item does not exist.
    getDoc.mockRejectedValue({ code: 'permission-denied' })
    expect((await fetchShare('sid')).status).toBe('needs-auth')
  })

  it('reports other failures as unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getDoc.mockRejectedValue({ code: 'unavailable' })
    expect((await fetchShare('sid')).status).toBe('unavailable')
  })

  it('coerces a missing isPublic to false rather than leaking the item', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      id: 'sid',
      data: () => ({ ownerId: 'uid-1', type: 'todo', item: {} }),
    })
    const result = await fetchShare('sid')
    if (result.status === 'ready') expect(result.share.isPublic).toBe(false)
  })
})

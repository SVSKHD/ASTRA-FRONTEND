import { describe, expect, it } from 'vitest'
import {
  clearLocalWorkspace,
  readLocalWorkspace,
  writeLocalWorkspace,
} from '@/services/localWorkspace'

// The test runner has no IndexedDB — the same as a locked-down private window.
// The device copy must then step aside quietly, leaving the app online-only.
describe('localWorkspace without IndexedDB', () => {
  it('reads nothing and never throws', async () => {
    expect(typeof indexedDB).toBe('undefined')
    await expect(
      writeLocalWorkspace({ uid: 'u1', data: { todos: [] }, dirty: true, savedAt: 1, syncedAt: 0 }),
    ).resolves.toBeUndefined()
    await expect(readLocalWorkspace('u1')).resolves.toBeNull()
    await expect(clearLocalWorkspace('u1')).resolves.toBeUndefined()
  })
})

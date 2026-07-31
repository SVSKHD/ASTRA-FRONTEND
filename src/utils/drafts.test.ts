import { describe, expect, it } from 'vitest'
import {
  decideDraft,
  draftKey,
  relativeTime,
  sanitizeDrafts,
  type DraftRecord,
} from '@/utils/drafts'

function rec(over: Partial<DraftRecord> = {}): DraftRecord {
  return {
    entityType: 'todo',
    entityId: null,
    payload: { text: 'draft' },
    updatedAt: 100,
    deviceLabel: 'Mac · aaaa',
    ...over,
  }
}

describe('draftKey', () => {
  it('uses the id when present and the shared new slot otherwise', () => {
    expect(draftKey('todo', 7)).toBe('todo:7')
    expect(draftKey('task', null)).toBe('task:new')
    expect(draftKey('note', undefined)).toBe('note:new')
  })
})

describe('decideDraft', () => {
  it('does nothing without a draft', () => {
    expect(decideDraft(null, 0, 'Mac · aaaa').action).toBe('none')
  })

  it('ignores a draft no newer than the saved entity', () => {
    // Draft at 100, entity saved at 100 (or later) — the save already won.
    expect(decideDraft(rec({ updatedAt: 100 }), 100, 'Mac · aaaa').action).toBe('none')
    expect(decideDraft(rec({ updatedAt: 100 }), 200, 'Mac · aaaa').action).toBe('none')
  })

  it('restores silently for a newer same-device draft', () => {
    const d = decideDraft(rec({ updatedAt: 200 }), 100, 'Mac · aaaa')
    expect(d.action).toBe('restore')
  })

  it('restores a newer create draft (entity updatedAt 0)', () => {
    const d = decideDraft(rec({ entityId: null, updatedAt: 5 }), 0, 'Mac · aaaa')
    expect(d.action).toBe('restore')
  })

  it('prompts for a newer draft written on another device', () => {
    const d = decideDraft(rec({ updatedAt: 200, deviceLabel: 'iPhone · bbbb' }), 100, 'Mac · aaaa')
    expect(d.action).toBe('prompt')
    if (d.action === 'prompt') expect(d.record.deviceLabel).toBe('iPhone · bbbb')
  })
})

describe('sanitizeDrafts', () => {
  it('keeps well-formed entries and drops malformed ones', () => {
    const out = sanitizeDrafts({
      'todo:new': rec(),
      bad1: null,
      bad2: { entityType: 'todo' }, // no payload
      bad3: { payload: {} }, // no entityType
      'task:3': { entityType: 'task', entityId: 3, payload: { title: 'x' } },
    })
    expect(Object.keys(out).sort()).toEqual(['task:3', 'todo:new'])
    // Missing optional fields are backfilled to safe defaults.
    expect(out['task:3'].updatedAt).toBe(0)
    expect(out['task:3'].deviceLabel).toBe('')
  })

  it('returns an empty map for non-objects', () => {
    expect(sanitizeDrafts(undefined)).toEqual({})
    expect(sanitizeDrafts('nope')).toEqual({})
  })
})

describe('relativeTime', () => {
  const base = 10_000_000
  it('reads coarsely from seconds to days', () => {
    expect(relativeTime(base, base + 5_000)).toBe('just now')
    expect(relativeTime(base, base + 120_000)).toBe('2m ago')
    expect(relativeTime(base, base + 2 * 3_600_000)).toBe('2h ago')
    expect(relativeTime(base, base + 2 * 86_400_000)).toBe('2d ago')
  })
})

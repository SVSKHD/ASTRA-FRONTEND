import { describe, expect, it } from 'vitest'
import {
  PLURAL,
  TYPE_BY_PLURAL,
  buildLegacyShareUrl,
  buildShareUrl,
  decodeShare,
  encodeShare,
  parseSharedFromLocation,
  pathForShare,
} from '@/utils/share'
import type { ItemType } from '@/types'

const ALL_TYPES: ItemType[] = [
  'todo',
  'task',
  'deadline',
  'reminder',
  'finance',
  'note',
  'trip',
  'idea',
  'stock',
]

describe('encodeShare / decodeShare', () => {
  it('round-trips an item', () => {
    const item = { id: 7, text: 'Buy milk', done: false }
    const decoded = decodeShare(encodeShare('todo', item))
    expect(decoded).toEqual({ type: 'todo', item })
  })

  it('survives non-latin1 characters', () => {
    // btoa throws on raw multi-byte input; the encodeURIComponent/unescape
    // dance in encodeShare exists specifically to prevent that.
    const item = { id: 1, text: 'Café ☕ नमस्ते', done: true }
    const code = encodeShare('todo', item)
    expect(code).not.toBe('')
    expect(decodeShare(code)).toEqual({ type: 'todo', item })
  })

  it('returns empty string for values JSON cannot serialise', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(encodeShare('todo', circular)).toBe('')
  })

  it('returns null for malformed input rather than throwing', () => {
    expect(decodeShare('!!!not-base64!!!')).toBeNull()
    expect(decodeShare('')).toBeNull()
  })
})

describe('PLURAL / TYPE_BY_PLURAL', () => {
  it('maps every item type to a plural', () => {
    for (const type of ALL_TYPES) expect(PLURAL[type], type).toBeTruthy()
  })

  it('round-trips type -> plural -> type', () => {
    for (const type of ALL_TYPES) expect(TYPE_BY_PLURAL[PLURAL[type]]).toBe(type)
  })

  it('has no duplicate plurals, so a route cannot be ambiguous', () => {
    const plurals = Object.values(PLURAL)
    expect(new Set(plurals).size).toBe(plurals.length)
  })

  it('returns undefined for an unknown plural', () => {
    expect(TYPE_BY_PLURAL.widgets).toBeUndefined()
  })
})

describe('buildShareUrl (Firestore-backed)', () => {
  it('builds /<plural>/<shareId> with no payload in the URL', () => {
    const url = new URL(buildShareUrl('finance', 'abc123'))
    expect(url.pathname).toBe('/finances/abc123')
    // The point of the new format: the item is NOT in the link.
    expect(url.search).toBe('')
  })

  it('covers every item type without emitting undefined', () => {
    for (const type of ALL_TYPES) {
      const url = new URL(buildShareUrl(type, 'sid'))
      expect(url.pathname, type).toBe(`/${PLURAL[type]}/sid`)
      expect(url.pathname).not.toContain('undefined')
    }
  })

  it('pathForShare matches the path buildShareUrl produces', () => {
    for (const type of ALL_TYPES) {
      expect(new URL(buildShareUrl(type, 'x')).pathname).toBe(pathForShare(type, 'x'))
    }
  })
})

describe('buildLegacyShareUrl', () => {
  it('base36-encodes the id and embeds a decodable payload', () => {
    const item = { id: 255 }
    const url = new URL(buildLegacyShareUrl('finance', item))
    expect(url.pathname).toBe('/finances/73')
    expect(decodeShare(url.searchParams.get('d')!)).toEqual({ type: 'finance', item })
  })
})

describe('parseSharedFromLocation', () => {
  function at(pathname: string, search = '') {
    window.history.replaceState({}, '', pathname + search)
  }

  it('returns null on a non-share path', () => {
    at('/')
    expect(parseSharedFromLocation()).toBeNull()
    at('/settings')
    expect(parseSharedFromLocation()).toBeNull()
  })

  it('decodes a well-formed legacy share URL', () => {
    const item = { id: 9, text: 'Shared todo', done: false }
    const url = new URL(buildLegacyShareUrl('todo', item as { id: number }))
    at(url.pathname, url.search)
    expect(parseSharedFromLocation()).toEqual({ type: 'todo', item })
  })

  it('yields to the router when the path has no legacy payload', () => {
    // A new-format link lives at the same shape of path but carries no ?d=.
    // Returning null here is what lets SharePage handle it instead of the
    // legacy banner claiming it and rendering "not found".
    at('/todos/abc123')
    expect(parseSharedFromLocation()).toBeNull()
  })

  it('flags notFound when a legacy payload is present but corrupt', () => {
    at('/todos/9', '?d=%%%broken%%%')
    expect(parseSharedFromLocation()).toEqual({ notFound: true })
  })
})

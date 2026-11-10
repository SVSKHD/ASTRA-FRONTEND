// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { WATCHLIST_KEY, readWatchlist } from '@/trading/watchlist'
import {
  MAX_ITEMS,
  STORAGE_NOTE,
  WATCHLISTS_KEY,
  allInstruments,
  migrateV1,
  parseLists,
  resetWatchlistStore,
  watchlistStore,
} from '@/trading/watchlists'

const RELIANCE = { id: 1, symbol: 'RELIANCE', broker: 'dhan' }
const TCS = { id: 2, symbol: 'TCS', broker: 'dhan' }

beforeEach(() => {
  localStorage.clear()
  resetWatchlistStore()
})

describe('watchlists', () => {
  it('migrates the old single list into "My watchlist" once', () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([RELIANCE, TCS]))
    const s = watchlistStore()
    expect(s.all().map((l) => l.name)).toEqual(['My watchlist'])
    expect(s.all()[0].items.map((i) => i.symbol)).toEqual(['RELIANCE', 'TCS'])
    expect(migrateV1('not json')).toEqual([])
  })

  it('keeps several named lists and feeds every instrument to the live stream', () => {
    const s = watchlistStore()
    const a = s.create('  Banks  ')
    const b = s.create('IT')
    s.add(a.id, RELIANCE)
    s.add(a.id, RELIANCE) // no duplicates
    s.add(b.id, TCS)
    s.add(b.id, RELIANCE)
    expect(s.all().map((l) => [l.name, l.items.length])).toEqual([
      ['Banks', 1],
      ['IT', 2],
    ])
    // The stream subscribes from the v1 key; it sees each instrument once.
    expect(
      readWatchlist()
        .map((w) => w.id)
        .sort(),
    ).toEqual([1, 2])
    expect(allInstruments(s.all())).toHaveLength(2)

    s.removeItem(b.id, 1)
    s.rename(b.id, 'Tech')
    s.remove(a.id)
    resetWatchlistStore()
    const again = watchlistStore().all()
    expect(again.map((l) => l.name)).toEqual(['Tech'])
    expect(again[0].items.map((i) => i.id)).toEqual([2])
  })

  it('refuses empty names and runaway lists, and drops malformed storage', () => {
    const s = watchlistStore()
    expect(() => s.create('   ')).toThrow(/name/)
    const l = s.create('Big')
    for (let i = 0; i < MAX_ITEMS; i++)
      s.add(l.id, { id: 1000 + i, symbol: `S${i}`, broker: 'dhan' })
    expect(() => s.add(l.id, { id: 9, symbol: 'X', broker: 'dhan' })).toThrow(/At most/)
    expect(parseLists('{"oops":1}')).toEqual([])
    expect(
      parseLists(JSON.stringify([{ id: 'x', name: 'A', items: [{ id: 'bad' }, RELIANCE] }]))[0]
        .items,
    ).toHaveLength(1)
    localStorage.setItem(WATCHLISTS_KEY, 'garbage')
    resetWatchlistStore()
    expect(watchlistStore().all()).toEqual([])
  })

  it('says where the lists are saved, honestly', () => {
    expect(watchlistStore().storage).toBe('device')
    expect(STORAGE_NOTE.device).toMatch(/this device only/)
  })
})

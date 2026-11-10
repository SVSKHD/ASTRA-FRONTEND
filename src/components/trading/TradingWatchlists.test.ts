// Watchlists against a stubbed API: create / rename / delete lists, items with
// quotes and freshness, a missing instrument flagged (not dropped), remove,
// open chart, the screener link, and the device-only notice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.setConfig({ testTimeout: 20_000 })

import TradingWatchlists from './TradingWatchlists.vue'
import { forgetInstruments } from '@/trading/resolve'
import { resetWatchlistStore, watchlistStore, WATCHLISTS_KEY } from '@/trading/watchlists'

const RELIANCE = {
  id: 1,
  broker: 'dhan',
  broker_instrument_id: 'NSE_EQ:2885',
  symbol: 'RELIANCE',
  exchange: 'NSE',
  segment: 'NSE_EQ',
  instrument_type: 'EQUITY',
  underlying: null,
  expiry: null,
  strike: null,
  option_type: null,
  lot_size: '1',
  tick_size: '0.05',
  currency: 'INR',
}
const SEED = [
  {
    id: 'wl_core',
    name: 'Core',
    items: [
      { id: 1, symbol: 'RELIANCE', broker: 'dhan', added_at: '2026-11-01T00:00:00Z' },
      // Delisted, or never in this master: must be flagged, not dropped.
      { id: 99, symbol: 'OLDCO', broker: 'dhan', added_at: '2026-11-01T00:00:00Z' },
    ],
  },
]

let searchFails = false
const calls: URL[] = []
function answer(url: URL): [number, unknown] {
  const p = url.pathname
  const qp = url.searchParams
  if (p === '/api/trading/instruments') {
    if (searchFails) return [503, { detail: 'database unavailable' }]
    const q = (qp.get('q') ?? '').toUpperCase()
    const items = [RELIANCE].filter((i) => i.symbol.includes(q))
    return [200, { items, total: items.length, limit: 500, offset: 0 }]
  }
  if (p === '/api/trading/quotes') {
    return [
      200,
      (qp.get('symbols') ?? '')
        .split(',')
        .filter((r) => r === 'NSE_EQ:2885')
        .map((r) => ({
          symbol: r,
          last: '2950.5',
          bid: null,
          ask: null,
          volume: '10',
          ts: new Date().toISOString(),
          source: 'broker',
        })),
    ]
  }
  return [404, { detail: 'not found' }]
}

class FakeES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  searchFails = false
  calls.length = 0
  localStorage.clear()
  localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(SEED))
  resetWatchlistStore()
  forgetInstruments()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(url)
    const [status, body] = answer(url)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
})

async function mountLists() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: { template: '<div />' } }],
  })
  await router.push('/trading/watchlists')
  const w = mount(TradingWatchlists, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  return { w, router }
}
async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 5000, interval: 20 })
}
const button = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll('button').find((b) => b.text() === text)!

describe('Watchlists', () => {
  it('shows quotes, flags a missing instrument instead of dropping it, and the device notice', async () => {
    const { w } = await mountLists()
    expect(w.text()).toContain('Saved on this device only')
    await sees(w, '2,950.5')
    const items = w.findAll('.wl__item')
    expect(items).toHaveLength(2)
    const gone = items.find((i) => i.text().includes('OLDCO'))!
    expect(gone.text()).toContain('Not in master')
    expect(gone.classes()).toContain('is-flagged')
    const reliance = items.find((i) => i.text().includes('RELIANCE'))!
    expect(reliance.text()).toMatch(/Fresh|Stale|Market closed/)
    expect(w.text()).toContain('1 flagged')
    // The quote was asked for by Dhan reference.
    const q = calls.find((u) => u.pathname === '/api/trading/quotes')!
    expect(q.searchParams.get('symbols')).toBe('NSE_EQ:2885')
  })

  it('marks items it could not check when the search fails', async () => {
    searchFails = true
    const { w } = await mountLists()
    await sees(w, 'Unchecked')
    expect(w.findAll('.wl__item')).toHaveLength(2)
  })

  it('creates, renames and deletes lists', async () => {
    const { w } = await mountLists()
    await w.find('input[aria-label="New list name"]').setValue('Banks')
    await w.find('form.wl__form').trigger('submit')
    await flushPromises()
    expect(watchlistStore().lists.map((l) => l.name)).toEqual(['Core', 'Banks'])
    expect(w.find('.wl__main .tp-title').text()).toBe('Banks')
    expect(w.text()).toContain('This list is empty')

    await button(w, 'Rename').trigger('click')
    await w.find('input[aria-label="Watchlist name"]').setValue('Big banks')
    await w.find('.wl__main form').trigger('submit')
    await flushPromises()
    expect(watchlistStore().lists[1].name).toBe('Big banks')

    await button(w, 'Delete').trigger('click')
    // The first press asks; nothing is deleted yet.
    expect(watchlistStore().lists).toHaveLength(2)
    await button(w, 'Delete “Big banks”?').trigger('click')
    await flushPromises()
    expect(watchlistStore().lists.map((l) => l.name)).toEqual(['Core'])
    expect(w.find('.wl__main .tp-title').text()).toBe('Core')
  })

  it('removes an item, opens a chart, and links the list to the screener', async () => {
    const { w, router } = await mountLists()
    await sees(w, 'Not in master')
    const link = w.find('a.wl__link')
    expect(link.text()).toBe('Screen this list')
    expect(link.attributes('href')).toBe('/trading/screener?watchlist=wl_core')

    await w.find('button[aria-label="Remove OLDCO"]').trigger('click')
    await flushPromises()
    expect(watchlistStore().lists[0].items.map((i) => i.id)).toEqual([1])

    const row = w.findAll('.wl__item').find((i) => i.text().includes('RELIANCE'))!
    await row
      .findAll('button')
      .find((b) => b.text() === 'Chart')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trading/charts?instrument=1')
  })

  it('opens an item’s detail with Enter', async () => {
    const { w } = await mountLists()
    await sees(w, '2,950.5')
    const row = w.findAll('.wl__item').find((i) => i.text().includes('RELIANCE'))!
    await row.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const panel = document.body.querySelector('.ui-drawer')!
    expect(panel.textContent).toContain('NSE_EQ:2885')
    expect(panel.textContent).toContain('Security id')
  })

  it('starts empty with a way to begin', async () => {
    localStorage.setItem(WATCHLISTS_KEY, '[]')
    resetWatchlistStore()
    const { w } = await mountLists()
    expect(w.text()).toContain('No watchlists yet')
    expect(w.text()).toContain('Saved on this device only')
  })
})

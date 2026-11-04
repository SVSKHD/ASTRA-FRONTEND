import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ aureon: { GET: get } }))

import NewsWidget from './NewsWidget.vue'
import { resetNewsFeed } from '@/news/feed'

const doc = (id: string, title: string) => ({
  doc_id: id,
  data: { title, link: `https://x.test/${id}`, published: '2026-11-04T06:00:00Z', source: 'FX' },
  updated_at: '2026-11-04T06:00:00Z',
})
const stubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('<NewsWidget />', () => {
  beforeEach(() => {
    resetNewsFeed()
    get.mockReset()
  })

  it('shows only headlines that mention the symbols, with what they mention', async () => {
    get.mockResolvedValue({
      data: [doc('a', 'Gold jumps as the Fed holds'), doc('b', 'Oil slides on supply')],
      response: { status: 200 },
    })
    const w = mount(NewsWidget, {
      props: { title: 'XAUUSD news', symbols: ['XAUUSD'] },
      global: { stubs },
    })
    await flushPromises()
    expect(w.text()).toContain('Gold jumps as the Fed holds')
    expect(w.text()).not.toContain('Oil slides')
    expect(w.findAll('.ncard__chips').length).toBe(1)
    w.unmount()
  })

  it('says so when nothing matches, and when the feed fails it offers a retry', async () => {
    get.mockResolvedValueOnce({ data: [doc('b', 'Oil slides')], response: { status: 200 } })
    const w = mount(NewsWidget, { props: { title: 'News', symbols: ['TCS'] }, global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('No matching headlines')
    w.unmount()

    resetNewsFeed()
    get.mockResolvedValueOnce({ data: undefined, response: { status: 502 } })
    const x = mount(NewsWidget, { props: { title: 'News', symbols: ['TCS'] }, global: { stubs } })
    await flushPromises()
    expect(x.get('[role="alert"]').text()).toContain('unreachable')
    expect(x.text()).toContain('Retry')
    x.unmount()
  })

  it('has nothing to match without positions', () => {
    const w = mount(NewsWidget, { props: { title: 'News', symbols: [] }, global: { stubs } })
    expect(w.text()).toContain('No open positions')
    w.unmount()
  })
})

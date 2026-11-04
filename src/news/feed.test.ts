import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ aureon: { GET: get } }))

import {
  allNews,
  loadNews,
  mergeNews,
  newsFeed,
  readAureonNews,
  resetNewsFeed,
  revealNews,
} from './feed'

const doc = (id: string, published: string) => ({
  doc_id: id,
  data: { title: `T ${id}`, link: `https://x.test/${id}`, published, source: 'S' },
  updated_at: published,
})
const read = (id: string, published: string) => readAureonNews(id, doc(id, published).data)

describe('the shared news feed', () => {
  beforeEach(() => {
    resetNewsFeed()
    get.mockReset()
  })

  it('shows the first read, then holds new items back until revealed', () => {
    mergeNews([read('a', '2026-11-04T01:00:00Z')])
    expect(newsFeed.items.map((i) => i.id)).toEqual(['a'])
    mergeNews([read('b', '2026-11-04T02:00:00Z'), read('a', '2026-11-04T01:00:00Z')])
    expect(newsFeed.items.map((i) => i.id)).toEqual(['a'])
    expect(newsFeed.pending.map((i) => i.id)).toEqual(['b'])
    // Widgets see everything at once.
    expect(allNews().map((i) => i.id)).toEqual(['b', 'a'])
    revealNews()
    expect(newsFeed.items.map((i) => i.id)).toEqual(['b', 'a'])
    expect(newsFeed.pending).toEqual([])
  })

  it('reads GET /api/public/forex and reports a failure without losing items', async () => {
    get.mockResolvedValueOnce({
      data: [doc('a', '2026-11-04T01:00:00Z')],
      response: { status: 200 },
    })
    await loadNews()
    expect(get).toHaveBeenCalledWith('/api/public/forex', { params: { query: { limit: 200 } } })
    expect(newsFeed.items).toHaveLength(1)
    get.mockResolvedValueOnce({ data: undefined, response: { status: 503 } })
    await loadNews()
    expect(newsFeed.error).toContain('HTTP 503')
    expect(newsFeed.items).toHaveLength(1)
  })
})

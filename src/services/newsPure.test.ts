// The news pipeline's two decisions (section 39): which document an item lands
// on, and what a headline gets tagged with. Both are pure and both are the
// difference between a feed read every fifteen minutes forever and a collection
// that grows by ninety-six copies of the same headline a day.
import { describe, expect, it } from 'vitest'
import {
  NEWS_TTL_DAYS,
  isExpired,
  matchKeywords,
  newsId,
  publishedAt,
  toNewsDoc,
} from '../../functions/src/newsPure'

const FOREX_KEYWORDS = {
  gold: ['gold', 'xau', 'xauusd', 'bullion'],
  fomc: ['fomc', 'rate decision'],
  cpi: ['cpi', 'inflation'],
  nfp: ['nfp', 'nonfarm', 'payrolls'],
  dxy: ['dxy', 'dollar index'],
  fed: ['fed', 'federal reserve', 'powell'],
}

const FEED = { source: 'Kitco', category: 'forex' as const, tags: ['gold', 'metals'] }
const NOW = Date.parse('2026-09-04T10:00:00Z')

describe('the document an item lands on', () => {
  it('is the same for the same item, so a re-pull overwrites', () => {
    // The whole economy of a 15-minute schedule: the 09:00 pull and the 09:15
    // pull of an unchanged feed write the same documents, not twice as many.
    const item = { guid: 'urn:kitco:1', link: 'https://kitco.com/a', title: 'Gold rises' }
    expect(newsId(item)).toBe(newsId({ ...item, title: 'Gold rises (updated)' }))
  })

  it('falls back to the link when the feed gives no guid, and to the title after that', () => {
    expect(newsId({ link: 'https://a' })).toBe(newsId({ link: 'https://a' }))
    expect(newsId({ link: 'https://a' })).not.toBe(newsId({ link: 'https://b' }))
    expect(newsId({ title: 'only a title' })).toHaveLength(32)
  })

  it('is a fixed width Firestore will accept as an id', () => {
    expect(newsId({ guid: 'x'.repeat(5000) })).toHaveLength(32)
    expect(newsId({ guid: 'x' })).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('when an item says it was published', () => {
  it('takes the ISO date a well-behaved feed gives', () => {
    expect(publishedAt({ isoDate: '2026-09-01T00:00:00Z' })).toBe(
      Date.parse('2026-09-01T00:00:00Z'),
    )
  })

  it('takes the RFC-822 date the rest of them give', () => {
    expect(publishedAt({ pubDate: 'Tue, 01 Sep 2026 00:00:00 GMT' })).toBe(
      Date.parse('2026-09-01T00:00:00Z'),
    )
  })

  it('falls back to now rather than to zero', () => {
    // A 1970 timestamp sorts to the bottom forever and looks like data loss;
    // "we saw it now" is the honest answer for a feed that dates nothing.
    expect(publishedAt({}, NOW)).toBe(NOW)
    expect(publishedAt({ pubDate: 'sometime last week' }, NOW)).toBe(NOW)
  })
})

describe('tagging a forex headline', () => {
  it('matches on a word boundary, not a substring', () => {
    // "recipient" contains "cpi" and is not about inflation.
    expect(matchKeywords('The recipient was notified', FOREX_KEYWORDS)).toEqual([])
    expect(matchKeywords('US CPI comes in hot', FOREX_KEYWORDS)).toContain('cpi')
  })

  it('ignores capitalisation, because headline case is not a signal', () => {
    expect(matchKeywords('gold hits a record', FOREX_KEYWORDS)).toContain('gold')
    expect(matchKeywords('GOLD hits a record', FOREX_KEYWORDS)).toContain('gold')
  })

  it('matches a multi-word phrase as a phrase', () => {
    expect(matchKeywords('The dollar index slipped', FOREX_KEYWORDS)).toContain('dxy')
    expect(matchKeywords('A dollar and an index', FOREX_KEYWORDS)).not.toContain('dxy')
  })

  it('can return several tags for one headline', () => {
    const tags = matchKeywords('Fed holds rates as CPI cools; gold rallies', FOREX_KEYWORDS)
    expect(tags).toEqual(expect.arrayContaining(['fed', 'cpi', 'gold']))
  })
})

describe('the stored item', () => {
  it('is a headline, a link, a source and a time — never the article', () => {
    const doc = toNewsDoc(
      { title: 'Gold rises', link: 'https://kitco.com/a', guid: 'g1', content: 'the whole body' },
      FEED,
      FOREX_KEYWORDS,
      NOW,
    )!
    expect(Object.keys(doc).sort()).toEqual(
      ['category', 'fetchedAt', 'id', 'link', 'publishedAt', 'source', 'tags', 'title'].sort(),
    )
    expect(JSON.stringify(doc)).not.toContain('the whole body')
  })

  it('adds the matched keywords to the feed’s own tags, without duplicating them', () => {
    const doc = toNewsDoc({ title: 'Gold and gold', link: 'https://a' }, FEED, FOREX_KEYWORDS, NOW)!
    expect(doc.tags.filter((t) => t === 'gold')).toHaveLength(1)
    expect(doc.tags).toContain('metals')
  })

  it('keyword-tags forex only — an AI headline mentioning gold is not a gold item', () => {
    const ai = { source: 'arXiv', category: 'ai' as const, tags: ['research'] }
    const doc = toNewsDoc(
      { title: 'A golden ratio for CPI models', link: 'https://a' },
      ai,
      FOREX_KEYWORDS,
      NOW,
    )!
    expect(doc.tags).toEqual(['research'])
  })

  it('refuses an item with no title or no link, because neither is actionable', () => {
    expect(toNewsDoc({ link: 'https://a' }, FEED, FOREX_KEYWORDS, NOW)).toBeNull()
    expect(toNewsDoc({ title: 'A headline' }, FEED, FOREX_KEYWORDS, NOW)).toBeNull()
  })

  it('bounds a title that arrives absurdly long', () => {
    const doc = toNewsDoc(
      { title: 'x'.repeat(2000), link: 'https://a' },
      FEED,
      FOREX_KEYWORDS,
      NOW,
    )!
    expect(doc.title).toHaveLength(300)
  })
})

describe('how long a headline is kept', () => {
  it('is thirty days, measured from when it was published', () => {
    expect(NEWS_TTL_DAYS).toBe(30)
    expect(isExpired(NOW - 29 * 86_400_000, NOW)).toBe(false)
    expect(isExpired(NOW - 31 * 86_400_000, NOW)).toBe(true)
  })
})

describe('a second pull creates zero duplicates', () => {
  // Item 10's verification, run as a simulation rather than as a paragraph:
  // two pulls of the same feed fifteen minutes apart, written into a map the
  // way `setDoc` writes into a collection, and the collection must be the same
  // size after the second pull as after the first.
  const FEED_ITEMS = [
    { guid: 'urn:kitco:1', link: 'https://kitco.com/a', title: 'Gold rises on Fed bets' },
    { guid: 'urn:kitco:2', link: 'https://kitco.com/b', title: 'CPI lands hot' },
    { link: 'https://kitco.com/c', title: 'Dollar index steadies' },
  ]

  function pull(store: Map<string, unknown>, items: typeof FEED_ITEMS, now: number): void {
    for (const item of items) {
      const doc = toNewsDoc(item, FEED, FOREX_KEYWORDS, now)
      if (!doc) continue
      // `setDoc` at a derived id, which is exactly a keyed write.
      store.set(newsId(item), doc)
    }
  }

  it('writes the same three documents twice over', () => {
    const store = new Map<string, unknown>()
    pull(store, FEED_ITEMS, NOW)
    expect(store.size).toBe(3)
    pull(store, FEED_ITEMS, NOW + 15 * 60_000)
    expect(store.size).toBe(3)
  })

  it('overwrites rather than duplicating when a publisher edits a headline', () => {
    // The id is the guid, so a corrected headline lands on the row it corrects.
    const store = new Map<string, { title: string }>()
    pull(store as Map<string, unknown>, FEED_ITEMS, NOW)
    const edited = [{ ...FEED_ITEMS[0], title: 'Gold rises on Fed bets (updated)' }]
    pull(store as Map<string, unknown>, edited, NOW + 15 * 60_000)
    expect(store.size).toBe(3)
    expect(store.get(newsId(FEED_ITEMS[0]))?.title).toBe('Gold rises on Fed bets (updated)')
  })

  it('still deduplicates a feed that gives no guids at all', () => {
    const store = new Map<string, unknown>()
    const guidless = FEED_ITEMS.map(({ link, title }) => ({ link, title }))
    pull(store, guidless, NOW)
    pull(store, guidless, NOW + 15 * 60_000)
    expect(store.size).toBe(3)
  })
})

// Every source, in one file (section 39).
//
// Adding a source is one line here and nothing else — no redeploy of anything
// but the functions package, no schema change, no client release. Removing a
// dead one is deleting a line.
//
// `verified` records what a reachability check last said about the URL, because
// several publishers have quietly restricted or dropped public RSS and a feed
// that 404s forever is worse than an absent one: it looks like a category with
// no news. `scripts/check-feeds.mjs` refreshes these, and `pullNews` records the
// live answer per feed in `forex/_health` on every run, so a source that dies
// after this file was written is visible without anybody re-running anything.
//
// CommonJS on purpose: this is the one file somebody edits without touching
// TypeScript, and it is required by `src/news.ts` rather than compiled.

/**
 * @typedef {Object} Feed
 * @property {string} url
 * @property {string} source      Shown on the row; keep it short.
 * @property {'forex'|'ai'|'code'} category
 * @property {string[]} tags      Applied to every item from this feed.
 * @property {'ok'|'unchecked'|'blocked'} [verified]
 * @property {string} [note]
 */

/** @type {Feed[]} */
const FEEDS = [
  // ---- forex -------------------------------------------------------------
  // Central banks and statistics agencies first: they are the sources whose
  // headlines actually move the pairs this desk trades.
  {
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    source: 'Federal Reserve',
    category: 'forex',
    tags: ['fed', 'central-bank'],
    verified: 'unchecked',
  },
  {
    url: 'https://www.ecb.europa.eu/rss/press.html',
    source: 'ECB',
    category: 'forex',
    tags: ['ecb', 'central-bank'],
    verified: 'unchecked',
  },
  {
    url: 'https://www.bls.gov/feed/bls_latest.rss',
    source: 'BLS',
    category: 'forex',
    tags: ['data', 'us'],
    verified: 'unchecked',
  },
  {
    url: 'https://www.kitco.com/rss/news.xml',
    source: 'Kitco',
    category: 'forex',
    tags: ['gold', 'metals'],
    verified: 'unchecked',
  },
  {
    url: 'https://www.fxstreet.com/rss/news',
    source: 'FXStreet',
    category: 'forex',
    tags: ['fx'],
    verified: 'unchecked',
  },
  {
    url: 'https://www.dailyfx.com/feeds/market-news',
    source: 'DailyFX',
    category: 'forex',
    tags: ['fx'],
    verified: 'unchecked',
  },

  // ---- ai ----------------------------------------------------------------
  {
    url: 'https://rss.arxiv.org/rss/cs.LG',
    source: 'arXiv cs.LG',
    category: 'ai',
    tags: ['research', 'arxiv'],
    verified: 'unchecked',
  },
  {
    url: 'https://rss.arxiv.org/rss/cs.CL',
    source: 'arXiv cs.CL',
    category: 'ai',
    tags: ['research', 'arxiv', 'nlp'],
    verified: 'unchecked',
  },
  {
    url: 'https://blog.google/technology/ai/rss/',
    source: 'Google AI',
    category: 'ai',
    tags: ['lab'],
    verified: 'unchecked',
  },
  {
    url: 'https://openai.com/blog/rss.xml',
    source: 'OpenAI',
    category: 'ai',
    tags: ['lab'],
    verified: 'unchecked',
  },
  {
    url: 'https://www.anthropic.com/news/rss.xml',
    source: 'Anthropic',
    category: 'ai',
    tags: ['lab'],
    verified: 'unchecked',
  },
  {
    url: 'https://huggingface.co/blog/feed.xml',
    source: 'Hugging Face',
    category: 'ai',
    tags: ['tools'],
    verified: 'unchecked',
  },
  {
    url: 'https://importai.substack.com/feed',
    source: 'Import AI',
    category: 'ai',
    tags: ['newsletter'],
    verified: 'unchecked',
  },

  // ---- code --------------------------------------------------------------
  {
    url: 'https://github.blog/feed/',
    source: 'GitHub Blog',
    category: 'code',
    tags: ['platform'],
    verified: 'unchecked',
  },
  {
    url: 'https://news.ycombinator.com/rss',
    source: 'Hacker News',
    category: 'code',
    tags: ['community'],
    verified: 'unchecked',
  },
  {
    url: 'https://blog.vuejs.org/feed.rss',
    source: 'Vue.js Blog',
    category: 'code',
    tags: ['vue', 'framework'],
    verified: 'unchecked',
  },
  {
    url: 'https://firebase.google.com/support/releases.xml',
    source: 'Firebase',
    category: 'code',
    tags: ['firebase', 'release-notes'],
    verified: 'unchecked',
  },
  {
    url: 'https://feed.infoq.com/',
    source: 'InfoQ',
    category: 'code',
    tags: ['engineering'],
    verified: 'unchecked',
  },
  {
    url: 'https://changelog.com/feed',
    source: 'Changelog',
    category: 'code',
    tags: ['podcast', 'community'],
    verified: 'unchecked',
  },
]

/**
 * What makes a forex headline relevant to THIS desk (section 39).
 *
 * Matched against the title only, case-insensitively, on word boundaries — so
 * "CPI" matches and "recipient" does not. The point is the Trades tab's strip:
 * on a day somebody traded gold, which of the day's headlines were about gold.
 *
 * These are keywords in a headline. They are NOT an economic calendar: RSS
 * publishes when something is WRITTEN, not when an event is scheduled, and a
 * Fed release appears in this feed after the decision, not before it. Nothing
 * downstream may treat these timestamps as a schedule.
 */
const FOREX_KEYWORDS = {
  gold: ['gold', 'xau', 'xauusd', 'bullion'],
  fomc: ['fomc', 'rate decision', 'dot plot'],
  cpi: ['cpi', 'inflation', 'ppi'],
  nfp: ['nfp', 'nonfarm', 'non-farm', 'payrolls', 'unemployment'],
  dxy: ['dxy', 'dollar index', 'greenback'],
  fed: ['fed', 'federal reserve', 'powell'],
  ecb: ['ecb', 'lagarde', 'euro area'],
}

module.exports = { FEEDS, FOREX_KEYWORDS }

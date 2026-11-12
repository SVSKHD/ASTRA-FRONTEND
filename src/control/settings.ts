// Runtime settings and secrets (backend docs/settings.md): the pure half of the
// Settings page, so every grouping, label and chip can be tested without a server.
//
// Nothing here ever holds a value. The server sends masks ("••••abcd"), where a
// value comes from (db / env / default / unset), and connection-test outcomes;
// a typed value lives only in the component's input until it is sent, and is
// never written to localStorage, sessionStorage or a VITE_ variable.
import type { Schemas } from '@/control/api'
import type { IconName } from '@/components/ui/icons'

export type SettingRow = Schemas['SettingOut']
export type SettingsList = Schemas['SettingsOut']
export type TestResult = Schemas['TestResultOut']

export const CATEGORY_LABEL: Record<string, string> = {
  ai: 'AI',
  agents: 'Agents',
  dhan: 'Dhan',
  github: 'GitHub',
  discord: 'Discord',
  mt5: 'MT5',
}

export const CATEGORY_ICON: Record<string, IconName> = {
  ai: 'sparkles',
  agents: 'bot',
  dhan: 'candlestick-chart',
  github: 'github',
  discord: 'bell',
  mt5: 'activity',
}

/** One line on what a category is for, under its title. */
export const CATEGORY_NOTE: Record<string, string> = {
  ai: 'Claude, through the Aureon server: the API key, models, spending caps, limits on proposed trades and report schedules. The key never leaves the server.',
  agents: 'What the background agents may do.',
  dhan: 'The broker connection, read-only. Connect logs in on Dhan’s own page; the manual access token is only a fallback.',
  github: 'The token for the GitHub modules and the coding agent.',
  discord: 'Where alerts and approval requests are posted.',
  mt5: 'The token the MT5 bot pushes with.',
}

// --- groups ---------------------------------------------------------------------------------

export interface GroupSpec {
  title: string
  keys: string[]
}

/**
 * The cards each category is split into, by key. A key the backend adds later and
 * this map does not know lands in "Other", so a new setting always shows.
 */
export const GROUPS: Record<string, GroupSpec[]> = {
  ai: [
    { title: 'Credentials', keys: ['ANTHROPIC_API_KEY'] },
    {
      title: 'Models',
      keys: ['AI_MODEL_MAIN', 'AI_MODEL_ROUTER', 'AI_EFFORT', 'AI_MAX_STEPS', 'AI_MODEL_PRICES'],
    },
    { title: 'Budgets', keys: ['AI_MONTHLY_BUDGET_USD', 'AI_AGENT_BUDGETS_USD'] },
    {
      title: 'Trade limits',
      keys: ['AI_TRADE_MAX_LOSS_INR', 'AI_TRADE_MAX_ORDER_INR', 'AI_TRADE_MAX_PER_DAY'],
    },
    { title: 'Schedules', keys: ['AI_DAILY_REPORT_CRON', 'AI_WEEKLY_REVIEW_CRON'] },
  ],
  agents: [{ title: 'Image generation', keys: ['AGENT_IMAGE_ENABLED'] }],
  dhan: [
    {
      title: 'Credentials',
      keys: [
        'DHAN_CLIENT_ID',
        'DHAN_API_KEY',
        'DHAN_API_SECRET',
        'DHAN_ACCESS_TOKEN',
        'DHAN_STATIC_IP',
      ],
    },
    {
      title: 'Login and session',
      keys: [
        'DHAN_REDIRECT_URL',
        'DHAN_AUTH_URL',
        'DHAN_SESSION_TOKEN',
        'DHAN_SESSION_EXPIRES_AT',
        'DHAN_SESSION_ALERT_MINUTES',
        'DHAN_TOKEN_WARN_HOURS',
        'DHAN_SESSION_CHECK_CRON',
      ],
    },
    {
      title: 'Endpoints',
      keys: ['DHAN_BASE_URL', 'DHAN_FEED_URL', 'DHAN_INSTRUMENT_CSV_URL', 'DHAN_HTTP_TIMEOUT'],
    },
    {
      title: 'Market feed',
      keys: [
        'DHAN_FEED_INSTRUMENTS',
        'DHAN_FEED_MODE',
        'DHAN_FEED_QUEUE_MAX',
        'DHAN_FEED_STALE_SECONDS',
        'DHAN_FEED_MAX_BACKOFF_SECONDS',
        'DHAN_FEED_STATUS_MAX_AGE_SECONDS',
        'DHAN_FEED_CRASH_LOOP_STARTS',
        'DHAN_FEED_RECONNECT_COOLDOWN_SECONDS',
      ],
    },
    {
      title: 'Instruments',
      keys: [
        'DHAN_INSTRUMENTS_CRON',
        'DHAN_INSTRUMENT_SEGMENTS',
        'DHAN_INSTRUMENT_MAX_AGE_HOURS',
        'DHAN_INSTRUMENT_SYNC_TIMEOUT_SECONDS',
      ],
    },
    {
      title: 'Backfill',
      keys: [
        'DHAN_BACKFILL_CRON',
        'DHAN_BACKFILL_INSTRUMENTS',
        'DHAN_BACKFILL_TIMEFRAMES',
        'DHAN_BACKFILL_DAYS',
        'DHAN_UNIVERSE_BACKFILL',
        'DHAN_UNIVERSE_BACKFILL_CRON',
        'DHAN_UNIVERSE_BACKFILL_DAYS',
        'DHAN_UNIVERSE_BACKFILL_TIMEFRAMES',
      ],
    },
    {
      title: 'Schedules',
      keys: ['DHAN_RECONCILE_CRON', 'DHAN_MONITOR_CRON', 'DHAN_MARKET_HOLIDAYS'],
    },
  ],
  github: [{ title: 'Credentials', keys: ['GITHUB_TOKEN'] }],
  discord: [{ title: 'Alerts', keys: ['DISCORD_WEBHOOK_URL'] }],
  mt5: [{ title: 'Bot', keys: ['MT5_INGEST_TOKEN'] }],
}

export interface FieldGroup {
  title: string
  rows: SettingRow[]
}

/** A category's rows in its cards, in the map's order; unknown keys go to "Other". */
export function groupRows(category: string, rows: SettingRow[]): FieldGroup[] {
  const specs = GROUPS[category] ?? []
  const placed = new Set<string>()
  const out: FieldGroup[] = []
  for (const spec of specs) {
    const groupRowsOut = spec.keys
      .map((k) => rows.find((r) => r.key === k))
      .filter((r): r is SettingRow => !!r)
    groupRowsOut.forEach((r) => placed.add(r.key))
    if (groupRowsOut.length) out.push({ title: spec.title, rows: groupRowsOut })
  }
  const rest = rows.filter((r) => !placed.has(r.key))
  if (rest.length) out.push({ title: 'Other', rows: rest })
  return out
}

// --- labels and units ---------------------------------------------------------------------

/** Names that read better written out than worked out from the key. */
const LABEL: Record<string, string> = {
  ANTHROPIC_API_KEY: 'Anthropic API key',
  AI_MODEL_MAIN: 'Main model',
  AI_MODEL_ROUTER: 'Router model',
  AI_EFFORT: 'Thinking effort',
  AI_MAX_STEPS: 'Steps per answer',
  AI_MODEL_PRICES: 'Model prices',
  AI_MONTHLY_BUDGET_USD: 'Monthly budget',
  AI_AGENT_BUDGETS_USD: 'Budget per agent',
  AI_TRADE_MAX_LOSS_INR: 'Max loss per trade',
  AI_TRADE_MAX_ORDER_INR: 'Max order size',
  AI_TRADE_MAX_PER_DAY: 'Max proposals per day',
  AI_DAILY_REPORT_CRON: 'Daily report',
  AI_WEEKLY_REVIEW_CRON: 'Weekly review',
  AGENT_IMAGE_ENABLED: 'Image generation',
  GITHUB_TOKEN: 'GitHub token',
  DISCORD_WEBHOOK_URL: 'Webhook URL',
  MT5_INGEST_TOKEN: 'Ingest token',
  DHAN_CLIENT_ID: 'Client ID',
  DHAN_API_KEY: 'API key',
  DHAN_API_SECRET: 'API secret',
}

const WORDS: Record<string, string> = {
  API: 'API',
  URL: 'URL',
  ID: 'ID',
  IP: 'IP',
  CSV: 'CSV',
  HTTP: 'HTTP',
  MT5: 'MT5',
  CRON: 'schedule',
  FNO: 'F&O',
}
/** Trailing unit words that the unit chip shows instead. */
const UNIT_WORDS = new Set(['USD', 'INR', 'SECONDS', 'HOURS', 'MINUTES', 'DAYS'])
const PREFIXES = ['AI_', 'DHAN_', 'AGENT_', 'GITHUB_', 'DISCORD_', 'MT5_']

/** "Feed stale" for DHAN_FEED_STALE_SECONDS; the written-out name when there is one. */
export function labelOf(key: string): string {
  if (LABEL[key]) return LABEL[key]
  const bare = PREFIXES.reduce((k, p) => (k.startsWith(p) ? k.slice(p.length) : k), key)
  const parts = bare.split('_').filter((w, i, all) => !(i === all.length - 1 && UNIT_WORDS.has(w)))
  const words = parts.map((w) => WORDS[w] ?? w.toLowerCase())
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The unit a number is in, from its key: USD, ₹, s, h, min, days. */
export function unitOf(key: string, kind: string): string {
  if (!['decimal', 'int', 'float'].includes(kind)) return ''
  if (key.endsWith('_USD')) return 'USD'
  if (key.endsWith('_INR')) return '₹'
  if (key.endsWith('_SECONDS') || key.endsWith('_TIMEOUT')) return 's'
  if (key.endsWith('_HOURS')) return 'h'
  if (key.endsWith('_MINUTES')) return 'min'
  if (key.endsWith('_DAYS')) return 'days'
  return ''
}

// --- chips and state ------------------------------------------------------------------------

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export interface Chip {
  label: string
  tone: Tone
}

/** Where the value in effect comes from. */
export function sourceChip(row: SettingRow): Chip {
  switch (row.source) {
    case 'db':
      return { label: 'Saved here', tone: 'success' }
    case 'env':
      return { label: 'From .env', tone: 'info' }
    case 'default':
      return { label: 'Default', tone: 'neutral' }
    default:
      return { label: 'Not set', tone: 'warning' }
  }
}

/** The Dhan token's own expiry: expired, expiring inside the warning window, or nothing. */
export function expiryChip(row: SettingRow, now = Date.now()): Chip | null {
  if (!row.expires_at) return null
  const at = Date.parse(row.expires_at)
  if (Number.isNaN(at)) return null
  if (at <= now) return { label: 'Expired', tone: 'danger' }
  if (row.expires_soon) return { label: 'Expires soon', tone: 'warning' }
  return null
}

/** The group's last connection test. */
export function testChip(result: TestResult | undefined): Chip | null {
  if (!result) return null
  return result.ok
    ? { label: 'Test OK', tone: 'success' }
    : { label: 'Test failed', tone: 'danger' }
}

/** The rail's status dot for a category: its last test, or nothing tested yet. */
export function testDot(result: TestResult | undefined): 'ok' | 'failed' | 'none' {
  return !result ? 'none' : result.ok ? 'ok' : 'failed'
}

/** Credentials a category still needs: unset secrets nobody else fills in. */
export function missingCount(rows: SettingRow[]): number {
  return rows.filter((r) => r.is_secret && !r.is_set && !r.managed).length
}

export interface Category {
  category: string
  label: string
  icon: IconName
  note: string
  rows: SettingRow[]
  test?: TestResult
}

/** The categories in the server's order, each with its rows and last test. */
export function categoriesOf(list: SettingsList): Category[] {
  return list.categories.map((category) => ({
    category,
    label: CATEGORY_LABEL[category] ?? labelOf(category.toUpperCase()),
    icon: CATEGORY_ICON[category] ?? 'settings-2',
    note: CATEGORY_NOTE[category] ?? '',
    rows: list.settings.filter((s) => s.category === category),
    test: list.tests[category],
  }))
}

/** The setting a category's Test exercises: its first secret, else its first key. */
export function testKey(c: Pick<Category, 'rows'>): string | undefined {
  return (c.rows.find((r) => r.is_secret) ?? c.rows[0])?.key
}

/** Categories that have something to test (a credential). */
export function canTest(c: Pick<Category, 'rows'>): boolean {
  return c.rows.some((r) => r.is_secret)
}

export interface SearchHit {
  category: string
  row: SettingRow
  label: string
}

/** Settings whose key, label or description has every typed word, across categories. */
export function searchSettings(list: SettingsList | null, query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!list || !words.length) return []
  return list.settings
    .map((row) => ({ category: row.category, row, label: labelOf(row.key) }))
    .filter((h) => {
      const hay = `${h.row.key} ${h.label} ${h.row.description}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .slice(0, 20)
}

const ERRORS: Record<string, string> = {
  reauth_failed: 'That password was not accepted.',
  too_many_reauth_failures: 'Too many wrong passwords. Wait 15 minutes and try again.',
  rate_limited: 'Too many changes in a short time. Try again in a few minutes.',
  settings_key_missing: 'The server has no SETTINGS_MASTER_KEY, so nothing can be stored yet.',
  settings_key_invalid: 'The server’s SETTINGS_MASTER_KEY is not valid.',
  bootstrap_key: 'That key can only be set in the server’s .env.',
  not_in_db: 'It already comes from .env.',
}

/** A message for a refusal; the server's own detail never contains a value. */
export function refusal(code: string, detail: string | undefined, fallback: string): string {
  return ERRORS[code] ?? detail ?? fallback
}

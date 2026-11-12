// The pure half of Settings: chips, the category list, the cards each category is
// split into (with "Other" for keys the map does not know), labels, units and search.
import { describe, expect, it } from 'vitest'
import {
  categoriesOf,
  expiryChip,
  groupRows,
  labelOf,
  missingCount,
  refusal,
  searchSettings,
  sourceChip,
  testChip,
  testDot,
  testKey,
  unitOf,
  type SettingRow,
  type SettingsList,
} from './settings'

const row = (key: string, category: string, kind: string, over: Partial<SettingRow> = {}) =>
  ({
    key,
    category,
    description: key.toLowerCase(),
    kind,
    is_secret: kind === 'secret',
    requires_reauth: kind === 'secret',
    managed: false,
    is_set: false,
    masked: null,
    source: 'unset',
    ...over,
  }) as SettingRow

describe('chips', () => {
  it('says where the value comes from', () => {
    expect(sourceChip(row('A', 'ai', 'str', { source: 'db' }))).toEqual({
      label: 'Saved here',
      tone: 'success',
    })
    expect(sourceChip(row('A', 'ai', 'str', { source: 'env' })).label).toBe('From .env')
    expect(sourceChip(row('A', 'ai', 'str', { source: 'default' })).label).toBe('Default')
    expect(sourceChip(row('A', 'ai', 'str')).label).toBe('Not set')
  })

  it('warns before the Dhan token expires and says when it has', () => {
    const now = Date.parse('2026-11-12T10:00:00Z')
    const t = (expires_at: string, expires_soon = false) =>
      row('DHAN_SESSION_TOKEN', 'dhan', 'secret', { expires_at, expires_soon })
    expect(expiryChip(t('2026-11-12T09:00:00Z'), now)?.label).toBe('Expired')
    expect(expiryChip(t('2026-11-12T12:00:00Z', true), now)?.label).toBe('Expires soon')
    expect(expiryChip(t('2026-11-20T12:00:00Z'), now)).toBeNull()
  })

  it('shows the last test as a chip and as the rail dot', () => {
    const ok = { category: 'github', ok: true, detail: 'fine', tested_at: '2026-11-12T10:00:00Z' }
    expect(testChip(ok)?.label).toBe('Test OK')
    expect(testChip({ ...ok, ok: false })?.label).toBe('Test failed')
    expect(testDot(ok)).toBe('ok')
    expect(testDot({ ...ok, ok: false })).toBe('failed')
    expect(testDot(undefined)).toBe('none')
  })
})

describe('groupRows', () => {
  it('splits a category into its cards in the map order', () => {
    const rows = [
      row('AI_TRADE_MAX_LOSS_INR', 'ai', 'decimal'),
      row('ANTHROPIC_API_KEY', 'ai', 'secret'),
      row('AI_MODEL_MAIN', 'ai', 'str'),
      row('AI_DAILY_REPORT_CRON', 'ai', 'str'),
    ]
    expect(groupRows('ai', rows).map((g) => [g.title, g.rows.map((r) => r.key)])).toEqual([
      ['Credentials', ['ANTHROPIC_API_KEY']],
      ['Models', ['AI_MODEL_MAIN']],
      ['Trade limits', ['AI_TRADE_MAX_LOSS_INR']],
      ['Schedules', ['AI_DAILY_REPORT_CRON']],
    ])
  })

  it('puts a key the map does not know under "Other", so new backend keys still show', () => {
    const rows = [row('AI_MODEL_MAIN', 'ai', 'str'), row('AI_SOMETHING_NEW', 'ai', 'int')]
    const groups = groupRows('ai', rows)
    expect(groups.at(-1)).toEqual({ title: 'Other', rows: [rows[1]] })
    // A category the map has never heard of is one "Other" card.
    expect(groupRows('newcat', [row('NEW_KEY', 'newcat', 'str')]).map((g) => g.title)).toEqual([
      'Other',
    ])
  })
})

describe('labels and units', () => {
  it('names keys for people', () => {
    expect(labelOf('ANTHROPIC_API_KEY')).toBe('Anthropic API key')
    expect(labelOf('DHAN_FEED_STALE_SECONDS')).toBe('Feed stale')
    expect(labelOf('DHAN_BASE_URL')).toBe('Base URL')
    expect(labelOf('DHAN_RECONCILE_CRON')).toBe('Reconcile schedule')
  })

  it('reads the unit from the key, for numbers only', () => {
    expect(unitOf('AI_MONTHLY_BUDGET_USD', 'decimal')).toBe('USD')
    expect(unitOf('AI_TRADE_MAX_LOSS_INR', 'decimal')).toBe('₹')
    expect(unitOf('DHAN_HTTP_TIMEOUT', 'float')).toBe('s')
    expect(unitOf('DHAN_TOKEN_WARN_HOURS', 'float')).toBe('h')
    expect(unitOf('DHAN_SESSION_ALERT_MINUTES', 'int')).toBe('min')
    expect(unitOf('AI_MONTHLY_BUDGET_USD', 'str')).toBe('')
  })
})

describe('categories', () => {
  const list: SettingsList = {
    categories: ['ai', 'github'],
    encryption_ready: true,
    tests: {
      github: { category: 'github', ok: true, detail: 'ok', tested_at: '2026-11-12T10:00:00Z' },
    },
    settings: [
      row('AI_MODEL_MAIN', 'ai', 'str'),
      row('ANTHROPIC_API_KEY', 'ai', 'secret'),
      row('GITHUB_TOKEN', 'github', 'secret', { is_set: true, masked: '••••abcd' }),
    ],
  } as unknown as SettingsList

  it('keeps the server order, tests with the first secret, and counts missing credentials', () => {
    const cats = categoriesOf(list)
    expect(cats.map((c) => [c.category, c.label, c.icon])).toEqual([
      ['ai', 'AI', 'sparkles'],
      ['github', 'GitHub', 'github'],
    ])
    expect(testKey(cats[0])).toBe('ANTHROPIC_API_KEY')
    expect(missingCount(cats[0].rows)).toBe(1)
    expect(missingCount(cats[1].rows)).toBe(0)
    expect(cats[1].test?.ok).toBe(true)
  })

  it('searches keys, labels and descriptions across categories', () => {
    expect(searchSettings(list, 'anthropic key').map((h) => h.row.key)).toEqual([
      'ANTHROPIC_API_KEY',
    ])
    expect(searchSettings(list, 'github').map((h) => h.category)).toEqual(['github'])
    expect(searchSettings(list, '  ')).toEqual([])
  })
})

describe('refusal', () => {
  it('explains known codes and falls back to the server detail', () => {
    expect(refusal('reauth_failed', undefined, 'x')).toBe('That password was not accepted.')
    expect(refusal('other', 'server says', 'x')).toBe('server says')
    expect(refusal('other', undefined, 'fallback')).toBe('fallback')
  })
})

// The Settings overview blocks: a figure, what it is out of, one line of status, a
// corner hint and a tone — from the settings list, the last tests and AI usage only.
import { describe, expect, it } from 'vitest'
import { summarize, testLine } from './settingsOverview'
import type { Category, SettingRow } from './settings'

const NOW = Date.parse('2026-11-13T12:00:00Z')

const row = (key: string, kind: string, over: Partial<SettingRow> = {}) =>
  ({
    key,
    category: 'x',
    description: '',
    kind,
    is_secret: kind === 'secret',
    requires_reauth: kind === 'secret',
    managed: false,
    is_set: false,
    masked: null,
    source: 'unset',
    ...over,
  }) as SettingRow

const cat = (category: string, rows: SettingRow[], test?: Category['test']): Category => ({
  category,
  label: category,
  icon: 'sparkles',
  note: '',
  rows,
  test,
})

const USAGE = {
  month_start: '2026-11-01T00:00:00+05:30',
  resets_at: '2026-12-01T00:00:00+05:30',
  spent_usd: '84.20',
  limit_usd: '100',
  remaining_usd: '15.80',
  calls: 412,
  configured: true,
  budgets: [],
}

describe('summarize', () => {
  it('AI without a key is off, and counts it as missing (to do, not a fault)', () => {
    const s = summarize(cat('ai', [row('ANTHROPIC_API_KEY', 'secret')]), USAGE, NOW)
    expect(s).toMatchObject({ figure: 'Off', hint: '1 missing', tone: 'warn', meter: null })
  })

  it('AI with a key shows the month against its cap, warning from 80 %', () => {
    const rows = [
      row('ANTHROPIC_API_KEY', 'secret', { is_set: true, masked: '••••abcd' }),
      row('AI_MODEL_MAIN', 'str', { source: 'default', masked: '••••-5-5' }),
    ]
    const s = summarize(cat('ai', rows), USAGE, NOW)
    expect(s.figure).toBe('$84.20')
    expect(s.of).toBe('of $100.00 this month')
    expect(s.note).toBe('Opus 5.5 · 412 calls')
    expect(s.hint).toBe('84%')
    expect(s.tone).toBe('warn')
    expect(s.meter).toBeCloseTo(84.2)
    expect(summarize(cat('ai', rows), { ...USAGE, spent_usd: '100' }, NOW).tone).toBe('bad')
  })

  it('a credential category: set and tested, set but never tested, or missing', () => {
    const set = [row('GITHUB_TOKEN', 'secret', { is_set: true, masked: '••••wxyz' })]
    const ok = { category: 'github', ok: true, detail: 'ok', tested_at: '2026-11-13T10:00:00Z' }
    expect(summarize(cat('github', set, ok), null, NOW)).toMatchObject({
      figure: 'Set',
      of: '••••wxyz',
      note: 'Test OK 2h ago',
      hint: 'Test OK',
      tone: 'ok',
    })
    expect(summarize(cat('github', set, { ...ok, ok: false }), null, NOW)).toMatchObject({
      hint: 'Test failed',
      tone: 'bad',
    })
    expect(summarize(cat('mt5', set), null, NOW)).toMatchObject({
      note: 'Not tested yet',
      tone: 'idle',
    })
    expect(
      summarize(cat('discord', [row('DISCORD_WEBHOOK_URL', 'secret')]), null, NOW),
    ).toMatchObject({
      figure: 'Unset',
      hint: '1 missing',
      tone: 'warn',
    })
  })

  it('Dhan: an active session, an expired one, or not connected', () => {
    const session = (expires_at: string, expires_soon = false) =>
      row('DHAN_SESSION_TOKEN', 'secret', {
        is_set: true,
        managed: true,
        masked: '••••tok1',
        expires_at,
        expires_soon,
      })
    expect(summarize(cat('dhan', [session('2026-11-14T00:00:00Z')]), null, NOW)).toMatchObject({
      figure: 'Active',
      tone: 'ok',
    })
    expect(summarize(cat('dhan', [session('2026-11-13T18:00:00Z', true)]), null, NOW).tone).toBe(
      'warn',
    )
    expect(summarize(cat('dhan', [session('2026-11-13T06:00:00Z')]), null, NOW)).toMatchObject({
      figure: 'Expired',
      tone: 'bad',
    })
    expect(summarize(cat('dhan', [row('DHAN_CLIENT_ID', 'secret')]), null, NOW)).toMatchObject({
      figure: 'Off',
      of: 'not connected',
      tone: 'warn',
    })
  })

  it('Agents: image generation on or off, from the switch’s mask', () => {
    const on = row('AGENT_IMAGE_ENABLED', 'bool', { masked: '••••true' })
    expect(summarize(cat('agents', [on]), null, NOW).figure).toBe('On')
    const off = row('AGENT_IMAGE_ENABLED', 'bool', { masked: '••••alse' })
    expect(summarize(cat('agents', [off]), null, NOW).figure).toBe('Off')
  })

  it('says how long ago a test ran', () => {
    const t = (iso: string) => ({ category: 'x', ok: true, detail: '', tested_at: iso })
    expect(testLine(t('2026-11-13T11:59:40Z'), NOW)).toBe('Test OK just now')
    expect(testLine(t('2026-11-13T11:30:00Z'), NOW)).toBe('Test OK 30m ago')
    expect(testLine(t('2026-11-11T12:00:00Z'), NOW)).toBe('Test OK 2d ago')
    expect(testLine(undefined, NOW)).toBe('')
  })
})

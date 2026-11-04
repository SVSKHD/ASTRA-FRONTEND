import { describe, expect, it } from 'vitest'
import {
  expiryChip,
  groupSettings,
  refusal,
  sourceChip,
  testChip,
  testKey,
  type SettingRow,
  type SettingsList,
} from '@/control/settings'

function row(over: Partial<SettingRow> = {}): SettingRow {
  return {
    key: 'GITHUB_TOKEN',
    category: 'github',
    description: '',
    kind: 'secret',
    is_secret: true,
    requires_reauth: true,
    is_set: true,
    masked: '••••abcd',
    source: 'db',
    ...over,
  } as SettingRow
}

describe('settings chips', () => {
  it('says where the value comes from', () => {
    expect(sourceChip(row()).label).toBe('Set')
    expect(sourceChip(row({ source: 'env' })).label).toBe('From .env')
    expect(sourceChip(row({ source: 'default' })).label).toBe('Default')
    expect(sourceChip(row({ source: 'unset', is_set: false })).label).toBe('Not set')
  })

  it('warns before the Dhan token expires and says when it has', () => {
    const now = Date.parse('2026-11-04T10:00:00Z')
    expect(
      expiryChip(row({ expires_at: '2026-11-04T12:00:00Z', expires_soon: true }), now),
    ).toEqual({ label: 'Expires soon', tone: 'warning' })
    expect(expiryChip(row({ expires_at: '2026-11-04T09:00:00Z' }), now)?.label).toBe('Expired')
    expect(
      expiryChip(row({ expires_at: '2026-11-06T09:00:00Z', expires_soon: false }), now),
    ).toBeNull()
    expect(expiryChip(row(), now)).toBeNull()
  })

  it('shows the last test', () => {
    const at = '2026-11-04T10:00:00Z'
    expect(testChip({ category: 'github', ok: true, detail: '', tested_at: at })?.label).toBe(
      'Test OK',
    )
    expect(testChip({ category: 'github', ok: false, detail: '', tested_at: at })?.label).toBe(
      'Test failed',
    )
    expect(testChip(undefined)).toBeNull()
  })
})

describe('groupSettings', () => {
  it('groups in the server order and tests with the first secret', () => {
    const list = {
      categories: ['openrouter', 'github'],
      settings: [
        row({ key: 'OPENROUTER_ENABLED', category: 'openrouter', is_secret: false }),
        row({ key: 'OPENROUTER_API_KEY', category: 'openrouter' }),
        row(),
      ],
      tests: {},
      encryption_ready: true,
    } as SettingsList
    const groups = groupSettings(list)
    expect(groups.map((g) => g.label)).toEqual(['OpenRouter', 'GitHub'])
    expect(testKey(groups[0])).toBe('OPENROUTER_API_KEY')
    expect(testKey(groups[1])).toBe('GITHUB_TOKEN')
  })
})

describe('refusal', () => {
  it('explains known codes and falls back to the server detail', () => {
    expect(refusal('reauth_failed', 'x', 'y')).toMatch(/password/)
    expect(refusal('invalid_value', 'DHAN_BASE_URL must be https', 'y')).toBe(
      'DHAN_BASE_URL must be https',
    )
    expect(refusal('', undefined, 'Failed')).toBe('Failed')
  })
})

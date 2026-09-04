import { describe, expect, it } from 'vitest'
import { PRIMARY_TABS, SECONDARY_TABS, TABS, TAB_ORDER, tabLabel } from '@/tabs.config'

describe('tabs.config', () => {
  it('lists all sections in a stable order', () => {
    expect(TAB_ORDER).toEqual([
      'overview',
      'todo',
      'tasks',
      'goals',
      'planning',
      'deadlines',
      'reminders',
      'finances',
      'trips',
      'ideas',
      'stocks',
      'trades',
      'expenses',
      'ai',
      'bots',
      'github',
      'wallets',
      'calendar',
    ])
  })

  it('marks exactly five primary tabs for the bottom bar', () => {
    expect(PRIMARY_TABS.map((t) => t.key)).toEqual([
      'overview',
      'todo',
      'tasks',
      'reminders',
      'finances',
    ])
  })

  it('routes the remaining tabs into the More sheet', () => {
    expect(SECONDARY_TABS.map((t) => t.key)).toEqual([
      'goals',
      'planning',
      'deadlines',
      'trips',
      'ideas',
      'stocks',
      'trades',
      'expenses',
      'ai',
      'bots',
      'github',
      'wallets',
      'calendar',
    ])
  })

  it('primary and secondary together cover every tab with no overlap', () => {
    const combined = [...PRIMARY_TABS, ...SECONDARY_TABS].map((t) => t.key).sort()
    expect(combined).toEqual([...TAB_ORDER].sort())
  })

  it('tabLabel resolves a key to its display label', () => {
    expect(tabLabel('overview')).toBe('Overview')
    expect(tabLabel('finances')).toBe('Finances')
  })

  it('every tab has a non-empty label', () => {
    for (const t of TABS) expect(t.label.length).toBeGreaterThan(0)
  })
})

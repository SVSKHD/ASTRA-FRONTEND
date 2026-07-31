import { describe, expect, it } from 'vitest'
import { buildAiContext, SUGGESTION_CHIPS, titleFromMessage, type AiContextInput } from '@/utils/ai'

function input(over: Partial<AiContextInput> = {}): AiContextInput {
  return {
    overdueTodos: [],
    todayTodos: [],
    overdueTasks: [],
    upcomingReminders: [],
    income: 0,
    spent: 0,
    remaining: 0,
    trips: [],
    noteTitles: [],
    bots: [],
    ...over,
  }
}

describe('buildAiContext', () => {
  it('includes populated sections and omits empty ones', () => {
    const ctx = buildAiContext(
      input({
        overdueTodos: ['File GST', 'Call bank'],
        income: 85000,
        spent: 42300,
        remaining: 42700,
        bots: [{ name: 'Aureon Hedge', status: 'running', enabled: true }],
      }),
    )
    expect(ctx).toContain('Overdue todos')
    expect(ctx).toContain('File GST')
    expect(ctx).toContain('This month (INR)')
    expect(ctx).toContain('Aureon Hedge — running (enabled)')
    // Nothing for the empty buckets.
    expect(ctx).not.toContain('Active trips')
    expect(ctx).not.toContain('Recent notes')
  })

  it('caps the block length', () => {
    const many = Array.from({ length: 500 }, (_, i) => 'todo number ' + i)
    const ctx = buildAiContext(input({ overdueTodos: many }), 500)
    expect(ctx.length).toBeLessThanOrEqual(500)
    expect(ctx.endsWith('…')).toBe(true)
  })
})

describe('titleFromMessage', () => {
  it('takes the first line, a few words', () => {
    expect(titleFromMessage('Summarise my overdue todos please\nand more')).toBe(
      'Summarise my overdue todos please',
    )
    expect(titleFromMessage('')).toBe('New chat')
  })
})

describe('SUGGESTION_CHIPS', () => {
  it('offers four starters', () => {
    expect(SUGGESTION_CHIPS).toHaveLength(4)
  })
})

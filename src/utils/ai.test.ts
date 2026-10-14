import { describe, expect, it } from 'vitest'
import {
  buildAiContext,
  aiActionDraft,
  nextSlot,
  parseAiReply,
  SUGGESTION_CHIPS,
  titleFromMessage,
  type AiContextInput,
} from '@/utils/ai'

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

describe('parseAiReply', () => {
  it('lifts follow-ups written as bare JSON with no fence', () => {
    const r = parseAiReply(
      'Can I help with anything?\n{"followups":["What are my upcoming reminders?","Add a new note"]}',
    )
    expect(r.parts).toEqual([{ kind: 'text', text: 'Can I help with anything?' }])
    expect(r.followups).toEqual(['What are my upcoming reminders?', 'Add a new note'])
  })

  it('reads ```aureon and ```json fences, and places the plan where it sits', () => {
    const r = parseAiReply(
      'First:\n```aureon\n{"steps":[{"text":"A","mins":25}],"target":"CRM"}\n```\nThen.\n```json\n{"followups":["Next?"]}\n```',
    )
    expect(r.parts.map((p) => p.kind)).toEqual(['text', 'plan', 'text'])
    expect(r.parts[1]).toEqual({
      kind: 'plan',
      plan: { steps: [{ text: 'A', mins: 25 }], target: 'CRM' },
    })
    expect(r.followups).toEqual(['Next?'])
  })

  it('leaves an ordinary code fence as text', () => {
    const r = parseAiReply('Run:\n```\nnpm test\n```')
    expect(r.parts).toHaveLength(1)
    expect(r.parts[0]).toMatchObject({ kind: 'text' })
    expect((r.parts[0] as { text: string }).text).toContain('npm test')
  })

  it('hides a block that is still streaming', () => {
    expect(parseAiReply('Sure.\n{"followups":["Wha').parts).toEqual([
      { kind: 'text', text: 'Sure.' },
    ])
    expect(parseAiReply('Sure.\n```aureon\n{"steps":[').parts).toEqual([
      { kind: 'text', text: 'Sure.' },
    ])
  })

  it('handles braces inside strings', () => {
    const r = parseAiReply('{"followups":["Use {curly} braces?"]}')
    expect(r.followups).toEqual(['Use {curly} braces?'])
    expect(r.parts).toEqual([])
  })
})

describe('aiActionDraft', () => {
  // Wed 14 Oct 2026, 14:10 local.
  const now = new Date(2026, 9, 14, 14, 10).getTime()

  it("uses the model's own suggestion for that kind", () => {
    const reply =
      'Block it out.\n```aureon\n{"actions":[{"type":"event","title":"CRM focus","when":"2026-10-15T10:00","mins":90,"notes":"Filter first"}]}\n```'
    expect(aiActionDraft('event', { reply, chatTitle: 'Chat', now })).toEqual({
      kind: 'event',
      title: 'CRM focus',
      when: '2026-10-15T10:00',
      mins: 90,
      notes: 'Filter first',
    })
  })

  it('falls back to the plan: its target, its steps and their total time', () => {
    const reply =
      '```aureon\n{"steps":[{"text":"A","mins":25},{"text":"B","mins":35}],"target":"Aquakart CRM"}\n```'
    const d = aiActionDraft('event', { reply, chatTitle: 'Chat', now })
    expect(d.title).toBe('Aquakart CRM')
    expect(d.notes).toBe('- A (25m)\n- B (35m)')
    expect(d.mins).toBe(60)
    expect(d.when).toBe('2026-10-14T15:00')
  })

  it('a note keeps the whole reply as plain text; a todo has no time', () => {
    const reply = 'You spent **₹74,350** this month.\n\n- Rent\n- Food'
    const note = aiActionDraft('note', { reply, chatTitle: 'Where did money go', now })
    expect(note.title).toBe('Where did money go')
    expect(note.notes).toContain('Rent')
    const todo = aiActionDraft('todo', { reply, chatTitle: 'New chat', now })
    expect(todo.title).toBe('You spent ₹74,350 this month')
    expect(todo.when).toBe('')
  })

  it('suggests 9am tomorrow late in the evening', () => {
    expect(nextSlot(new Date(2026, 9, 14, 21, 0).getTime())).toBe('2026-10-15T09:00')
  })
})

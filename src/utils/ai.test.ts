import { describe, expect, it } from 'vitest'
import {
  buildAiContext,
  aiActionDraft,
  nextSlot,
  parseAiReply,
  stepDescription,
  SUGGESTION_CHIPS,
  titleFromMessage,
  type AiContextInput,
} from '@/utils/ai'

function input(over: Partial<AiContextInput> = {}): AiContextInput {
  return {
    todos: [],
    tasks: [],
    calendar: [],
    upcomingReminders: [],
    income: 0,
    spent: 0,
    remaining: 0,
    trips: [],
    ideas: [],
    goals: [],
    stocks: [],
    noteTitles: [],
    bots: [],
    ...over,
  }
}

describe('buildAiContext', () => {
  it('includes populated sections and omits empty ones', () => {
    const ctx = buildAiContext(
      input({
        todos: ['File GST · overdue', 'Call bank'],
        income: 85000,
        spent: 42300,
        remaining: 42700,
        bots: [{ name: 'Aureon Hedge', status: 'running', enabled: true }],
      }),
    )
    expect(ctx).toContain('TODOS — open')
    expect(ctx).toContain('File GST · overdue')
    expect(ctx).toContain('This month (INR)')
    expect(ctx).toContain('Aureon Hedge — running (enabled)')
    // Nothing for the empty buckets.
    expect(ctx).not.toContain('Active trips')
    expect(ctx).not.toContain('Recent notes')
  })

  it('keeps todos, tasks, calendar and reminders in separate sections', () => {
    const ctx = buildAiContext(
      input({
        todos: ['Buy milk'],
        tasks: ['Ship CRM · due 2026-10-20'],
        calendar: ['Thu 15 Oct, 10:00–11:30 — Focus block (task)'],
        upcomingReminders: ['Pay rent — Fri 16 Oct, 09:00'],
      }),
    )
    const at = (s: string) => ctx.indexOf(s)
    expect(at('TODOS — open')).toBeLessThan(at('Buy milk'))
    expect(at('Buy milk')).toBeLessThan(at('TASKS — open'))
    expect(at('TASKS — open')).toBeLessThan(at('Ship CRM'))
    expect(at('Ship CRM')).toBeLessThan(at('CALENDAR'))
    expect(at('CALENDAR')).toBeLessThan(at('Focus block'))
    expect(at('Focus block')).toBeLessThan(at('REMINDERS'))
    expect(at('REMINDERS')).toBeLessThan(at('Pay rent'))
  })

  it('keeps sub-todos indented under their parent, bullet after the indent', () => {
    const ctx = buildAiContext(
      input({ todos: ['[todo:1] Launch site', '  [todo:2] Write copy', '    [todo:3] Hero line'] }),
    )
    expect(ctx).toContain(
      '- [todo:1] Launch site\n  - [todo:2] Write copy\n    - [todo:3] Hero line',
    )
  })

  it('caps the block length', () => {
    const many = Array.from({ length: 500 }, (_, i) => 'todo number ' + i)
    const ctx = buildAiContext(input({ todos: many }), 500)
    expect(ctx.length).toBeLessThanOrEqual(500)
    expect(ctx.endsWith('…')).toBe(true)
  })
})

describe('parseAiReply — new items', () => {
  it('reads a create block into a card of todos, tasks and goals', () => {
    const reply =
      'Here is a start:\n```aureon\n' +
      JSON.stringify({
        create: [
          {
            type: 'goal',
            title: 'Run a half marathon',
            due: '2027-03-01',
            notes: 'Under 2h15.',
            items: ['Buy shoes', 'Run 5 km'],
          },
          { type: 'task', title: 'Book physio', due: '2026-11-05T10:00', tag: '#health' },
          { type: 'todo', title: 'Stretch daily', due: '2026-11-01' },
          { type: 'idea', title: 'Not a creatable kind' },
          { type: 'task', title: '   ' },
        ],
      }) +
      '\n```\nTap to create them.'
    const r = parseAiReply(reply)
    const card = r.parts.find((p) => p.kind === 'create')
    expect(card && card.kind === 'create' && card.items).toEqual([
      {
        kind: 'goal',
        title: 'Run a half marathon',
        notes: 'Under 2h15.',
        due: '2027-03-01',
        items: ['Buy shoes', 'Run 5 km'],
      },
      // A time is trimmed to its day; the tag loses its "#".
      { kind: 'task', title: 'Book physio', due: '2026-11-05', tag: 'health' },
      // A todo has no due date of its own.
      { kind: 'todo', title: 'Stretch daily' },
    ])
    expect(r.parts.filter((p) => p.kind === 'text').length).toBe(2)
  })

  it('reads a bare create block with no fence', () => {
    const r = parseAiReply('Sure.\n{"create":[{"type":"todo","title":"Call mum"}]}')
    expect(r.parts.some((p) => p.kind === 'create')).toBe(true)
    expect(r.parts.some((p) => p.kind === 'text' && p.text.includes('create'))).toBe(false)
  })
})

describe('parseAiReply — description updates', () => {
  it('reads an updates block into its own card part', () => {
    const reply =
      'Here are descriptions for the two todos:\n```aureon\n' +
      '{"updates":[{"type":"todo","id":12,"description":"Renew before 2 Nov."},' +
      '{"type":"task","id":7,"description":"Ship the CRM filter fix."}]}\n```'
    const { parts } = parseAiReply(reply)
    expect(parts[0]).toEqual({ kind: 'text', text: 'Here are descriptions for the two todos:' })
    expect(parts[1]).toEqual({
      kind: 'updates',
      updates: [
        { kind: 'todo', id: 12, description: 'Renew before 2 Nov.' },
        { kind: 'task', id: 7, description: 'Ship the CRM filter fix.' },
      ],
    })
  })

  it('accepts a whole ref as the id, and drops unknown kinds or empty descriptions', () => {
    const reply =
      '```aureon\n{"updates":[{"id":"[idea:3]","description":"An app for X."},' +
      '{"type":"bot","id":1,"description":"nope"},{"type":"todo","id":2,"description":"  "}]}\n```'
    const { parts } = parseAiReply(reply)
    expect(parts).toEqual([
      { kind: 'updates', updates: [{ kind: 'idea', id: 3, description: 'An app for X.' }] },
    ])
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

describe('AI item details', () => {
  const fence = (o: unknown) => '```aureon\n' + JSON.stringify(o) + '\n```'

  it("keeps each plan step's notes, from notes, description or details", () => {
    const reply = fence({
      steps: [
        { text: 'A', mins: 20, notes: 'why A' },
        { title: 'B', description: 'why B' },
        { text: 'C', details: 'why C' },
        'D',
      ],
    })
    const plan = parseAiReply(reply).parts.find((p) => p.kind === 'plan')
    expect(plan?.kind === 'plan' && plan.plan.steps).toEqual([
      { text: 'A', mins: 20, notes: 'why A' },
      { text: 'B', notes: 'why B' },
      { text: 'C', notes: 'why C' },
      { text: 'D' },
    ])
  })

  it('stepDescription carries the notes and the estimate', () => {
    expect(stepDescription({ text: 'A', mins: 20, notes: 'why A' })).toBe(
      'why A\n\nEstimate: 20 min',
    )
    expect(stepDescription({ text: 'A' })).toBe('')
  })

  it('a todo draft never comes out with empty notes', () => {
    const draft = aiActionDraft('todo', {
      reply: 'Call **Ravi** about the Aquakart invoice of 12,400 before Friday.',
      chatTitle: 'Invoices',
      now: 0,
    })
    expect(draft.notes).toContain('12,400')
  })

  it('a todo draft joins the model notes and the plan steps with their details', () => {
    const reply =
      fence({ steps: [{ text: 'Draft email', mins: 10, notes: 'cc finance' }] }) +
      '\n' +
      fence({ actions: [{ type: 'todo', title: 'Chase invoice', notes: 'Invoice #88' }] })
    const draft = aiActionDraft('todo', { reply, chatTitle: '', now: 0 })
    expect(draft.title).toBe('Chase invoice')
    expect(draft.notes).toContain('Invoice #88')
    expect(draft.notes).toContain('- Draft email (10m)')
    expect(draft.notes).toContain('cc finance')
  })
})

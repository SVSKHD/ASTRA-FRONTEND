// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ask = vi.fn<(system: string, text: string) => Promise<string | null>>()
vi.mock('@/utils/autoCorrect', async (orig) => ({
  ...(await orig<typeof import('@/utils/autoCorrect')>()),
  askProofreader: (system: string, text: string) => ask(system, text),
}))

import { applyTypoFixes, parseSweepAnswer, scanForTypos, sweepSources } from '@/utils/typoSweep'

// A model that fixes a few known words in whatever it is sent.
const DICT: Record<string, string> = { teh: 'the', tomorow: 'tomorrow', recieve: 'receive' }
function fakeModel() {
  ask.mockImplementation(async (_s, text) => {
    const input = JSON.parse(text) as Record<string, string>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(input)) {
      const fixed = v.replace(/\b\w+\b/g, (w) => DICT[w] ?? w)
      if (fixed !== v) out[k] = fixed
    }
    return '```json\n' + JSON.stringify(out) + '\n```'
  })
}

function fakeApp() {
  const app = {
    todos: [{ id: 1, text: 'Call teh bank', description: '', status: 'pending' }],
    tasks: [
      { id: 2, title: 'Ship it', notes: '<p>Deploy <b>tomorow</b> morning</p>', status: 'pending' },
      { id: 3, title: 'Old teh task', notes: '', status: 'done' },
    ],
    goals: [{ id: 4, title: 'Read more', description: 'recieve books weekly', status: 'active' }],
    reminders: [{ id: 5, title: 'Pay teh rent', note: '', calEventId: 'ev1', cancelledAt: null }],
    updateTodo: vi.fn((_id: number, f: Record<string, string>) => Object.assign(app.todos[0], f)),
    patchTask: vi.fn((id: number, f: Record<string, string>) =>
      Object.assign(app.tasks.find((t) => t.id === id)!, f),
    ),
    updateGoal: vi.fn((_id: number, f: Record<string, string>) => Object.assign(app.goals[0], f)),
    updateReminder: vi.fn((_id: number, k: string, v: string) =>
      Object.assign(app.reminders[0], { [k]: v }),
    ),
    syncCalendar: vi.fn(async () => {}),
    showToastWithUndo: vi.fn(),
  }
  return app
}

// Braces matter: a function returned from beforeEach is run as its cleanup.
beforeEach(() => {
  ask.mockReset()
})

describe('parseSweepAnswer', () => {
  it('reads a fenced JSON object and drops non-string values', () => {
    expect(parseSweepAnswer('```json\n{"0":"a","1":2}\n```')).toEqual({ '0': 'a' })
    expect(parseSweepAnswer('{}')).toEqual({})
    expect(parseSweepAnswer('no idea')).toBeNull()
  })
})

describe('scanForTypos', () => {
  it('proposes fixes for titles and descriptions, keeping rich-text markup', async () => {
    fakeModel()
    const app = fakeApp()
    const sources = sweepSources(app as never, ['todo', 'task', 'goal', 'reminder'], false)
    // The finished task is left out unless asked for.
    expect(sources.some((s) => s.id === 3)).toBe(false)

    const fixes = await scanForTypos(sources, { signal: new AbortController().signal })
    const byKey = Object.fromEntries(fixes.map((f) => [f.key, f.after]))
    expect(byKey['todo:1:title']).toBe('Call the bank')
    expect(byKey['task:2:description']).toBe('<p>Deploy <b>tomorrow</b> morning</p>')
    expect(byKey['goal:4:description']).toBe('receive books weekly')
    expect(byKey['reminder:5:title']).toBe('Pay the rent')
    expect(byKey['task:2:title']).toBeUndefined()
  })

  it('rejects a rewrite instead of a fix', async () => {
    ask.mockResolvedValue('{"0":"This is an entirely different and much longer sentence now"}')
    const fixes = await scanForTypos(
      [{ kind: 'todo', id: 1, title: 'Buy milk', description: '' }],
      { signal: new AbortController().signal },
    )
    expect(fixes).toEqual([])
  })

  it('fails when the AI cannot be reached at all', async () => {
    ask.mockResolvedValue(null)
    await expect(
      scanForTypos([{ kind: 'todo', id: 1, title: 'Buy milk', description: '' }], {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow()
  })
})

describe('applyTypoFixes', () => {
  it('writes each fix, pushes synced reminders to the calendar, and undoes', async () => {
    fakeModel()
    const app = fakeApp()
    const fixes = await scanForTypos(sweepSources(app as never, ['todo', 'reminder'], false), {
      signal: new AbortController().signal,
    })
    expect(applyTypoFixes(app as never, fixes)).toBe(2)
    expect(app.todos[0].text).toBe('Call the bank')
    expect(app.reminders[0].title).toBe('Pay the rent')
    expect(app.syncCalendar).toHaveBeenCalledWith(5)

    const undo = app.showToastWithUndo.mock.calls[0][1] as () => void
    undo()
    expect(app.todos[0].text).toBe('Call teh bank')
  })

  it('skips a field edited since the scan', async () => {
    fakeModel()
    const app = fakeApp()
    const fixes = await scanForTypos(sweepSources(app as never, ['todo'], false), {
      signal: new AbortController().signal,
    })
    app.todos[0].text = 'Call the bank today'
    expect(applyTypoFixes(app as never, fixes)).toBe(0)
  })
})

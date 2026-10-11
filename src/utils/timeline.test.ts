import { describe, expect, it } from 'vitest'
import {
  groupTimelineByMonth,
  formatTimelineBody,
  linkedRows,
  sanitizeTimeline,
  searchTimeline,
  sortTimeline,
  timelineDayLabel,
  timelineForNote,
  timelineForTask,
  timelineLabel,
  timelinePreview,
} from '@/utils/timeline'
import type { TimelineEntry } from '@/types'

function entry(id: number, over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id,
    title: 'Entry ' + id,
    body: '',
    date: '2026-10-08',
    status: 'planned',
    taskIds: [],
    todoIds: [],
    noteIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('reading the stored list back', () => {
  it('keeps a well-formed entry as it is', () => {
    const e = entry(1, { body: '# Hi', status: 'shipped', taskIds: [3], noteIds: [4] })
    expect(sanitizeTimeline([e])).toEqual([e])
  })

  it('drops what cannot be an entry: no id, or neither title nor body', () => {
    expect(
      sanitizeTimeline([null, 'x', { title: 'no id' }, { id: 2, title: ' ', body: '  ' }]),
    ).toEqual([])
  })

  it('repairs rather than drops: a bad date, status or link list', () => {
    const at = new Date(2026, 0, 15).getTime()
    const [e] = sanitizeTimeline([
      {
        id: 1,
        title: 'x',
        date: '15/01/2026',
        status: 'nope',
        taskIds: [1, 1, 'a', 2],
        createdAt: at,
      },
    ])
    expect(e.date).toBe('2026-01-15')
    expect(e.status).toBe('planned')
    expect(e.taskIds).toEqual([1, 2])
    expect(e.noteIds).toEqual([])
  })

  it('reads a workspace with no timeline at all as an empty one', () => {
    expect(sanitizeTimeline(undefined)).toEqual([])
  })
})

describe('the line', () => {
  const list = [
    entry(1, { date: '2026-09-30' }),
    entry(2, { date: '2026-10-08', updatedAt: 1 }),
    entry(3, { date: '2026-10-08', updatedAt: 5 }),
    entry(4, { date: '2026-10-20' }),
  ]

  it('runs newest day first, and newest-touched first within a day', () => {
    expect(sortTimeline(list).map((e) => e.id)).toEqual([4, 3, 2, 1])
  })

  it('groups into months, newest month first', () => {
    const months = groupTimelineByMonth(list)
    expect(months.map((m) => m.key)).toEqual(['2026-10', '2026-09'])
    expect(months[0].items.map((e) => e.id)).toEqual([4, 3, 2])
    expect(months[1].label).toMatch(/2026/)
  })

  it('labels a card by its day, leaving the year to the month above it', () => {
    expect(timelineDayLabel('2026-10-08')).toMatch(/^8 /)
  })
})

describe('finding entries', () => {
  const list = [
    entry(1, { title: 'Checkout', taskIds: [10] }),
    entry(2, { title: 'Board', body: 'drag to **reassign**', taskIds: [10, 11], noteIds: [7] }),
    entry(3, { title: 'Other', taskIds: [12] }),
  ]

  it('searches the title, the body, and the titles of linked tasks', () => {
    const title = (id: number) => (id === 12 ? 'Payment gateway' : undefined)
    expect(searchTimeline(list, 'reassign').map((e) => e.id)).toEqual([2])
    expect(searchTimeline(list, 'gateway', title).map((e) => e.id)).toEqual([3])
    expect(searchTimeline(list, '  ')).toHaveLength(3)
  })

  it('answers "which entries is this task on" from the entries', () => {
    expect(
      timelineForTask(list, 10)
        .map((e) => e.id)
        .sort(),
    ).toEqual([1, 2])
    expect(timelineForTask(list, 99)).toEqual([])
    expect(timelineForNote(list, 7).map((e) => e.id)).toEqual([2])
  })
})

describe('what a card shows', () => {
  it('names an untitled entry by the first line of its write-up', () => {
    expect(timelineLabel({ title: '', body: 'First line\nsecond' })).toBe('First line second')
    expect(timelineLabel({ title: '', body: '' })).toBe('Untitled entry')
    expect(timelineLabel({ title: '  Mine ', body: 'x' })).toBe('Mine')
  })

  it('previews the markdown as plain text', () => {
    expect(timelinePreview('## What\n- [x] **Drag** to `reassign`')).toBe('What Drag to reassign')
  })
})

describe('linked checklists', () => {
  it('groups children by ancestry, tracks completion, and ignores deleted links', () => {
    const rows = linkedRows(
      [2, 99],
      [
        { id: 1, title: 'Board', parentId: null, done: false },
        { id: 2, title: 'Warnings', parentId: 1, done: true },
      ],
    )
    expect(rows).toEqual([{ id: 2, title: 'Warnings', path: ['Board'], done: true }])
    const body = formatTimelineBody(
      'My prose\r\n\r\n## Tasks\r\nOld checklist\r\n## Decisions\r\nKeep this',
      { tasks: rows, todos: [] },
    )
    expect(body).toContain('My prose')
    expect(body).toContain('## Decisions\nKeep this')
    expect(body).not.toContain('Old checklist')
    expect(body).toContain('### Board\n\n- [x] Warnings')
    expect(formatTimelineBody(body, { tasks: rows, todos: [] })).toBe(body)
    expect(formatTimelineBody(body, { tasks: [], todos: [] })).toBe(
      'My prose\n\n## Decisions\nKeep this',
    )
  })
})

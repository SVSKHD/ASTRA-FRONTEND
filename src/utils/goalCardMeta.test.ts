import { describe, expect, it } from 'vitest'
import { MAX_META_CHIPS, cardMeta, ringPercent, showRing, statusBadge } from '@/utils/goalCardMeta'

const none = { checklist: 0, tasks: 0, todos: 0 }

describe('the status badge (section 19b)', () => {
  it('says nothing for the default state', () => {
    // Every card showing ACTIVE told the reader nothing and cost the title the
    // width it needed.
    expect(statusBadge('active')).toBe(null)
  })

  it('names the states worth noticing', () => {
    expect(statusBadge('paused')).toBe('Paused')
    expect(statusBadge('done')).toBe('Done')
    expect(statusBadge('archived')).toBe('Archived')
  })
})

describe('the meta chips', () => {
  it('shows only counts above zero', () => {
    const meta = cardMeta({ checklist: 0, tasks: 3, todos: 0 }, null)
    expect(meta.chips.map((c) => c.text)).toEqual(['3 tasks'])
  })

  it('reports emptiness once rather than as three zeroes (acceptance 93)', () => {
    const meta = cardMeta(none, null)
    expect(meta.chips).toEqual([])
    expect(meta.empty).toBe(true)
  })

  it('is not empty just because it has no counts to show', () => {
    // A deadline is still something to say.
    const meta = cardMeta(none, { text: '3 days left', tone: 'ahead' })
    expect(meta.empty).toBe(true)
    expect(meta.chips.map((c) => c.text)).toEqual(['3 days left'])
  })

  it('leads with the deadline, then the biggest pile', () => {
    const meta = cardMeta(
      { checklist: 2, tasks: 9, todos: 5 },
      { text: 'due today', tone: 'today' },
    )
    expect(meta.chips.map((c) => c.text)).toEqual(['due today', '9 tasks', '5 todos'])
  })

  it('carries the deadline tone through, and nothing else', () => {
    const overdue = cardMeta({ ...none, tasks: 1 }, { text: '2 days overdue', tone: 'overdue' })
    expect(overdue.chips[0].tone).toBe('overdue')
    expect(overdue.chips[1].tone).toBe('plain')
    // "ahead" is the unremarkable case and gets no colour of its own.
    expect(cardMeta(none, { text: '9 days left', tone: 'ahead' }).chips[0].tone).toBe('plain')
  })

  it('counts one of something in the singular', () => {
    const meta = cardMeta({ checklist: 1, tasks: 1, todos: 0 }, null)
    expect(meta.chips.map((c) => c.text)).toEqual(['1 task', '1 point'])
  })

  it('keeps the row to one line and summarises the rest', () => {
    const meta = cardMeta(
      { checklist: 4, tasks: 9, todos: 5 },
      { text: 'due today', tone: 'today' },
    )
    expect(meta.chips).toHaveLength(MAX_META_CHIPS)
    expect(meta.overflow).toBe(1)
    expect(meta.overflowTitle).toBe('4 points')
  })

  it('drops nothing silently — the overflow tooltip lists what it hid', () => {
    const meta = cardMeta({ checklist: 4, tasks: 9, todos: 5 }, { text: 'x', tone: 'ahead' })
    const shown = meta.chips.map((c) => c.text).join(' · ')
    expect(`${shown} · ${meta.overflowTitle}`).toContain('4 points')
  })

  it('has no overflow when everything fits', () => {
    const meta = cardMeta({ checklist: 0, tasks: 2, todos: 0 }, null)
    expect(meta.overflow).toBe(0)
    expect(meta.overflowTitle).toBe('')
  })

  it('tolerates a counts object missing a key', () => {
    const meta = cardMeta({ tasks: 2 } as unknown as typeof none, null)
    expect(meta.chips.map((c) => c.text)).toEqual(['2 tasks'])
  })
})

describe('the progress ring', () => {
  it('is drawn only once there is progress to draw', () => {
    expect(showRing(0)).toBe(false)
    expect(showRing(0.01)).toBe(true)
    expect(showRing(1)).toBe(true)
  })

  it('survives a ratio that is not a number', () => {
    expect(showRing(Number.NaN)).toBe(false)
    expect(ringPercent(Number.NaN)).toBe('')
  })

  it('reads as a whole percentage inside the ring', () => {
    expect(ringPercent(0.5)).toBe('50%')
    expect(ringPercent(0.336)).toBe('34%')
    expect(ringPercent(1)).toBe('100%')
  })

  it('clamps rather than showing 140%', () => {
    expect(ringPercent(1.4)).toBe('100%')
    expect(ringPercent(-1)).toBe('0%')
  })
})

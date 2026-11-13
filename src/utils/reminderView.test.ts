import { describe, expect, it } from 'vitest'
import {
  defaultStart,
  draftPatch,
  formFromDraft,
  groupOf,
  presetOf,
  repeatOfPreset,
  timePresets,
  whenLabel,
} from './reminderView'
import type { Reminder } from '@/types'

// Wednesday 11 Nov 2026, 10:20 local.
const NOW = new Date(2026, 10, 11, 10, 20).getTime()
const rem = (start: string, repeat: Reminder['repeat'] = { type: 'none' }) =>
  ({ id: 1, title: 'x', note: '', start, repeat, priority: 'normal' }) as Reminder

describe('reminder groups', () => {
  it('files each reminder by when it rings next', () => {
    expect(groupOf(rem('2026-11-11T09:00'), NOW)).toBe('missed')
    expect(groupOf(rem('2026-11-11T18:00'), NOW)).toBe('today')
    expect(groupOf(rem('2026-11-12T09:00'), NOW)).toBe('tomorrow')
    expect(groupOf(rem('2026-11-15T09:00'), NOW)).toBe('week')
    expect(groupOf(rem('2026-12-25T09:00'), NOW)).toBe('later')
  })
  it('never calls a repeating reminder missed: it has a next time', () => {
    expect(groupOf(rem('2026-11-01T09:00', { type: 'days', n: 1 }), NOW)).toBe('tomorrow')
  })
})

describe('times', () => {
  it('reads today and tomorrow as words', () => {
    expect(whenLabel(new Date(2026, 10, 11, 15, 0).getTime(), NOW)).toMatch(/^Today /)
    expect(whenLabel(new Date(2026, 10, 12, 9, 0).getTime(), NOW)).toMatch(/^Tomorrow /)
  })
  it('defaults a new reminder to the next whole hour at least 30 minutes away', () => {
    expect(defaultStart(NOW)).toBe('2026-11-11T11:00')
    expect(defaultStart(new Date(2026, 10, 11, 10, 40).getTime())).toBe('2026-11-11T12:00')
  })
  it('offers tomorrow morning and next Monday', () => {
    const p = timePresets(NOW)
    expect(p.find((x) => x.label === 'Tomorrow 9 AM')?.value).toBe('2026-11-12T09:00')
    expect(p.find((x) => x.label === 'Next Monday')?.value).toBe('2026-11-16T09:00')
    expect(p.some((x) => x.label === 'This evening')).toBe(true)
  })
})

describe('repeat presets', () => {
  it('maps common repeats to presets and the rest to Custom', () => {
    expect(presetOf({ type: 'none' })).toBe('none')
    expect(presetOf({ type: 'days', n: 1 })).toBe('daily')
    expect(presetOf({ type: 'months', n: 1 })).toBe('monthly')
    expect(presetOf({ type: 'days', n: 3 })).toBe('custom')
    expect(presetOf({ type: 'weekdays', weekdays: [1] })).toBe('custom')
  })
  it('keeps a custom repeat when Custom is picked again', () => {
    const custom = { type: 'hours' as const, n: 4 }
    expect(repeatOfPreset('custom', custom)).toEqual(custom)
    expect(repeatOfPreset('custom', { type: 'none' })).toEqual({ type: 'days', n: 2 })
  })
})

describe('the create draft', () => {
  it('round-trips the form through the flat draft commitCreate reads', () => {
    const draft = {
      ...draftPatch({ title: 'Rent', repeat: { type: 'weekdays', weekdays: [1, 3] } }),
      start: '2026-11-12T09:00',
      priority: 'high',
    }
    expect(draft).toMatchObject({ repeatType: 'weekdays', weekdays: [1, 3] })
    expect(formFromDraft(draft)).toMatchObject({
      title: 'Rent',
      start: '2026-11-12T09:00',
      priority: 'high',
      repeat: { type: 'weekdays', weekdays: [1, 3] },
    })
  })
})

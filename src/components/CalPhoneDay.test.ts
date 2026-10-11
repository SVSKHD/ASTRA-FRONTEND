// The calendar on a phone: a day list under its week.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CalPhoneDay from '@/components/CalPhoneDay.vue'
import type { CalEvent } from '@/utils/calendarEvents'

// Thursday 8 October 2026, mid-morning.
const NOW = new Date(2026, 9, 8, 10, 0).getTime()
const at = (day: number, hour: number, min = 0) => new Date(2026, 9, day, hour, min).getTime()

function ev(id: string, patch: Partial<CalEvent>): CalEvent {
  return {
    id,
    source: 'task',
    refId: 1,
    title: id,
    subtitle: '',
    start: at(8, 9),
    end: at(8, 10),
    allDay: false,
    completed: false,
    barColor: '#888',
    editable: true,
    durationMins: 60,
    ...patch,
  }
}

const events = [
  ev('Install board', { start: at(8, 11), end: at(8, 12, 30), durationMins: 90 }),
  ev('Call vendor', { source: 'todo', start: at(8, 9), end: at(8, 9, 30), durationMins: 30 }),
  ev('Ping', { source: 'reminder', start: at(8, 17), end: at(8, 17, 15), durationMins: 15 }),
  ev('Read 20 pages', { source: 'goal', start: at(8, 0), end: at(9, 0), allDay: true }),
  ev('Tomorrow', { start: at(9, 9), end: at(9, 10) }),
]

const make = (selectedId: string | null = null) =>
  mount(CalPhoneDay, { props: { events, selectedId } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('the week strip', () => {
  it('asks for the week on screen, Monday to Monday', () => {
    const w = make()
    expect(w.emitted('range')?.[0]).toEqual([at(5, 0), at(12, 0)])
  })

  it('opens on today, and dots the days that have something on', () => {
    const w = make()
    const days = w.findAll('.cpd__day')
    expect(days).toHaveLength(7)
    expect(days[3].classes()).toContain('is-on')
    expect(days[3].find('.cpd__dot').classes()).toContain('is-busy')
    expect(days[4].find('.cpd__dot').classes()).toContain('is-busy')
    expect(days[0].find('.cpd__dot').classes()).not.toContain('is-busy')
  })
})

describe('the day', () => {
  it('lists the timed items in order, with all-day items as pills above', () => {
    const w = make()
    expect(w.findAll('.cpd__pill-t').map((p) => p.text())).toEqual(['Read 20 pages'])
    expect(w.findAll('.cpd__card-title').map((t) => t.text())).toEqual([
      'Call vendor',
      'Install board',
      'Ping',
    ])
    expect(w.find('.cpd__count').text()).toBe('4 items')
  })

  it('says when and how long beside each card; a reminder just reminds', () => {
    const w = make()
    expect(w.findAll('.cpd__time-h').map((t) => t.text())).toEqual(['9:00', '11:00', '17:00'])
    expect(w.findAll('.cpd__time-d').map((t) => t.text())).toEqual(['30m', '1h 30m', 'remind'])
    expect(w.findAll('.cpd__card-sub').map((t) => t.text())).toEqual([
      'Todo · 9:00–9:30',
      'Task · 11:00–12:30',
      'Reminder · 17:00',
    ])
  })

  it('moves to another day when one is tapped', async () => {
    const w = make()
    await w.findAll('.cpd__day')[4].trigger('click')
    expect(w.findAll('.cpd__card-title').map((t) => t.text())).toEqual(['Tomorrow'])
    expect(w.find('.cpd__today').exists()).toBe(true)
  })

  it('says so in a sentence when the day is empty', async () => {
    const w = make()
    await w.findAll('.cpd__day')[0].trigger('click')
    expect(w.find('.cpd__empty-title').text()).toBe('Nothing on this day')
  })

  it('selects on tap, and marks the selected card', async () => {
    const w = make('Install board')
    expect(w.findAll('.cpd__card')[1].classes()).toContain('is-on')
    await w.findAll('.cpd__card')[0].trigger('click')
    expect((w.emitted('select')?.[0]?.[0] as CalEvent).id).toBe('Call vendor')
  })
})

describe('swiping the strip', () => {
  it('changes week, keeping the weekday', async () => {
    const w = make()
    const strip = w.find('.cpd__strip')
    await strip.trigger('touchstart', { touches: [{ clientX: 300 }] })
    await strip.trigger('touchend', { changedTouches: [{ clientX: 100 }] })
    expect(w.emitted('range')?.at(-1)).toEqual([at(12, 0), at(19, 0)])
    expect(w.findAll('.cpd__day')[3].classes()).toContain('is-on')
  })
})
